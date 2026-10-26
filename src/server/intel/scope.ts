import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, type Tx } from "@/db/client";
import { intelMemberships, intelOrganizations } from "@/db/schema";
import type { AuthContext } from "../authz";
import { forbidden } from "../errors";

/**
 * Escopo multiempresa do Tebras Intelligence.
 *
 * Regras (verificadas SEMPRE no servidor; a interface apenas reflete):
 *  - Permissão `inteligencia.admin` ou vínculo `admin_global` → acesso global (todas as organizações).
 *  - Demais usuários → somente organizações às quais estão vinculados (intel_memberships).
 *  - Edição exige `inteligencia.edit` E papel na organização diferente de "consulta".
 *  - Toda transação define app.intel_orgs / app.intel_global para as políticas RLS do banco.
 */

export type OrgMembership = { organizationId: string; role: string; name: string; isDemo: boolean; kind: string };

export type IntelScope = {
  global: boolean;
  orgIds: string[];
  memberships: OrgMembership[];
  /** Organização ativa (seleção do usuário, validada). */
  currentOrgId: string | null;
  currentOrg: OrgMembership | null;
};

export const ORG_COOKIE = "intel_org";

/** Organização escolhida no seletor (cookie). Fora de uma requisição (scripts/testes) não há seleção. */
async function selectedOrgFromCookie(): Promise<string | null> {
  try {
    const { cookies } = await import("next/headers");
    return (await cookies()).get(ORG_COOKIE)?.value ?? null;
  } catch { return null; }
}

export async function loadScope(ctx: AuthContext, requestedOrgId?: string | null): Promise<IntelScope> {
  if (requestedOrgId === undefined) requestedOrgId = await selectedOrgFromCookie();
  if (!ctx.permissions.has("inteligencia.view") && !ctx.permissions.has("inteligencia.admin")) throw forbidden();
  const db = getDb();
  const rows = await db.select({ organizationId: intelMemberships.organizationId, role: intelMemberships.role, name: intelOrganizations.name, isDemo: intelOrganizations.isDemo, kind: intelOrganizations.kind })
    .from(intelMemberships).innerJoin(intelOrganizations, eq(intelOrganizations.id, intelMemberships.organizationId))
    .where(and(eq(intelMemberships.userId, ctx.userId), eq(intelOrganizations.active, true))).orderBy(asc(intelOrganizations.name));
  const global = ctx.permissions.has("inteligencia.admin") || rows.some((r) => r.role === "admin_global");
  let memberships: OrgMembership[] = rows;
  if (global) {
    const all = await db.select({ organizationId: intelOrganizations.id, name: intelOrganizations.name, isDemo: intelOrganizations.isDemo, kind: intelOrganizations.kind }).from(intelOrganizations).where(eq(intelOrganizations.active, true)).orderBy(asc(intelOrganizations.kind), asc(intelOrganizations.name));
    memberships = all.map((o) => ({ ...o, role: rows.find((r) => r.organizationId === o.organizationId)?.role ?? "admin_global" }));
  }
  const orgIds = memberships.map((m) => m.organizationId);
  const pick = (requestedOrgId && memberships.find((m) => m.organizationId === requestedOrgId)) || memberships.find((m) => !m.isDemo) || memberships[0] || null;
  return { global, orgIds, memberships, currentOrgId: pick?.organizationId ?? null, currentOrg: pick };
}

export function canEditOrg(ctx: AuthContext, scope: IntelScope, orgId: string) {
  if (!ctx.permissions.has("inteligencia.edit") && !ctx.permissions.has("inteligencia.admin")) return false;
  const m = scope.memberships.find((x) => x.organizationId === orgId);
  if (!m) return false;
  return m.role !== "consulta";
}

export function assertOrgVisible(scope: IntelScope, orgId: string) {
  if (!scope.global && !scope.orgIds.includes(orgId)) throw forbidden("Registro de outra organização.");
}

export function assertCanEditOrg(ctx: AuthContext, scope: IntelScope, orgId: string) {
  assertOrgVisible(scope, orgId);
  if (!canEditOrg(ctx, scope, orgId)) throw forbidden("Seu papel nesta organização não permite edição.");
}

export function requireCurrentOrg(scope: IntelScope): string {
  if (!scope.currentOrgId) throw forbidden("Você não está vinculado a nenhuma organização do Tebras Intelligence. Solicite o vínculo a um administrador.");
  return scope.currentOrgId;
}

/** Transação com contexto de auditoria + escopo RLS. Toda leitura/escrita de dados privados passa por aqui. */
export async function withIntel<T>(ctx: AuthContext, scope: IntelScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${ctx.userId}, true),
      set_config('app.ip', ${ctx.ip ?? ""}, true),
      set_config('app.user_agent', ${(ctx.userAgent ?? "").slice(0, 300)}, true),
      set_config('app.intel_orgs', ${scope.orgIds.join(",")}, true),
      set_config('app.intel_global', ${scope.global ? "on" : "off"}, true)`);
    return fn(tx);
  });
}

/** Filtro SQL de organização para tabelas privadas (complementa a RLS). */
export function orgFilter(scope: IntelScope, col: AnyPgColumn, onlyCurrent = false) {
  if (onlyCurrent && scope.currentOrgId) return eq(col, scope.currentOrgId);
  if (scope.global) return undefined;
  return scope.orgIds.length ? inArray(col, scope.orgIds) : sql`false`;
}
