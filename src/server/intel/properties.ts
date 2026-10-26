import "server-only";
import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { intelMunicipalities, intelOrganizations, intelProperties, intelStudies } from "@/db/schema";
import { parseCoordinates, polygonAreaM2, validatePolygon } from "@/lib/intel/geo";
import { optionalText, requiredText } from "@/lib/validation/common";
import type { AuthContext } from "../authz";
import { notFound, validation } from "../errors";
import { formDataSafe } from "../validate";
import { assertCanEditOrg, assertOrgVisible, loadScope, orgFilter, requireCurrentOrg, withIntel, type IntelScope } from "./scope";

export const PROPERTY_TYPES = { terreno: "Terreno", galpao: "Galpão", posto: "Posto de combustível", estacionamento: "Estacionamento", loja: "Loja/ponto comercial", shopping: "Shopping/centro comercial", condominio: "Condomínio", empresa: "Empresa/frota", outro: "Outro" } as const;
export const OCCUPANCY = { vago: "Vago", ocupado: "Ocupado", parcial: "Parcialmente ocupado", desconhecido: "Desconhecido" } as const;
export const PROPERTY_STATUS = { prospeccao: { label: "Prospecção", tone: "neutral" }, em_estudo: { label: "Em estudo", tone: "info" }, aprovado: { label: "Aprovado", tone: "success" }, descartado: { label: "Descartado", tone: "danger" }, implantado: { label: "Implantado", tone: "dark" } } as const;
export const OBJECTIVES = { recarga_rapida: "Recarga rápida em corredor", destino: "Recarga de destino", motoristas_app: "Atendimento a motoristas de aplicativo", frotas: "Frotas", residencial: "Apoio a área residencial", misto: "Misto" } as const;

const triBool = z.preprocess((v) => (v === "sim" ? true : v === "nao" ? false : null), z.boolean().nullable());
const optNum = (max: number) => z.preprocess((v) => (v === "" || v === undefined || v === null ? null : String(v).replace(/\./g, "").replace(",", ".")), z.coerce.number({ error: "Número inválido." }).min(0).max(max).nullable());
const optCoord = z.preprocess((v) => (v === "" || v === undefined ? null : v), z.union([z.string(), z.number()]).nullable());

const propertySchema = z.object({
  name: requiredText("Identificação", 2, 150),
  address: optionalText(300), district: optionalText(120), city: optionalText(120),
  uf: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().regex(/^[A-Z]{2}$/, "UF inválida").nullable().optional()),
  zip: z.preprocess((v) => (typeof v === "string" ? v.replace(/\D/g, "") || null : null), z.string().length(8, "CEP deve ter 8 dígitos").nullable()),
  lat: optCoord, lng: optCoord,
  polygon: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().nullable()),
  areaM2: optNum(10_000_000), monthlyRent: optNum(100_000_000), salePrice: optNum(10_000_000_000),
  propertyType: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(Object.keys(PROPERTY_TYPES) as [string, ...string[]]).nullable().optional()),
  occupancy: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(Object.keys(OCCUPANCY) as [string, ...string[]]).nullable().optional()),
  parking: triBool, streetAccess: triBool,
  mainRoadDistanceM: optNum(100_000), destinationsWithin1km: optNum(10_000),
  objective: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(Object.keys(OBJECTIVES) as [string, ...string[]]).nullable().optional()),
  businessModel: z.enum(["smart_hub", "b2b"]).default("smart_hub"),
  status: z.enum(["prospeccao", "em_estudo", "aprovado", "descartado", "implantado"]).default("prospeccao"),
  geocodeSource: optionalText(100),
  listingUrl: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.url({ protocol: /^https?$/, error: "Link inválido (use http:// ou https://)." }).max(1000).nullable()),
  notes: optionalText(5000),
});

function prepare(d: z.infer<typeof propertySchema>) {
  let lat: number | null = null, lng: number | null = null;
  if (d.lat !== null || d.lng !== null) {
    const c = parseCoordinates(d.lat, d.lng);
    if (!c.ok) throw validation(c.error, { lat: c.error });
    if (c.outsideBrazil) throw validation("Coordenada fora do território brasileiro (verifique inversão de latitude/longitude).", { lat: "Fora do Brasil" });
    lat = c.value.lat; lng = c.value.lng;
  }
  let polygonGeoJson: string | null = null;
  let polyArea: number | null = null;
  if (d.polygon) {
    let parsed: unknown;
    try { parsed = JSON.parse(d.polygon); } catch { throw validation("Polígono inválido.", { polygon: "JSON inválido" }); }
    const v = validatePolygon(parsed);
    if (!v.ok) throw validation(v.error, { polygon: v.error });
    polyArea = polygonAreaM2(v.ring);
    polygonGeoJson = JSON.stringify({ type: "MultiPolygon", coordinates: [[[...v.ring, v.ring[0]]]] });
  }
  return { lat, lng, polygonGeoJson, polyArea };
}

const numOrNull = (n: number | null | undefined) => (n === null || n === undefined ? null : String(n));

export async function saveProperty(ctx: AuthContext, id: string | null, input: unknown, requestedOrg?: string | null) {
  const scope = await loadScope(ctx, requestedOrg);
  const d = formDataSafe(propertySchema, input);
  const { lat, lng, polygonGeoJson, polyArea } = prepare(d);
  const values = {
    name: d.name, address: d.address ?? null, district: d.district ?? null, city: d.city ?? null, uf: d.uf ?? null, zip: d.zip, lat, lng,
    areaM2: d.areaM2 ?? (polyArea ? Math.round(polyArea) : null), monthlyRent: numOrNull(d.monthlyRent), salePrice: numOrNull(d.salePrice),
    propertyType: d.propertyType ?? null, occupancy: d.occupancy ?? null, parking: d.parking, streetAccess: d.streetAccess,
    mainRoadDistanceM: d.mainRoadDistanceM, destinationsWithin1km: d.destinationsWithin1km === null ? null : Math.round(d.destinationsWithin1km),
    objective: d.objective ?? null, businessModel: d.businessModel, status: d.status, geocodeSource: d.geocodeSource ?? null, listingUrl: d.listingUrl, notes: d.notes ?? null,
  };
  return withIntel(ctx, scope, async (tx) => {
    let orgId: string;
    let propId: string;
    if (!id) {
      orgId = requireCurrentOrg(scope);
      assertCanEditOrg(ctx, scope, orgId);
      const [org] = await tx.select({ isDemo: intelOrganizations.isDemo }).from(intelOrganizations).where(eq(intelOrganizations.id, orgId));
      const [r] = await tx.insert(intelProperties).values({ ...values, organizationId: orgId, isDemo: org?.isDemo ?? false, createdBy: ctx.userId }).returning({ id: intelProperties.id });
      propId = r.id;
    } else {
      const [cur] = await tx.select({ organizationId: intelProperties.organizationId }).from(intelProperties).where(eq(intelProperties.id, id));
      if (!cur) throw notFound("Imóvel não encontrado.");
      assertCanEditOrg(ctx, scope, cur.organizationId);
      await tx.update(intelProperties).set(values).where(eq(intelProperties.id, id));
      propId = id; orgId = cur.organizationId;
    }
    if (polygonGeoJson) await tx.execute(sql`update intel_properties set polygon = ST_SetSRID(ST_GeomFromGeoJSON(${polygonGeoJson}), 4326) where id = ${propId}`);
    // Vínculo ao município (IBGE) pelo nome+UF, quando a base de municípios estiver carregada
    if (values.city && values.uf) {
      const [m] = await tx.select({ code: intelMunicipalities.ibgeCode }).from(intelMunicipalities)
        .where(and(eq(intelMunicipalities.uf, values.uf), sql`lower(unaccent_simple(${intelMunicipalities.name})) = lower(unaccent_simple(${values.city}))`)).limit(1);
      await tx.update(intelProperties).set({ municipalityCode: m?.code ?? null }).where(eq(intelProperties.id, propId));
    }
    return { id: propId, organizationId: orgId };
  });
}

export type PropertyFilters = {
  q?: string; uf?: string; city?: string; district?: string; zip?: string; status?: string; type?: string; businessModel?: string;
  minArea?: string; maxArea?: string; maxRent?: string; maxSale?: string; parking?: string; streetAccess?: string; occupancy?: string; objective?: string;
  maxRoadM?: string; sort?: string; dir?: string; page?: string; org?: string;
};

const n = (v?: string) => (v && v.trim() !== "" && Number.isFinite(Number(v.replace(",", "."))) ? Number(v.replace(",", ".")) : null);

export async function listProperties(ctx: AuthContext, f: PropertyFilters = {}, scopeIn?: IntelScope) {
  const scope = scopeIn ?? (await loadScope(ctx, f.org));
  const conds: (SQL | undefined)[] = [orgFilter(scope, intelProperties.organizationId, true)];
  if (f.q) conds.push(or(ilike(intelProperties.name, `%${f.q}%`), ilike(intelProperties.address, `%${f.q}%`)));
  if (f.uf) conds.push(eq(intelProperties.uf, f.uf));
  if (f.city) conds.push(ilike(intelProperties.city, `%${f.city}%`));
  if (f.district) conds.push(ilike(intelProperties.district, `%${f.district}%`));
  if (f.zip) conds.push(ilike(intelProperties.zip, `${f.zip.replace(/\D/g, "")}%`));
  if (f.status) conds.push(eq(intelProperties.status, f.status));
  if (f.type) conds.push(eq(intelProperties.propertyType, f.type));
  if (f.occupancy) conds.push(eq(intelProperties.occupancy, f.occupancy));
  if (f.objective) conds.push(eq(intelProperties.objective, f.objective));
  if (f.businessModel) conds.push(eq(intelProperties.businessModel, f.businessModel));
  if (n(f.minArea) !== null) conds.push(gte(intelProperties.areaM2, n(f.minArea)!));
  if (n(f.maxArea) !== null) conds.push(lte(intelProperties.areaM2, n(f.maxArea)!));
  if (n(f.maxRent) !== null) conds.push(lte(intelProperties.monthlyRent, String(n(f.maxRent))));
  if (n(f.maxSale) !== null) conds.push(lte(intelProperties.salePrice, String(n(f.maxSale))));
  if (n(f.maxRoadM) !== null) conds.push(lte(intelProperties.mainRoadDistanceM, n(f.maxRoadM)!));
  if (f.parking === "sim" || f.parking === "nao") conds.push(eq(intelProperties.parking, f.parking === "sim"));
  if (f.streetAccess === "sim" || f.streetAccess === "nao") conds.push(eq(intelProperties.streetAccess, f.streetAccess === "sim"));
  const sortCols = { name: intelProperties.name, area: intelProperties.areaM2, rent: intelProperties.monthlyRent, created: intelProperties.createdAt, city: intelProperties.city } as const;
  const col = sortCols[(f.sort ?? "created") as keyof typeof sortCols] ?? intelProperties.createdAt;
  const page = Math.max(1, Number(f.page) || 1);
  const pageSize = 50;
  return withIntel(ctx, scope, async (tx) => {
    const where = and(...conds);
    const [{ total }] = await tx.select({ total: sql<number>`count(*)::int` }).from(intelProperties).where(where);
    const rows = await tx.select({
      p: intelProperties,
      studies: sql<number>`(select count(*)::int from intel_studies s where s.property_id = "intel_properties"."id")`,
      competitors3km: sql<number | null>`(case when "intel_properties"."location" is null then null else (select count(*)::int from intel_charging_stations c where ST_DWithin(c.location, "intel_properties"."location", 3000) and (c.organization_id is null or c.organization_id = "intel_properties"."organization_id")) end)`,
    }).from(intelProperties).where(where)
      .orderBy(f.dir === "asc" ? sql`${col} asc nulls last` : sql`${col} desc nulls last`, asc(intelProperties.id)).limit(pageSize).offset((page - 1) * pageSize);
    return { rows, total, page, pageSize, scope };
  });
}

export async function getProperty(ctx: AuthContext, id: string, scopeIn?: IntelScope) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound("Imóvel não encontrado.");
  const scope = scopeIn ?? (await loadScope(ctx));
  return withIntel(ctx, scope, async (tx) => {
    const [row] = await tx.select({ p: intelProperties, polygon: sql<string | null>`ST_AsGeoJSON(${intelProperties.polygon})`, org: intelOrganizations.name })
      .from(intelProperties).innerJoin(intelOrganizations, eq(intelOrganizations.id, intelProperties.organizationId)).where(eq(intelProperties.id, id));
    if (!row) throw notFound("Imóvel não encontrado.");
    // RLS + verificação explícita: compartilhamentos dão leitura via estudo; a própria organização precisa estar no escopo
    const shared = scope.orgIds.includes(row.p.organizationId) || scope.global;
    if (!shared) {
      const [s] = await tx.execute<{ ok: boolean }>(sql`select exists(select 1 from intel_studies s join intel_study_shares sh on sh.study_id = s.id where s.property_id = ${id} and sh.organization_id = any(${`{${scope.orgIds.join(",")}}`}::uuid[])) as ok`).then((r) => r.rows);
      if (!s?.ok) assertOrgVisible(scope, row.p.organizationId);
    }
    const studies = await tx.select({ id: intelStudies.id, name: intelStudies.name, status: intelStudies.status, updatedAt: intelStudies.updatedAt, organizationId: intelStudies.organizationId }).from(intelStudies).where(eq(intelStudies.propertyId, id)).orderBy(desc(intelStudies.updatedAt));
    return { ...row, studies, scope };
  });
}

/** Exclusão autorizada: só imóveis sem estudos (estudos devem ser arquivados antes) — mantém trilha de auditoria. */
export async function deleteProperty(ctx: AuthContext, id: string) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, async (tx) => {
    const [cur] = await tx.select({ org: intelProperties.organizationId }).from(intelProperties).where(eq(intelProperties.id, id));
    if (!cur) throw notFound("Imóvel não encontrado.");
    assertCanEditOrg(ctx, scope, cur.org);
    const [{ c }] = await tx.select({ c: sql<number>`count(*)::int` }).from(intelStudies).where(eq(intelStudies.propertyId, id));
    if (c > 0) throw validation("Imóvel possui estudos. Arquive-os ou exclua-os antes.");
    await tx.delete(intelProperties).where(eq(intelProperties.id, id));
  });
}

/** Análise de localização do imóvel (concorrência, indicadores, índice) — sem estudo, sem dados elétricos. */
export async function getPropertyAnalysis(ctx: AuthContext, id: string) {
  const data = await getProperty(ctx, id);
  const { analyzeSite } = await import("./analysis");
  const analysis = await withIntel(ctx, data.scope, (tx) => analyzeSite(tx, data.p));
  const canEdit = data.scope.memberships.find((m) => m.organizationId === data.p.organizationId)?.role !== "consulta" && data.scope.orgIds.includes(data.p.organizationId) && (ctx.permissions.has("inteligencia.edit") || ctx.permissions.has("inteligencia.admin"));
  return { ...data, analysis, canEdit };
}
