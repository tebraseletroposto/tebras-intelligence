import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, withAudit } from "@/db/client";
import { intelMemberships, intelModelVersions, intelOrganizations, intelOrgRegions, users } from "@/db/schema";
import { DEFAULT_INDEX_CONFIG, validateIndexConfig, type IndexConfig } from "@/lib/intel/potential-index";
import { UFS } from "@/lib/domain/documents";
import { requiredText } from "@/lib/validation/common";
import { auditMeta, type AuthContext } from "../authz";
import { forbidden, isPgUniqueViolation, conflict, notFound, validation } from "../errors";
import { formDataSafe } from "../validate";
import { loadScope } from "./scope";

const assertAdmin = (ctx: AuthContext) => { if (!ctx.permissions.has("inteligencia.admin")) throw forbidden(); };

export const ORG_ROLE_LABELS = { admin_global: "Administrador global", gestor_regional: "Gestor regional", franqueado: "Franqueado", analista: "Analista", consulta: "Consulta" } as const;

export async function listOrganizations(ctx: AuthContext) {
  const scope = await loadScope(ctx);
  const rows = await getDb().select({
    o: intelOrganizations,
    members: sql<number>`(select count(*)::int from intel_memberships m where m.organization_id = "intel_organizations"."id")`,
    regions: sql<string | null>`(select string_agg(distinct uf, ', ' order by uf) from intel_org_regions r where r.organization_id = "intel_organizations"."id")`,
  }).from(intelOrganizations).orderBy(asc(intelOrganizations.kind), asc(intelOrganizations.name));
  return rows.filter((r) => scope.global || scope.orgIds.includes(r.o.id));
}

const orgSchema = z.object({
  name: requiredText("Nome", 2, 150),
  kind: z.enum(["matriz", "franquia", "parceiro_b2b"]),
  document: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().max(30).nullable()),
  isDemo: z.preprocess((v) => v === "on", z.boolean()),
  regions: z.preprocess((v) => (Array.isArray(v) ? v : v ? [v] : []), z.array(z.enum(UFS))),
});

export async function saveOrganization(ctx: AuthContext, id: string | null, input: unknown) {
  assertAdmin(ctx);
  const d = formDataSafe(orgSchema, input);
  try {
    return await withAudit(auditMeta(ctx), async (tx) => {
      let orgId = id;
      if (!id) orgId = (await tx.insert(intelOrganizations).values({ name: d.name, kind: d.kind, document: d.document, isDemo: d.isDemo }).returning({ id: intelOrganizations.id }))[0].id;
      else {
        const r = await tx.update(intelOrganizations).set({ name: d.name, kind: d.kind, document: d.document, isDemo: d.isDemo }).where(eq(intelOrganizations.id, id)).returning({ id: intelOrganizations.id });
        if (!r.length) throw notFound();
      }
      await tx.delete(intelOrgRegions).where(eq(intelOrgRegions.organizationId, orgId!));
      if (d.regions.length) await tx.insert(intelOrgRegions).values(d.regions.map((uf) => ({ organizationId: orgId!, uf })));
      return { id: orgId! };
    });
  } catch (e) {
    if (isPgUniqueViolation(e)) throw conflict("Já existe uma organização com este nome.", { name: "Nome em uso" });
    throw e;
  }
}

export async function getOrganization(ctx: AuthContext, id: string) {
  const scope = await loadScope(ctx);
  if (!/^[0-9a-f-]{36}$/i.test(id) || (!scope.global && !scope.orgIds.includes(id))) throw notFound();
  const db = getDb();
  const [o] = await db.select().from(intelOrganizations).where(eq(intelOrganizations.id, id));
  if (!o) throw notFound();
  const members = await db.select({ userId: intelMemberships.userId, role: intelMemberships.role, name: users.name, email: users.email }).from(intelMemberships).innerJoin(users, eq(users.id, intelMemberships.userId)).where(eq(intelMemberships.organizationId, id)).orderBy(asc(users.name));
  const regions = await db.select().from(intelOrgRegions).where(eq(intelOrgRegions.organizationId, id));
  const perf = await db.execute<{ properties: number; studies: number; approved: number; implanted: number }>(sql`select
      (select count(*)::int from intel_properties where organization_id = ${id}) as properties,
      (select count(*)::int from intel_studies where organization_id = ${id}) as studies,
      (select count(*)::int from intel_properties where organization_id = ${id} and status = 'aprovado') as approved,
      (select count(*)::int from intel_properties where organization_id = ${id} and status = 'implantado') as implanted`);
  return { org: o, members, regions, performance: perf.rows[0] };
}

export async function setMembership(ctx: AuthContext, orgId: string, input: unknown) {
  assertAdmin(ctx);
  const d = formDataSafe(z.object({ email: z.string().trim().toLowerCase().email("E-mail inválido."), role: z.enum(["admin_global", "gestor_regional", "franqueado", "analista", "consulta"]) }), input);
  return withAudit(auditMeta(ctx), async (tx) => {
    const [u] = await tx.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${d.email}`);
    if (!u) throw validation("Usuário não encontrado. Crie o usuário em Administração → Usuários.", { email: "Não encontrado" });
    await tx.insert(intelMemberships).values({ userId: u.id, organizationId: orgId, role: d.role }).onConflictDoUpdate({ target: [intelMemberships.userId, intelMemberships.organizationId], set: { role: d.role } });
  });
}

export async function removeMembership(ctx: AuthContext, orgId: string, userId: string) {
  assertAdmin(ctx);
  return withAudit(auditMeta(ctx), (tx) => tx.delete(intelMemberships).where(and(eq(intelMemberships.organizationId, orgId), eq(intelMemberships.userId, userId))));
}

/** Painel regional: desempenho por UF das organizações visíveis. */
export async function regionalPanel(ctx: AuthContext) {
  const scope = await loadScope(ctx);
  const ids = scope.global ? null : scope.orgIds;
  const r = await getDb().execute<{ uf: string | null; properties: number; studies: number; approved: number }>(sql`
    select p.uf, count(distinct p.id)::int as properties, count(distinct s.id)::int as studies, count(distinct p.id) filter (where p.status = 'aprovado')::int as approved
      from intel_properties p left join intel_studies s on s.property_id = p.id
     where ${ids === null ? sql`true` : sql`p.organization_id = any(${`{${ids.join(",")}}`}::uuid[])`}
     group by p.uf order by properties desc`);
  return r.rows;
}

/* --------------------------- Configuração do índice --------------------------- */

export async function indexVersions(ctx: AuthContext) {
  await loadScope(ctx);
  return getDb().select().from(intelModelVersions).where(eq(intelModelVersions.kind, "potential_index")).orderBy(desc(intelModelVersions.createdAt)).limit(30);
}

/** Cria nova versão (imutável) da configuração do índice e a ativa. Pesos são hipóteses documentadas. */
export async function saveIndexConfig(ctx: AuthContext, input: Record<string, unknown>) {
  assertAdmin(ctx);
  const num = (k: string, fallback: number) => { const v = Number(String(input[k] ?? "").replace(",", ".")); return Number.isFinite(v) ? v : fallback; };
  const cfg: IndexConfig = {
    weights: Object.fromEntries(Object.keys(DEFAULT_INDEX_CONFIG.weights).map((k) => [k, num(`w_${k}`, NaN)])) as IndexConfig["weights"],
    scales: Object.fromEntries(Object.keys(DEFAULT_INDEX_CONFIG.scales).map((k) => [k, num(`s_${k}`, NaN)])) as IndexConfig["scales"],
  };
  const errs = validateIndexConfig(cfg);
  if (errs.length) throw validation(errs.join(" "));
  const notes = String(input.notes ?? "").trim().slice(0, 1000);
  if (notes.length < 5) throw validation("Descreva a justificativa da alteração.", { notes: "Obrigatório" });
  return withAudit(auditMeta(ctx), async (tx) => {
    const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(intelModelVersions).where(eq(intelModelVersions.kind, "potential_index"));
    await tx.update(intelModelVersions).set({ active: false }).where(and(eq(intelModelVersions.kind, "potential_index"), eq(intelModelVersions.active, true)));
    await tx.insert(intelModelVersions).values({ kind: "potential_index", version: `indice-v${n + 1}`, config: cfg, active: true, notes, createdBy: ctx.userId });
  });
}

export async function activateIndexVersion(ctx: AuthContext, id: string) {
  assertAdmin(ctx);
  return withAudit(auditMeta(ctx), async (tx) => {
    const [v] = await tx.select().from(intelModelVersions).where(eq(intelModelVersions.id, id));
    if (!v) throw notFound();
    await tx.update(intelModelVersions).set({ active: false }).where(and(eq(intelModelVersions.kind, v.kind), eq(intelModelVersions.active, true)));
    await tx.update(intelModelVersions).set({ active: true }).where(eq(intelModelVersions.id, id));
  });
}
