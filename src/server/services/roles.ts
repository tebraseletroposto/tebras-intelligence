import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, outerCol, withAudit } from "@/db/client";
import { permissions, rolePermissions, roles, userRoles } from "@/db/schema";
import { ALL_PERMISSIONS, type Permission } from "@/lib/permissions";
import { roleSchema } from "@/lib/validation/admin";
import { zodFieldErrors } from "@/lib/validation/common";
import { assertCan, auditMeta, can, type AuthContext } from "../authz";
import { conflict, isPgUniqueViolation, notFound, ruleViolation, validation } from "../errors";

export async function listRoles(ctx: AuthContext) {
  if (!can(ctx, "admin.roles") && !can(ctx, "admin.users")) assertCan(ctx, "admin.roles");
  const db = getDb();
  const rows = await db
    .select({
      id: roles.id, key: roles.key, name: roles.name, description: roles.description, isSystem: roles.isSystem,
      userCount: sql<number>`(select count(*)::int from ${userRoles} ur where ur.role_id = ${outerCol("roles", "id")})`,
    })
    .from(roles)
    .orderBy(asc(roles.name));
  const perms = await db.select().from(rolePermissions);
  return rows.map((r) => ({ ...r, permissions: perms.filter((p) => p.roleId === r.id).map((p) => p.permissionKey as Permission) }));
}

export async function listPermissionCatalog() {
  return getDb().select().from(permissions).orderBy(asc(permissions.module), asc(permissions.key));
}

function parseRole(input: unknown) {
  const r = roleSchema.safeParse(input);
  if (!r.success) throw validation("Verifique os campos.", zodFieldErrors(r.error));
  const invalid = r.data.permissions.filter((p) => !ALL_PERMISSIONS.includes(p as Permission));
  if (invalid.length) throw validation(`Permissões inválidas: ${invalid.join(", ")}`);
  return r.data;
}

export async function createRole(ctx: AuthContext, input: unknown) {
  assertCan(ctx, "admin.roles");
  const data = parseRole(input);
  const key = data.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  try {
    return await withAudit(auditMeta(ctx), async (tx) => {
      const [r] = await tx.insert(roles).values({ key, name: data.name, description: data.description ?? null }).returning({ id: roles.id });
      if (data.permissions.length) await tx.insert(rolePermissions).values(data.permissions.map((permissionKey) => ({ roleId: r.id, permissionKey })));
      return r;
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) throw conflict("Já existe um perfil com nome equivalente.", { name: "Nome já utilizado." });
    throw e;
  }
}

export async function updateRole(ctx: AuthContext, id: string, input: unknown) {
  assertCan(ctx, "admin.roles");
  const data = parseRole(input);
  const db = getDb();
  const [role] = await db.select().from(roles).where(eq(roles.id, id)).limit(1);
  if (!role) throw notFound("Perfil não encontrado.");
  // O perfil Administrador mantém sempre todas as permissões (evita bloqueio total do sistema)
  if (role.key === "admin" && data.permissions.length !== ALL_PERMISSIONS.length)
    throw ruleViolation("O perfil Administrador deve manter todas as permissões.");
  await withAudit(auditMeta(ctx), async (tx) => {
    await tx.update(roles).set({ name: data.name, description: data.description ?? null }).where(eq(roles.id, id));
    const existing = (await tx.select({ k: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, id))).map((x) => x.k);
    const toRemove = existing.filter((k) => !data.permissions.includes(k));
    const toAdd = data.permissions.filter((k) => !existing.includes(k));
    if (toRemove.length) await tx.delete(rolePermissions).where(and(eq(rolePermissions.roleId, id), inArray(rolePermissions.permissionKey, toRemove)));
    if (toAdd.length) await tx.insert(rolePermissions).values(toAdd.map((permissionKey) => ({ roleId: id, permissionKey })));
  });
}
