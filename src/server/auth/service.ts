import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb, withAudit } from "@/db/client";
import {
  passwordResetTokens,
  permissions as permissionsTable,
  rolePermissions,
  roles,
  sessions,
  userRoles,
  users,
} from "@/db/schema";
import type { Permission } from "@/lib/permissions";
import { logEvent } from "../audit";
import type { AuthContext } from "../authz";
import { validation } from "../errors";
import {
  checkPasswordPolicy,
  generateToken,
  getDummyHash,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from "./crypto";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;
export const RESET_TOKEN_TTL_MINUTES = 60;

const sessionTtlMs = () => Number(process.env.SESSION_TTL_HOURS ?? 12) * 3600_000;

export type RequestMeta = { ip?: string | null; userAgent?: string | null };

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; mustChangePassword: boolean }
  | { ok: false; reason: "invalid" | "locked" | "inactive" };

/**
 * Autentica por e-mail e senha.
 * - Mensagem genérica para e-mail inexistente ou senha errada (não revela qual).
 * - Bloqueio temporário após MAX_FAILED_ATTEMPTS falhas consecutivas.
 * - Todas as tentativas são registradas na auditoria.
 */
export async function login(email: string, password: string, meta: RequestMeta): Promise<LoginResult> {
  const db = getDb();
  const normalized = email.trim().toLowerCase();
  const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${normalized}`).limit(1);

  if (!user) {
    await verifyPassword(await getDummyHash(), password); // equaliza tempo de resposta
    await logEvent({ action: "auth.login_failed", summary: "E-mail não cadastrado", after: { email: normalized }, ...meta });
    return { ok: false, reason: "invalid" };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    await logEvent({ userId: user.id, action: "auth.login_blocked", entityType: "users", entityId: user.id, summary: "Conta temporariamente bloqueada", ...meta });
    return { ok: false, reason: "locked" };
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : null;
    await db
      .update(users)
      .set({ failedLoginCount: lock ? 0 : failed, lockedUntil: lock })
      .where(eq(users.id, user.id));
    await logEvent({
      userId: user.id, action: "auth.login_failed", entityType: "users", entityId: user.id,
      summary: lock ? `Senha incorreta — conta bloqueada por ${LOCKOUT_MINUTES} min` : `Senha incorreta (${failed}/${MAX_FAILED_ATTEMPTS})`,
      ...meta,
    });
    return { ok: false, reason: lock ? "locked" : "invalid" };
  }

  if (!user.active) {
    await logEvent({ userId: user.id, action: "auth.login_failed", entityType: "users", entityId: user.id, summary: "Usuário inativo", ...meta });
    return { ok: false, reason: "inactive" };
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  await db.transaction(async (tx) => {
    await tx.insert(sessions).values({
      id: sha256Hex(token), userId: user.id, expiresAt,
      ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null,
    });
    await tx.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(users.id, user.id));
  });
  await logEvent({ userId: user.id, action: "auth.login", entityType: "users", entityId: user.id, summary: "Login realizado", ...meta });
  return { ok: true, token, expiresAt, mustChangePassword: user.mustChangePassword };
}

export type SessionUser = Omit<AuthContext, "ip" | "userAgent"> & { mustChangePassword: boolean; sessionId: string };

/** Valida o token do cookie e carrega usuário + permissões. Renova a expiração (sessão deslizante). */
export async function validateSession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null;
  const db = getDb();
  const id = sha256Hex(token);
  const now = new Date();
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)))
    .limit(1);
  if (!row || !row.user.active) return null;

  // Renova no máximo a cada 5 minutos para reduzir escritas
  if (now.getTime() - row.session.lastSeenAt.getTime() > 5 * 60_000) {
    await db
      .update(sessions)
      .set({ lastSeenAt: now, expiresAt: new Date(now.getTime() + sessionTtlMs()) })
      .where(eq(sessions.id, id));
  }

  const { roleKeys, permissionKeys } = await loadUserAccess(row.user.id);
  return {
    sessionId: id,
    userId: row.user.id,
    name: row.user.name,
    email: row.user.email,
    roles: roleKeys,
    permissions: new Set(permissionKeys),
    mustChangePassword: row.user.mustChangePassword,
  };
}

export async function loadUserAccess(userId: string) {
  const db = getDb();
  const roleRows = await db
    .select({ key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, userId));
  const permRows = await db
    .selectDistinct({ key: rolePermissions.permissionKey })
    .from(userRoles)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
    .innerJoin(permissionsTable, eq(permissionsTable.key, rolePermissions.permissionKey))
    .where(eq(userRoles.userId, userId));
  return { roleKeys: roleRows.map((r) => r.key), permissionKeys: permRows.map((r) => r.key as Permission) };
}

export async function logout(token: string | undefined | null, meta: RequestMeta) {
  if (!token) return;
  const db = getDb();
  const [s] = await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, sha256Hex(token)))
    .returning({ userId: sessions.userId });
  if (s) await logEvent({ userId: s.userId, action: "auth.logout", entityType: "users", entityId: s.userId, summary: "Logout", ...meta });
}

/** Revoga todas as sessões ativas de um usuário (troca de senha, desativação). */
export async function revokeAllSessions(userId: string, exceptSessionId?: string) {
  const db = getDb();
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.userId, userId),
        isNull(sessions.revokedAt),
        exceptSessionId ? sql`${sessions.id} <> ${exceptSessionId}` : undefined,
      ),
    );
}

/** Troca de senha pelo próprio usuário (exige a senha atual). */
export async function changeOwnPassword(
  user: { userId: string; email: string; sessionId: string },
  currentPassword: string,
  newPassword: string,
  meta: RequestMeta,
) {
  const db = getDb();
  const [u] = await db.select().from(users).where(eq(users.id, user.userId)).limit(1);
  if (!u || !(await verifyPassword(u.passwordHash, currentPassword)))
    throw validation("Verifique os campos.", { currentPassword: "Senha atual incorreta." });
  const policy = checkPasswordPolicy(newPassword, user.email);
  if (policy) throw validation("Verifique os campos.", { newPassword: policy });
  if (await verifyPassword(u.passwordHash, newPassword))
    throw validation("Verifique os campos.", { newPassword: "A nova senha deve ser diferente da atual." });

  await withAudit({ userId: user.userId, ...meta }, async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date() })
      .where(eq(users.id, user.userId));
  });
  await revokeAllSessions(user.userId, user.sessionId);
  await logEvent({ userId: user.userId, action: "auth.password_changed", entityType: "users", entityId: user.userId, summary: "Senha alterada pelo usuário", ...meta });
}

/**
 * Gera link de redefinição de senha (uso único, 60 min).
 * Enquanto não houver integração de e-mail configurada, o link é gerado por um administrador
 * e entregue ao usuário por canal seguro. O token em texto puro nunca é armazenado.
 */
export async function createPasswordResetToken(userId: string, createdBy: string | null) {
  const db = getDb();
  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000);
  // invalida tokens anteriores ainda não usados
  await db.update(passwordResetTokens).set({ usedAt: new Date() })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)));
  await db.insert(passwordResetTokens).values({ userId, tokenHash: sha256Hex(token), expiresAt, createdBy });
  await logEvent({ userId: createdBy, action: "auth.reset_link_created", entityType: "users", entityId: userId, summary: "Link de redefinição de senha gerado" });
  return { token, expiresAt };
}

export async function resetPasswordWithToken(token: string, newPassword: string, meta: RequestMeta) {
  const db = getDb();
  const [row] = await db
    .select({ t: passwordResetTokens, email: users.email, active: users.active })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(and(eq(passwordResetTokens.tokenHash, sha256Hex(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!row || !row.active) throw validation("Link inválido ou expirado. Solicite um novo ao administrador.");
  const policy = checkPasswordPolicy(newPassword, row.email);
  if (policy) throw validation("Verifique os campos.", { newPassword: policy });

  await withAudit({ userId: row.t.userId, ...meta }, async (tx) => {
    await tx.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, row.t.id));
    await tx
      .update(users)
      .set({ passwordHash: await hashPassword(newPassword), mustChangePassword: false, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
      .where(eq(users.id, row.t.userId));
  });
  await revokeAllSessions(row.t.userId);
  await logEvent({ userId: row.t.userId, action: "auth.password_reset", entityType: "users", entityId: row.t.userId, summary: "Senha redefinida via link", ...meta });
}
