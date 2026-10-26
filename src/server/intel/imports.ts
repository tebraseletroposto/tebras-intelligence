import "server-only";
import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import { z } from "zod";
import { getDb } from "@/db/client";
import { intelDataImports, intelDataSources, intelGeographicAreas, intelGeographicIndicators, intelHubObservations, intelImportedDatasets, intelOrganizations, intelPois, intelProperties, intelRoads } from "@/db/schema";
import { IMPORT_TARGETS, MAX_IMPORT_BYTES, parseCsv, suggestMapping, summarizeEvie, validateImport, type ImportPreview, type ImportTarget } from "@/lib/intel/importer";
import type { AuthContext } from "../authz";
import { forbidden, notFound, validation } from "../errors";
import { INDICATOR_DEFS } from "./analysis";
import { upsertExternalStations } from "./sources";
import { assertCanEditOrg, loadScope, orgFilter, requireCurrentOrg, withIntel } from "./scope";

/** Destinos exclusivos de GeoJSON (extratos OSM convertidos). */
export const GEOJSON_TARGETS = { osm_roads: "Malha viária (linhas OSM com tag highway)", osm_pois: "Pontos de interesse (pontos OSM)" } as const;
export type AnyTarget = ImportTarget | keyof typeof GEOJSON_TARGETS;

const MAIN_HIGHWAYS = new Set(["motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link"]);
const POI_CATEGORIES: Record<string, string> = { "shop=mall": "shopping", "aeroway=aerodrome": "aeroporto", "amenity=bus_station": "terminal_rodoviario", "public_transport=station": "estacao", "amenity=fuel": "posto", "amenity=parking": "estacionamento", "amenity=hospital": "hospital", "amenity=university": "universidade", "shop=supermarket": "supermercado", "tourism=hotel": "hotel", "landuse=commercial": "polo_comercial", "office=company": "empresa", "amenity=restaurant": "restaurante" };

export type ParsedFile = { kind: "tabela" | "geojson"; headers: string[]; records: unknown[][]; features?: GeoFeature[]; contentType: string };
type GeoFeature = { type: string; geometry: { type: string; coordinates: unknown } | null; properties: Record<string, unknown> | null; id?: unknown };

export async function parseUpload(name: string, buf: Buffer): Promise<ParsedFile> {
  if (buf.length === 0) throw validation("Arquivo vazio.");
  if (buf.length > MAX_IMPORT_BYTES) throw validation(`Arquivo maior que ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "csv" || ext === "txt") {
    const text = buf.toString("utf8");
    if (text.includes("\u0000")) throw validation("Arquivo binário não é CSV.");
    const rows = parseCsv(text);
    if (rows.length < 2) throw validation("O arquivo precisa de cabeçalho e ao menos uma linha.");
    return { kind: "tabela", headers: rows[0].map((h) => h.trim()), records: rows.slice(1), contentType: "text/csv" };
  }
  if (ext === "xlsx") {
    if (buf.subarray(0, 2).toString() !== "PK") throw validation("Arquivo XLSX inválido.");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw validation("Planilha sem abas.");
    const rows: unknown[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "result" in (v as object) ? (v as { result: unknown }).result : v && typeof v === "object" && "text" in (v as object) ? (v as { text: unknown }).text : v));
      rows.push(vals.map((v) => (v instanceof Date ? v : v === null || v === undefined ? "" : typeof v === "number" ? v : String(v))));
    });
    if (rows.length < 2) throw validation("A primeira aba precisa de cabeçalho e ao menos uma linha.");
    const width = Math.max(...rows.map((r) => r.length));
    return { kind: "tabela", headers: Array.from({ length: width }, (_, i) => String(rows[0][i] ?? `coluna_${i + 1}`).trim()), records: rows.slice(1), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  if (ext === "geojson" || ext === "json") {
    let gj: { type?: string; features?: GeoFeature[] };
    try { gj = JSON.parse(buf.toString("utf8")); } catch { throw validation("GeoJSON inválido."); }
    if (gj.type !== "FeatureCollection" || !Array.isArray(gj.features)) throw validation("GeoJSON deve ser uma FeatureCollection.");
    const keys = new Set<string>();
    for (const f of gj.features.slice(0, 500)) for (const k of Object.keys(f.properties ?? {})) keys.add(k);
    const headers = ["lat", "lng", ...keys];
    const records = gj.features.map((f) => {
      const pt = f.geometry?.type === "Point" ? (f.geometry.coordinates as number[]) : null;
      return [pt ? pt[1] : "", pt ? pt[0] : "", ...[...keys].map((k) => f.properties?.[k] ?? "")];
    });
    return { kind: "geojson", headers, records, features: gj.features, contentType: "application/geo+json" };
  }
  if (ext === "gpkg") throw validation("GeoPackage ainda não é suportado diretamente: converta para GeoJSON (ex.: ogr2ogr -f GeoJSON saida.geojson entrada.gpkg). Ver docs/INTELLIGENCE.md.");
  throw validation("Formato não suportado. Use CSV, XLSX ou GeoJSON.");
}

export async function previewImport(ctx: AuthContext, target: AnyTarget, file: { name: string; buf: Buffer }, mapping?: Record<string, string | null>) {
  if (!ctx.permissions.has("inteligencia.import") && !ctx.permissions.has("inteligencia.admin")) throw forbidden();
  const parsed = await parseUpload(file.name, file.buf);
  if (target in GEOJSON_TARGETS) {
    if (parsed.kind !== "geojson") throw validation("Malha viária e POIs exigem arquivo GeoJSON.");
    const feats = parsed.features ?? [];
    const usable = target === "osm_roads" ? feats.filter((f) => f.properties?.highway && /LineString/.test(f.geometry?.type ?? "")) : feats.filter((f) => f.geometry?.type === "Point" && poiCategory(f.properties ?? {}));
    return { kind: "geojson" as const, target, total: feats.length, usable: usable.length, sample: usable.slice(0, 10).map((f) => ({ name: f.properties?.name ?? null, cls: target === "osm_roads" ? f.properties?.highway : poiCategory(f.properties ?? {}) })) };
  }
  const t = target as ImportTarget;
  const map = mapping && Object.keys(mapping).length ? mapping : suggestMapping(parsed.headers, t);
  const preview = validateImport(t, parsed.headers, parsed.records, map);
  return { kind: "tabela" as const, target: t, mapping: map, preview: trimPreview(preview), evie: t === "evie" ? summarizeEvie(preview) : null };
}

const trimPreview = (p: ImportPreview) => ({ ...p, rows: p.rows.slice(0, 25), issues: p.issues.slice(0, 200), issueCount: p.issues.length });

function poiCategory(p: Record<string, unknown>): string | null {
  for (const [k, cat] of Object.entries(POI_CATEGORIES)) { const [tag, val] = k.split("="); if (p[tag] === val) return cat; }
  return null;
}

const commitSchema = z.object({
  target: z.string(),
  sourceKey: z.string().min(1),
  referenceDate: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.iso.date().nullable()),
  usageConditions: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().max(1000).nullable()),
  notes: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().max(2000).nullable()),
  visibility: z.enum(["organizacao", "publico"]).default("organizacao"),
  indicatorFixed: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().nullable()),
  quality: z.enum(["alta", "media", "baixa", "desconhecida"]).default("desconhecida"),
  propertyId: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().uuid().nullable()),
});

/** Grava a importação: registros válidos + arquivo original + log com proveniência. */
export async function commitImport(ctx: AuthContext, file: { name: string; buf: Buffer }, mapping: Record<string, string | null>, input: unknown) {
  if (!ctx.permissions.has("inteligencia.import") && !ctx.permissions.has("inteligencia.admin")) throw forbidden();
  const o = commitSchema.parse(input);
  const scope = await loadScope(ctx);
  const orgId = requireCurrentOrg(scope);
  assertCanEditOrg(ctx, scope, orgId);
  if (o.visibility === "publico" && !ctx.permissions.has("inteligencia.admin")) throw forbidden("Somente administradores globais publicam dados para todas as organizações.");
  const [src] = await getDb().select().from(intelDataSources).where(eq(intelDataSources.key, o.sourceKey));
  if (!src) throw validation("Fonte inválida.");
  if (o.target === "evie" && !o.usageConditions) throw validation("Informe as condições de uso autorizadas pela Uber para o arquivo EVIE.", { usageConditions: "Obrigatório" });
  const ownerOrg = o.visibility === "publico" ? null : orgId;
  const parsed = await parseUpload(file.name, file.buf);
  const sha = createHash("sha256").update(file.buf).digest("hex");

  return withIntel(ctx, scope, async (tx) => {
    const [org] = await tx.select({ isDemo: intelOrganizations.isDemo }).from(intelOrganizations).where(eq(intelOrganizations.id, orgId));
    const [imp] = await tx.insert(intelDataImports).values({ organizationId: ownerOrg, sourceKey: o.sourceKey, target: o.target, fileName: file.name.slice(0, 200), fileSize: file.buf.length, sha256: sha, mapping, status: "concluida", referenceDate: o.referenceDate, usageConditions: o.usageConditions, notes: o.notes, createdBy: ctx.userId }).returning({ id: intelDataImports.id });
    await tx.insert(intelImportedDatasets).values({ importId: imp.id, organizationId: ownerOrg, contentType: parsed.contentType, content: file.buf });
    let inserted = 0;
    let summary: Record<string, unknown> = {};
    let stats = { total: 0, valid: 0, invalid: 0, duplicates: 0 };
    let issues: unknown[] = [];

    if (o.target === "osm_roads" || o.target === "osm_pois") {
      const feats = parsed.features ?? [];
      stats.total = feats.length;
      for (const f of feats) {
        const p = f.properties ?? {};
        const osmId = String(p["@id"] ?? p.osm_id ?? p.id ?? f.id ?? "") || null;
        if (o.target === "osm_roads") {
          if (!p.highway || !f.geometry || !/LineString/.test(f.geometry.type)) continue;
          const geom = JSON.stringify(f.geometry.type === "LineString" ? { type: "MultiLineString", coordinates: [f.geometry.coordinates] } : f.geometry);
          await tx.execute(sql`insert into intel_roads (osm_id, name, highway, is_main, geom, source_key, import_id) values (${osmId}, ${(p.name as string) ?? null}, ${String(p.highway)}, ${MAIN_HIGHWAYS.has(String(p.highway))}, ST_SetSRID(ST_GeomFromGeoJSON(${geom}), 4326), ${o.sourceKey}, ${imp.id})
            on conflict (source_key, osm_id) do update set name = excluded.name, highway = excluded.highway, is_main = excluded.is_main, geom = excluded.geom, import_id = excluded.import_id`);
        } else {
          const cat = poiCategory(p);
          if (!cat || f.geometry?.type !== "Point") continue;
          const [lng, lat] = f.geometry.coordinates as number[];
          await tx.insert(intelPois).values({ externalId: osmId, category: cat, name: (p.name as string) ?? null, lat, lng, sourceKey: o.sourceKey, importId: imp.id }).onConflictDoUpdate({ target: [intelPois.sourceKey, intelPois.externalId], set: { category: cat, name: (p.name as string) ?? null, lat, lng, importId: imp.id } });
        }
        inserted++;
      }
      stats.valid = inserted; stats.invalid = stats.total - inserted;
      void intelRoads;
    } else {
      const t = o.target as ImportTarget;
      if (!(t in IMPORT_TARGETS)) throw validation("Destino inválido.");
      const pv = validateImport(t, parsed.headers, parsed.records, mapping);
      if (pv.unmappedRequired.length) throw validation(`Campos obrigatórios sem coluna: ${pv.unmappedRequired.join(", ")}.`);
      stats = { total: pv.totalRows, valid: pv.validRows, invalid: pv.invalidRows, duplicates: pv.duplicates };
      issues = pv.issues.slice(0, 500);
      const ok = pv.rows.filter((r) => r.ok).map((r) => r.values);

      if (t === "charging_stations") {
        const list = ok.map((v) => ({
          externalId: (v.externalId as string) ?? `h:${createHash("sha1").update(`${v.lat}|${v.lng}|${v.name ?? ""}`).digest("hex").slice(0, 16)}`,
          name: (v.name as string) ?? null, operator: (v.operator as string) ?? null, lat: v.lat as number, lng: v.lng as number,
          maxPowerKw: (v.maxPowerKw as number) ?? null, connectors: (v.connectors as number) ?? null,
          currentType: normCurrent(v.currentType as string | null), connectorStandard: (v.connectorStandard as string) ?? null,
          openingHours: (v.openingHours as string) ?? null, address: (v.address as string) ?? null, raw: v,
        }));
        const r = await upsertExternalStations(tx, o.sourceKey, list, imp.id, ownerOrg);
        // preço e data de verificação vêm do arquivo (não verificados pela Tebras)
        for (const v of ok) if (v.pricePerKwh !== null || v.verifiedAt !== null) {
          await tx.execute(sql`update intel_charging_stations set price_per_kwh = coalesce(${v.pricePerKwh === null ? null : String(v.pricePerKwh)}, price_per_kwh), verified_at = coalesce(${v.verifiedAt as string | null}::date, verified_at) where import_id = ${imp.id} and lat = ${v.lat as number} and lng = ${v.lng as number}`);
        }
        if (org?.isDemo) await tx.execute(sql`update intel_charging_stations set is_demo = true where import_id = ${imp.id}`);
        inserted = r.inserted + r.updated;
        summary = r;
      } else if (t === "properties") {
        for (const v of ok) {
          await tx.insert(intelProperties).values({ organizationId: orgId, name: v.name as string, address: (v.address as string) ?? null, city: (v.city as string) ?? null, uf: typeof v.state === "string" && /^[A-Za-z]{2}$/.test(v.state) ? v.state.toUpperCase() : null, zip: typeof v.zip === "string" ? v.zip.replace(/\D/g, "").slice(0, 8) || null : null, lat: (v.lat as number) ?? null, lng: (v.lng as number) ?? null, areaM2: (v.areaM2 as number) ?? null, monthlyRent: v.monthlyRent === null ? null : String(v.monthlyRent), salePrice: v.salePrice === null ? null : String(v.salePrice), isDemo: org?.isDemo ?? false, geocodeSource: `importação ${file.name}`.slice(0, 100), createdBy: ctx.userId });
          inserted++;
        }
      } else if (t === "municipal_indicators") {
        for (const v of ok) {
          const key = (v.indicator as string) || o.indicatorFixed;
          if (!key || !(key in INDICATOR_DEFS)) { issues.push({ row: 0, message: `Indicador desconhecido: ${key ?? "(vazio)"} — use ${Object.keys(INDICATOR_DEFS).join(", ")}`, severity: "erro" }); continue; }
          let code = v.ibgeCode as number | null;
          if (code === null) {
            // Planilhas do SENATRAN trazem nome do município + UF, sem código IBGE
            const r = await tx.execute<{ c: number }>(sql`select ibge_code as c from intel_municipalities where uf = ${String(v.uf).trim().toUpperCase()} and lower(unaccent_simple(name)) = lower(unaccent_simple(${String(v.municipality).trim()})) limit 1`);
            code = r.rows[0]?.c ?? null;
            if (code === null) { issues.push({ row: 0, message: `Município não encontrado: ${v.municipality}/${v.uf} (carregue os municípios do IBGE antes)`, severity: "erro" }); continue; }
          }
          await tx.insert(intelGeographicIndicators).values({ organizationId: ownerOrg, indicator: key, municipalityCode: code, value: v.value as number, unit: INDICATOR_DEFS[key as keyof typeof INDICATOR_DEFS].unit, nature: "observado", referenceDate: v.referenceDate as string, resolution: "município", quality: o.quality, method: `Importado de ${file.name}`, sourceKey: o.sourceKey, importId: imp.id });
          inserted++;
        }
      } else if (t === "hub_operations") {
        if (!o.propertyId) throw validation("Selecione o hub (imóvel implantado) a que os dados se referem.", { propertyId: "Obrigatório" });
        const [p] = await tx.select({ org: intelProperties.organizationId }).from(intelProperties).where(eq(intelProperties.id, o.propertyId));
        if (!p) throw notFound("Imóvel não encontrado.");
        assertCanEditOrg(ctx, scope, p.org);
        for (const v of ok) {
          await tx.insert(intelHubObservations).values({ organizationId: p.org, propertyId: o.propertyId, date: v.date as string, sessions: v.sessions as number, energyKwh: v.energyKwh as number, importId: imp.id })
            .onConflictDoUpdate({ target: [intelHubObservations.propertyId, intelHubObservations.date], set: { sessions: v.sessions as number, energyKwh: v.energyKwh as number, importId: imp.id } });
          inserted++;
        }
      } else if (t === "evie") {
        const ev = summarizeEvie(pv);
        summary = ev;
        for (const v of ok) {
          const ref = (v.periodEnd as string) ?? (v.periodStart as string) ?? o.referenceDate;
          if (!ref) { issues.push({ row: 0, message: "Sem período nem data de referência — registro ignorado.", severity: "erro" }); continue; }
          let areaId: string | null = null;
          if (v.areaId) {
            const [a] = await tx.insert(intelGeographicAreas).values({ kind: "evie_celula", sourceKey: o.sourceKey, externalId: String(v.areaId), lat: (v.lat as number) ?? null, lng: (v.lng as number) ?? null, importId: imp.id, properties: { periodStart: v.periodStart, periodEnd: v.periodEnd } })
              .onConflictDoUpdate({ target: [intelGeographicAreas.sourceKey, intelGeographicAreas.externalId], set: { lat: (v.lat as number) ?? null, lng: (v.lng as number) ?? null, importId: imp.id } }).returning({ id: intelGeographicAreas.id });
            areaId = a.id;
          }
          if (v.lat === null && !areaId) continue;
          const base = { organizationId: ownerOrg, areaId, lat: (v.lat as number) ?? null, lng: (v.lng as number) ?? null, nature: "observado", referenceDate: ref, resolution: ev.spatialResolution, quality: o.quality, method: `EVIE agregado — ${file.name}`, sourceKey: o.sourceKey, importId: imp.id };
          if (typeof v.demandKwhDay === "number") { await tx.insert(intelGeographicIndicators).values({ ...base, indicator: "evie_demanda_kwh", value: v.demandKwhDay, unit: "kWh/dia" }); inserted++; }
          else if (typeof v.sessionsDay === "number") issues.push({ row: 0, message: "Sessões/dia do EVIE preservadas no arquivo original, mas sem kWh/sessão da fonte não são convertidas em energia.", severity: "aviso" });
          if (typeof v.score === "number") { await tx.insert(intelGeographicIndicators).values({ ...base, indicator: "evie_indice", value: v.score > 1 ? v.score / 100 : v.score, unit: "0–1" }); inserted++; }
        }
      }
    }
    const status = stats.invalid > 0 || issues.some((i) => (i as { severity?: string }).severity === "erro") ? "concluida_com_erros" : "concluida";
    await tx.update(intelDataImports).set({ status, totalRows: stats.total, validRows: stats.valid, invalidRows: stats.invalid, duplicates: stats.duplicates, insertedRows: inserted, issues: issues.slice(0, 500), summary }).where(eq(intelDataImports.id, imp.id));
    await tx.update(intelDataSources).set({ lastImportAt: new Date() }).where(eq(intelDataSources.key, o.sourceKey));
    return { importId: imp.id, inserted, status, ...stats };
  });
}

const normCurrent = (s: string | null): "AC" | "DC" | "AC_DC" | null => {
  if (!s) return null;
  const t = s.toUpperCase();
  if (t.includes("AC") && t.includes("DC")) return "AC_DC";
  if (t.includes("DC")) return "DC";
  if (t.includes("AC")) return "AC";
  return null;
};

export async function listImports(ctx: AuthContext) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, (tx) => tx.select({ i: intelDataImports, source: intelDataSources.name, user: sql<string | null>`(select name from users u where u.id = ${intelDataImports.createdBy})` })
    .from(intelDataImports).innerJoin(intelDataSources, eq(intelDataSources.key, intelDataImports.sourceKey))
    .where(scope.global ? undefined : sql`(${intelDataImports.organizationId} is null or ${orgFilter(scope, intelDataImports.organizationId) ?? sql`true`})`)
    .orderBy(desc(intelDataImports.createdAt)).limit(100));
}

/** Download do arquivo original (proveniência). */
export async function getImportFile(ctx: AuthContext, id: string) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, async (tx) => {
    const [r] = await tx.select({ d: intelImportedDatasets, name: intelDataImports.fileName }).from(intelImportedDatasets).innerJoin(intelDataImports, eq(intelDataImports.id, intelImportedDatasets.importId)).where(eq(intelImportedDatasets.importId, id));
    if (!r) throw notFound("Arquivo não encontrado.");
    if (r.d.organizationId && !scope.global && !scope.orgIds.includes(r.d.organizationId)) throw forbidden();
    return { name: r.name, contentType: r.d.contentType, content: r.d.content };
  });
}
