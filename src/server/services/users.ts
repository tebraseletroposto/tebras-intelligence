import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, outerCol, withAudit } from "@/db/client";
import { roles, userRoles, users } from "@/db/schema";
import { userCreateSchema, userUpdateSchema } from "@/lib/validation/admin";
import { zodFieldErrors } from "@/lib/validation/common";
import { assertCan, auditMeta, type AuthContext } from "../authz";
import { checkPasswordPolicy, hashPassword } from "../auth/crypto";
import { createPasswordResetToken, revokeAllSessions } from "../auth/service";
import { conflict, isPgUniqueViolation, notFound, ruleViolation, validation } from "../errors";

export async function listUsers(ctx: AuthContext) {
  assertCan(ctx, "admin.users");
  const db = getDb();
  const rows = await db
    .select({
      id: users.id, name: users.name, email: users.email, active: users.active, lastLoginAt: users.lastLoginAt,
      lockedUntil: users.lockedUntil, mustChangePassword: users.mustChangePassword, createdAt: users.createdAt,
      roles: sql<string[]>`coalesce((select array_agg(r.name order by r.name) from ${userRoles} ur join ${roles} r on r.id = ur.role_id where ur.user_id = ${outerCol("users", "id")}), '{}')`,
    })
    .from(users)
    .orderBy(asc(users.name));
  return rows;
}

export async function getUser(ctx: AuthContext, id: string) {
  assertCan(ctx, "admin.users");
  const db = getDb();
  const [u] = await db
    .select({ id: users.id, name: users.name, email: users.email, active: users.active, lastLoginAt: users.lastLoginAt, lockedUntil: users.lockedUntil, mustChangePassword: users.mustChangePassword })
    .from(users).where(eq(users.id, id)).limit(1);
  if (!u) throw notFound("Usuário não encontrado.");
  const r = await db.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, id));
  return { ...u, roleIds: r.map((x) => x.roleId) };
}

async function assertRolesExist(roleIds: string[]) {
  const found = await getDb().select({ id: roles.id }).from(roles).where(inArray(roles.id, roleIds));
  if (found.length !== new Set(roleIds).size) throw validation("Perfil inválido.", { roleIds: "Perfil inexistente." });
}

export async function createUser(ctx: AuthContext, input: unknown) {
  assertCan(ctx, "admin.users");
  const parsed = userCreateSchema.safeParse(input);
  if (!parsed.success) throw validation("Verifique os campos.", zodFieldErrors(parsed.error));
  const data = parsed.data;
  const policy = checkPasswordPolicy(data.temporaryPassword, data.email);
  if (policy) throw validation("Verifique os campos.", { temporaryPassword: policy });
  await assertRolesExist(data.roleIds);
  try {
    return await withAudit(auditMeta(ctx), async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ name: data.name, email: data.email, passwordHash: await hashPassword(data.temporaryPassword), mustChangePassword: true })
        .returning({ id: users.id });
      await tx.insert(userRoles).values(data.roleIds.map((roleId) => ({ userId: u.id, roleId, grantedBy: ctx.userId })));
      return u;
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) throw conflict("Já existe um usuário com este e-mail.", { email: "E-mail já cadastrado." });
    throw e;
  }
}

export async function updateUser(ctx: AuthContext, id: string, input: unknown) {
  assertCan(ctx, "admin.users");
  const parsed = userUpdateSchema.safeParse(input);
  if (!parsed.success) throw validation("Verifique os campos.", zodFieldErrors(parsed.error));
  const data = parsed.data;
  await assertRolesExist(data.roleIds);
  const db = getDb();

  // Regras de proteção contra perda de acesso administrativo
  if (id === ctx.userId && !data.active) throw ruleViolation("Você não pode desativar o seu próprio usuário.");
  const adminRole = (await db.select({ id: roles.id }).from(roles).where(eq(roles.key, "admin")))[0];
  if (adminRole && !(data.active && data.roleIds.includes(adminRole.id))) {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(userRoles)
      .innerJoin(users, eq(users.id, userRoles.userId))
      .where(and(eq(userRoles.roleId, adminRole.id), eq(users.active, true), sql`${users.id} <> ${id}`));
    if (n === 0) throw ruleViolation("O sistema precisa de pelo menos um administrador ativo.");
  }

  try {
    await withAudit(auditMeta(ctx), async (tx) => {
      const r = await tx.update(users).set({ name: data.name, email: data.email, active: data.active }).where(eq(users.id, id)).returning({ id: users.id });
      if (!r.length) throw notFound("Usuário não encontrado.");
      const existing = (await tx.select({ roleId: userRoles.roleId }).from(userRoles).where(eq(userRoles.userId, id))).map((x) => x.roleId);
      const toRemove = existing.filter((x) => !data.roleIds.includes(x));
      const toAdd = data.roleIds.filter((x) => !existing.includes(x));
      if (toRemove.length) await tx.delete(userRoles).where(and(eq(userRoles.userId, id), inArray(userRoles.roleId, toRemove)));
      if (toAdd.length) await tx.insert(userRoles).values(toAdd.map((roleId) => ({ userId: id, roleId, grantedBy: ctx.userId })));
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) throw conflict("Já existe um usuário com este e-mail.", { email: "E-mail já cadastrado." });
    throw e;
  }
  if (!data.active) await revokeAllSessions(id);
}

export async function unlockUser(ctx: AuthContext, id: string) {
  assertCan(ctx, "admin.users");
  await withAudit(auditMeta(ctx), (tx) => tx.update(users).set({ lockedUntil: null, failedLoginCount: 0 }).where(eq(users.id, id)));
}

export async function generateResetLink(ctx: AuthContext, id: string) {
  assertCan(ctx, "admin.users");
  const u = await getUser(ctx, id);
  if (!u.active) throw ruleViolation("Usuário inativo. Reative antes de gerar o link.");
  const { token, expiresAt } = await createPasswordResetToken(id, ctx.userId);
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return { url: `${base}/redefinir-senha?token=${encodeURIComponent(token)}`, expiresAt };
}
