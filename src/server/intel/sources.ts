import "server-only";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type Tx } from "@/db/client";
import { intelChargingStations, intelDataSources, intelMunicipalities, intelStates, intelStationRevisions } from "@/db/schema";
import { parseCoordinates } from "@/lib/intel/geo";
import { optionalText, requiredText } from "@/lib/validation/common";
import { logEvent } from "../audit";
import type { AuthContext } from "../authz";
import { forbidden, notFound, validation } from "../errors";
import { formDataSafe } from "../validate";
import { ibgeMunicipalities, ibgePopulation, overpassStations, openChargeMapStations, testSource, type ExternalStation, type Fetcher } from "./adapters";
import { assertOrgVisible, loadScope, withIntel } from "./scope";

export const SOURCE_STATUS = {
  funcionando: { label: "Funcionando", tone: "success" },
  importacao_manual: { label: "Disponível para importação manual", tone: "info" },
  necessita_credenciais: { label: "Necessita credenciais", tone: "warning" },
  necessita_autorizacao: { label: "Necessita autorização", tone: "warning" },
  indisponivel: { label: "Temporariamente indisponível", tone: "danger" },
  nao_implementada: { label: "Não implementada", tone: "neutral" },
  descontinuada: { label: "Fonte descontinuada", tone: "neutral" },
  nao_testada: { label: "Não testada", tone: "neutral" },
} as const;

const assertAdmin = (ctx: AuthContext) => { if (!ctx.permissions.has("inteligencia.admin")) throw forbidden(); };
const assertImport = (ctx: AuthContext) => { if (!ctx.permissions.has("inteligencia.import") && !ctx.permissions.has("inteligencia.admin")) throw forbidden(); };

export async function listSources(ctx: AuthContext) {
  await loadScope(ctx);
  const db = getDb();
  const rows = await db.select().from(intelDataSources).orderBy(asc(intelDataSources.category), asc(intelDataSources.name));
  const counts = await db.execute<{ k: string; n: number }>(sql`
    select source_key as k, count(*)::int as n from intel_charging_stations group by 1
    union all select source_key, count(*)::int from intel_geographic_indicators group by 1
    union all select source_key, count(*)::int from intel_pois group by 1
    union all select source_key, count(*)::int from intel_roads group by 1
    union all select 'ibge_localidades', count(*)::int from intel_municipalities
    union all select 'ibge_populacao', count(*)::int from intel_municipalities where population is not null`);
  const total = new Map<string, number>();
  for (const c of counts.rows) total.set(c.k, (total.get(c.k) ?? 0) + c.n);
  const recentErrors = await db.execute<{ source_key: string; n: number }>(sql`select source_key, count(*)::int as n from intel_data_imports where status in ('falhou','concluida_com_erros') and created_at > now() - interval '30 days' group by 1`);
  const errs = new Map(recentErrors.rows.map((r) => [r.source_key, r.n]));
  return rows.map((r) => ({ ...r, liveCount: total.get(r.key) ?? 0, recentImportErrors: errs.get(r.key) ?? 0, envConfigured: r.key === "open_charge_map" ? !!process.env.OPEN_CHARGE_MAP_API_KEY : null }));
}

/** Teste REAL de conectividade; o status "funcionando" só é atribuído com resposta válida. */
export async function runSourceTest(ctx: AuthContext, key: string, f?: Fetcher) {
  assertAdmin(ctx);
  const [src] = await getDb().select().from(intelDataSources).where(eq(intelDataSources.key, key));
  if (!src) throw notFound("Fonte não encontrada.");
  const r = await testSource(key, f);
  const testable = ["ibge_localidades", "ibge_populacao", "osm_nominatim", "osm_overpass", "open_charge_map", "osm_tiles"].includes(key);
  const status = !testable ? src.status : r.ok ? "funcionando" : key === "open_charge_map" && !process.env.OPEN_CHARGE_MAP_API_KEY ? "necessita_credenciais" : "indisponivel";
  await getDb().update(intelDataSources).set({ lastTestAt: new Date(), lastTestOk: r.ok, lastError: r.ok ? null : r.detail.slice(0, 500), status, updatedAt: new Date() }).where(eq(intelDataSources.key, key));
  await logEvent({ userId: ctx.userId, action: "intel.source_test", entityType: "intel_data_sources", entityId: key, summary: `${r.ok ? "OK" : "Falha"}: ${r.detail}`.slice(0, 300), ip: ctx.ip, userAgent: ctx.userAgent });
  return r;
}

/** Importa municípios (e, opcionalmente, população/área do Censo 2022) de uma UF pela API do IBGE. Atualização incremental por UF. */
export async function importIbgeState(ctx: AuthContext, uf: string, f?: Fetcher) {
  assertImport(ctx);
  const [st] = await getDb().select().from(intelStates).where(eq(intelStates.uf, uf));
  if (!st) throw validation("UF inválida.");
  const muns = await ibgeMunicipalities(uf, f);
  let pop = new Map<number, { population: number | null; areaKm2: number | null; period: string }>();
  let popError: string | null = null;
  try { pop = await ibgePopulation(st.ibgeCode, f); } catch (e) { popError = (e as Error).message; }
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const m of muns) {
      const p = pop.get(m.ibgeCode);
      const values = { name: m.name, uf, sourceKey: "ibge_localidades", updatedAt: new Date(), ...(p ? { population: p.population, areaKm2: p.areaKm2, populationReference: `Censo ${p.period}` } : {}) };
      await tx.insert(intelMunicipalities).values({ ibgeCode: m.ibgeCode, ...values }).onConflictDoUpdate({ target: intelMunicipalities.ibgeCode, set: values });
    }
    await tx.update(intelDataSources).set({ lastImportAt: new Date(), status: "funcionando", lastTestOk: true, lastError: null }).where(eq(intelDataSources.key, "ibge_localidades"));
    await tx.update(intelDataSources).set(popError ? { lastError: popError.slice(0, 500), lastTestOk: false } : { lastImportAt: new Date(), status: "funcionando", lastTestOk: true, lastError: null }).where(eq(intelDataSources.key, "ibge_populacao"));
  });
  await logEvent({ userId: ctx.userId, action: "intel.import_ibge", summary: `${uf}: ${muns.length} municípios, ${pop.size} com população`, ip: ctx.ip, userAgent: ctx.userAgent });
  return { municipalities: muns.length, withPopulation: pop.size, populationError: popError };
}

/** Upsert de estações externas preservando correções manuais confirmadas (não sobrescreve registros "confirmado"). */
export async function upsertExternalStations(tx: Tx, sourceKey: string, list: ExternalStation[], importId: string | null, organizationId: string | null = null) {
  let inserted = 0, updated = 0, skipped = 0;
  for (const s of list) {
    const [cur] = await tx.select({ id: intelChargingStations.id, status: intelChargingStations.verificationStatus }).from(intelChargingStations).where(sql`${intelChargingStations.sourceKey} = ${sourceKey} and ${intelChargingStations.externalId} = ${s.externalId}`);
    const values = { name: s.name, operator: s.operator, lat: s.lat, lng: s.lng, maxPowerKw: s.maxPowerKw, connectors: s.connectors, currentType: s.currentType, connectorStandard: s.connectorStandard, openingHours: s.openingHours, address: s.address, raw: s.raw, importId };
    if (!cur) { await tx.insert(intelChargingStations).values({ ...values, sourceKey, externalId: s.externalId, organizationId, verificationStatus: "nao_verificado", confidence: "baixa" }); inserted++; }
    else if (cur.status === "confirmado") skipped++;
    else { await tx.update(intelChargingStations).set(values).where(eq(intelChargingStations.id, cur.id)); updated++; }
  }
  return { inserted, updated, skipped };
}

const bboxSchema = z.object({ minLat: z.coerce.number().min(-34).max(6), minLng: z.coerce.number().min(-75).max(-28), maxLat: z.coerce.number().min(-34).max(6), maxLng: z.coerce.number().min(-75).max(-28) });

export async function importOsmStations(ctx: AuthContext, input: unknown, f?: Fetcher) {
  assertImport(ctx);
  const b = formDataSafe(bboxSchema, input);
  if (b.minLat >= b.maxLat || b.minLng >= b.maxLng) throw validation("Área inválida.");
  const list = await overpassStations(b, f);
  const res = await getDb().transaction((tx) => upsertExternalStations(tx, "osm_overpass", list, null));
  await getDb().update(intelDataSources).set({ lastImportAt: new Date(), status: "funcionando", lastTestOk: true, lastError: null }).where(eq(intelDataSources.key, "osm_overpass"));
  await logEvent({ userId: ctx.userId, action: "intel.import_osm_stations", summary: `${list.length} estações (${res.inserted} novas, ${res.updated} atualizadas, ${res.skipped} confirmadas preservadas)`, ip: ctx.ip, userAgent: ctx.userAgent });
  return { found: list.length, ...res };
}

export async function importOcmStations(ctx: AuthContext, input: unknown, f?: Fetcher) {
  assertImport(ctx);
  const d = formDataSafe(z.object({ lat: z.coerce.number(), lng: z.coerce.number(), radiusKm: z.coerce.number().min(1).max(50) }), input);
  const list = await openChargeMapStations(d, f);
  const res = await getDb().transaction((tx) => upsertExternalStations(tx, "open_charge_map", list, null));
  await logEvent({ userId: ctx.userId, action: "intel.import_ocm", summary: `${list.length} pontos`, ip: ctx.ip, userAgent: ctx.userAgent });
  return { found: list.length, ...res };
}

/* ----------------------------- Carregadores: cadastro e correção ----------------------------- */

const stationSchema = z.object({
  name: requiredText("Nome", 2, 200), address: optionalText(300), operator: optionalText(150),
  lat: z.union([z.string(), z.number()]), lng: z.union([z.string(), z.number()]),
  maxPowerKw: z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(",", ".")), z.coerce.number().min(0.1).max(1000).nullable()),
  connectors: z.preprocess((v) => (v === "" || v == null ? null : v), z.coerce.number().int().min(1).max(500).nullable()),
  currentType: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.enum(["AC", "DC", "AC_DC"]).nullable()),
  connectorStandard: optionalText(200),
  pricePerKwh: z.preprocess((v) => (v === "" || v == null ? null : String(v).replace(",", ".")), z.coerce.number().min(0).max(50).nullable()),
  openingHours: optionalText(200),
  operationalStatus: z.enum(["operando", "fora_de_operacao", "em_implantacao", "desconhecido"]),
  verificationStatus: z.enum(["confirmado", "nao_verificado", "historico", "insuficiente"]),
  verifiedAt: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.iso.date().nullable()),
  reason: requiredText("Motivo/evidência da alteração", 5, 500),
  private: z.preprocess((v) => v === "on", z.boolean()),
});

export async function saveStation(ctx: AuthContext, id: string | null, input: unknown) {
  assertImport(ctx);
  const scope = await loadScope(ctx);
  const d = formDataSafe(stationSchema, input);
  const c = parseCoordinates(d.lat, d.lng);
  if (!c.ok) throw validation(c.error, { lat: c.error });
  if (d.verificationStatus === "confirmado" && !d.verifiedAt) throw validation("Registro confirmado exige data de verificação.", { verifiedAt: "Informe a data" });
  const values = { name: d.name, address: d.address ?? null, operator: d.operator ?? null, lat: c.value.lat, lng: c.value.lng, maxPowerKw: d.maxPowerKw, connectors: d.connectors, currentType: d.currentType, connectorStandard: d.connectorStandard ?? null, pricePerKwh: d.pricePerKwh === null ? null : String(d.pricePerKwh), openingHours: d.openingHours ?? null, operationalStatus: d.operationalStatus, verificationStatus: d.verificationStatus, verifiedAt: d.verifiedAt, confidence: d.verificationStatus === "confirmado" ? "alta" : "baixa" };
  return withIntel(ctx, scope, async (tx) => {
    if (!id) {
      const orgId = d.private ? scope.currentOrgId : null;
      const [r] = await tx.insert(intelChargingStations).values({ ...values, sourceKey: "manual", organizationId: orgId }).returning();
      await tx.insert(intelStationRevisions).values({ stationId: r.id, changedBy: ctx.userId, reason: d.reason, before: {}, after: values });
      return r;
    }
    const [cur] = await tx.select().from(intelChargingStations).where(eq(intelChargingStations.id, id));
    if (!cur) throw notFound("Carregador não encontrado.");
    if (cur.organizationId) assertOrgVisible(scope, cur.organizationId);
    const before = Object.fromEntries(Object.keys(values).map((k) => [k, (cur as Record<string, unknown>)[k]]));
    await tx.update(intelChargingStations).set(values).where(eq(intelChargingStations.id, id));
    await tx.insert(intelStationRevisions).values({ stationId: id, changedBy: ctx.userId, reason: d.reason, before, after: values });
    return { id };
  });
}

export async function getStation(ctx: AuthContext, id: string) {
  const scope = await loadScope(ctx);
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
  return withIntel(ctx, scope, async (tx) => {
    const [s] = await tx.select().from(intelChargingStations).where(eq(intelChargingStations.id, id));
    if (!s) throw notFound("Carregador não encontrado.");
    if (s.organizationId) assertOrgVisible(scope, s.organizationId);
    const revisions = await tx.execute<{ id: string; reason: string; before: unknown; after: unknown; created_at: string; user_name: string | null }>(sql`select r.id, r.reason, r.before, r.after, r.created_at, u.name as user_name from intel_station_revisions r left join users u on u.id = r.changed_by where r.station_id = ${id} order by r.created_at desc`);
    return { station: s, revisions: revisions.rows };
  });
}

export async function listStations(ctx: AuthContext, f: { q?: string; status?: string; source?: string; minPower?: string; page?: string } = {}) {
  const scope = await loadScope(ctx);
  const page = Math.max(1, Number(f.page) || 1);
  return withIntel(ctx, scope, async (tx) => {
    const conds = [sql`true`];
    if (f.q) conds.push(sql`(name ilike ${`%${f.q}%`} or operator ilike ${`%${f.q}%`} or address ilike ${`%${f.q}%`})`);
    if (f.status) conds.push(sql`verification_status = ${f.status}`);
    if (f.source) conds.push(sql`source_key = ${f.source}`);
    if (f.minPower && Number(f.minPower) > 0) conds.push(sql`max_power_kw >= ${Number(f.minPower)}`);
    if (!scope.global) conds.push(sql`(organization_id is null or organization_id = any(${`{${scope.orgIds.join(",")}}`}::uuid[]))`);
    const where = sql.join(conds, sql` and `);
    const total = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from intel_charging_stations where ${where}`)).rows[0].n;
    const rows = (await tx.execute<{ id: string; name: string | null; operator: string | null; address: string | null; lat: number; lng: number; max_power_kw: number | null; current_type: string | null; price_per_kwh: string | null; verification_status: string; verified_at: string | null; source_key: string; organization_id: string | null; is_demo: boolean }>(sql`
      select id, name, operator, address, lat, lng, max_power_kw, current_type, price_per_kwh, verification_status, verified_at::text, source_key, organization_id, is_demo
        from intel_charging_stations where ${where} order by updated_at desc limit 100 offset ${(page - 1) * 100}`)).rows;
    return { rows, total, page };
  });
}
