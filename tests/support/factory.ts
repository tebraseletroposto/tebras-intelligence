import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { getDb } from "@/db/client";
import { roles, userRoles, users } from "@/db/schema";
import type { AuthContext } from "@/server/authz";
import { hashPassword } from "@/server/auth/crypto";
import { loadUserAccess } from "@/server/auth/service";

export const TEST_PASSWORD = "SenhaTeste2026";

/** Cria um usuário real no banco de testes com os perfis indicados e devolve seu contexto. */
export async function makeUser(roleKeys: string[], opts: { password?: string; active?: boolean } = {}) {
  const db = getDb();
  const email = `u-${randomUUID().slice(0, 8)}@teste.local`;
  const [u] = await db.insert(users).values({ name: `Usuário ${roleKeys.join("+")}`, email, passwordHash: await hashPassword(opts.password ?? TEST_PASSWORD), active: opts.active ?? true }).returning();
  for (const key of roleKeys) {
    const [r] = await db.select().from(roles).where(eq(roles.key, key));
    await db.insert(userRoles).values({ userId: u.id, roleId: r.id });
  }
  return { user: u, ctx: await contextFor(u.id) };
}

export async function contextFor(userId: string): Promise<AuthContext> {
  const [u] = await getDb().select().from(users).where(eq(users.id, userId));
  const access = await loadUserAccess(userId);
  return { userId, name: u.name, email: u.email, roles: access.roleKeys, permissions: new Set(access.permissionKeys), ip: "127.0.0.1", userAgent: "vitest" };
}

export const uniqueCnpj = () => {
  // Gera CNPJ numérico válido aleatório
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const dv = (len: number, d: number[]) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = d.slice(0, len).reduce((s, v, i) => s + v * w[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  base.push(dv(12, base));
  base.push(dv(13, base));
  return base.join("");
};
