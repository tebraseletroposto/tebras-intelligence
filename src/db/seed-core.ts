import { eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "./client";
import { intelModelVersions, permissions, rolePermissions, roles } from "./schema";
import { DEFAULT_INDEX_CONFIG } from "@/lib/intel/potential-index";
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS } from "@/lib/permissions";

/** Sincroniza permissões e cria os perfis padrão (idempotente). O Administrador sempre recebe todas as permissões. */
export async function syncAccessControl(db: Db) {
  await db.transaction(async (tx) => {
    for (const key of ALL_PERMISSIONS) {
      const { module, description } = PERMISSIONS[key];
      await tx.insert(permissions).values({ key, module, description }).onConflictDoUpdate({ target: permissions.key, set: { module, description } });
    }
    await tx.delete(permissions).where(notInArray(permissions.key, ALL_PERMISSIONS));
    for (const [key, def] of Object.entries(DEFAULT_ROLES)) {
      const [existing] = await tx.select().from(roles).where(eq(roles.key, key)).limit(1);
      if (!existing) {
        const [r] = await tx.insert(roles).values({ key, name: def.name, description: def.description, isSystem: true }).returning({ id: roles.id });
        await tx.insert(rolePermissions).values(def.permissions.map((permissionKey) => ({ roleId: r.id, permissionKey })));
      } else if (key === "admin") {
        const have = (await tx.select({ k: rolePermissions.permissionKey }).from(rolePermissions).where(eq(rolePermissions.roleId, existing.id))).map((x) => x.k);
        const missing = ALL_PERMISSIONS.filter((p) => !have.includes(p));
        if (missing.length) await tx.insert(rolePermissions).values(missing.map((permissionKey) => ({ roleId: existing.id, permissionKey })));
      }
    }
  });
  const count = await db.select().from(roles).where(inArray(roles.key, Object.keys(DEFAULT_ROLES)));
  return { permissions: ALL_PERMISSIONS.length, roles: count.length };
}

/** Versão inicial (hipótese de modelagem) da configuração do Índice de Potencial. */
export async function seedIntelModels(db: Db) {
  const [exists] = await db.select({ id: intelModelVersions.id }).from(intelModelVersions).where(eq(intelModelVersions.kind, "potential_index")).limit(1);
  if (!exists) await db.insert(intelModelVersions).values({ kind: "potential_index", version: "indice-v1", config: DEFAULT_INDEX_CONFIG, active: true, notes: "Pesos iniciais definidos como HIPÓTESE de modelagem, sem calibração empírica." });
}

export async function seedDefaults(db: Db) {
  const access = await syncAccessControl(db);
  await seedIntelModels(db);
  return access;
}
