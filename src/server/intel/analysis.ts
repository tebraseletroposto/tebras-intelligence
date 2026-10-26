import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { intelDataSources, intelGeographicIndicators, intelModelVersions, intelMunicipalities } from "@/db/schema";
import { analyzeCompetition, type KnownStation, type StationStatus } from "@/lib/intel/competition";
import { DEFAULT_INDEX_CONFIG, computePotentialIndex, type IndexConfig, type IndexInputs } from "@/lib/intel/potential-index";
import { DATA_QUALITY, noData, type DataQuality, type Indicator } from "@/lib/intel/provenance";
import type { LvClass } from "@/lib/intel/low-voltage";

/** Indicadores municipais reconhecidos pelo modelo (chave → rótulo/unidade). */
export const INDICATOR_DEFS = {
  frota_bev: { label: "Frota elétrica (BEV)", unit: "veículos" },
  frota_phev: { label: "Frota híbrida plug-in (PHEV)", unit: "veículos" },
  frota_total: { label: "Frota total de veículos", unit: "veículos" },
  frota_comercial: { label: "Frota comercial (caminhonetes/utilitários)", unit: "veículos" },
  motoristas_app: { label: "Motoristas de aplicativo (fonte autorizada)", unit: "pessoas" },
  fluxo_veiculos: { label: "Fluxo de veículos medido", unit: "veículos/dia" },
  evie_demanda_kwh: { label: "Demanda agregada EVIE", unit: "kWh/dia" },
  evie_indice: { label: "Indicador relativo EVIE", unit: "0–1" },
} as const;

export type StationRow = KnownStation & { sourceKey: string; distanceM?: number };

/** Visibilidade de dados privados: públicos (organization_id nulo) + a organização dona do imóvel analisado. */
const visibleTo = (orgId: string | null) => (orgId ? sql`(organization_id is null or organization_id = ${orgId})` : sql`organization_id is null`);

export async function stationsNear(tx: Tx, lat: number, lng: number, radiusM: number, orgId: string | null = null): Promise<StationRow[]> {
  const r = await tx.execute<{ id: string; name: string | null; operator: string | null; lat: number; lng: number; max_power_kw: number | null; connectors: number | null; current_type: string | null; price_per_kwh: string | null; verification_status: string; verified_at: string | null; source_key: string; distance_m: number }>(sql`
    select id, name, operator, lat, lng, max_power_kw, connectors, current_type, price_per_kwh, verification_status, verified_at::text, source_key,
           ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_m
      from intel_charging_stations
     where ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM}) and ${visibleTo(orgId)}
     order by distance_m limit 2000`);
  return r.rows.map((s) => ({ id: s.id, name: s.name, operator: s.operator, lat: s.lat, lng: s.lng, maxPowerKw: s.max_power_kw, connectors: s.connectors, currentType: s.current_type as KnownStation["currentType"], pricePerKwh: s.price_per_kwh === null ? null : Number(s.price_per_kwh), status: s.verification_status as StationStatus, verifiedAt: s.verified_at, sourceKey: s.source_key, distanceM: s.distance_m }));
}

/** Último valor de cada indicador para o município (público ou da organização). */
export async function municipalIndicators(tx: Tx, municipalityCode: number | null, orgId: string | null = null): Promise<Record<string, Indicator>> {
  const out: Record<string, Indicator> = {};
  for (const [k, d] of Object.entries(INDICATOR_DEFS)) out[k] = noData(k, d.label, d.unit);
  if (municipalityCode === null) return out;
  const rows = await tx.selectDistinctOn([intelGeographicIndicators.indicator], { i: intelGeographicIndicators, sourceName: intelDataSources.name })
    .from(intelGeographicIndicators).innerJoin(intelDataSources, eq(intelDataSources.key, intelGeographicIndicators.sourceKey))
    .where(and(eq(intelGeographicIndicators.municipalityCode, municipalityCode), orgId ? sql`(${intelGeographicIndicators.organizationId} is null or ${intelGeographicIndicators.organizationId} = ${orgId})` : sql`${intelGeographicIndicators.organizationId} is null`))
    .orderBy(intelGeographicIndicators.indicator, desc(intelGeographicIndicators.referenceDate), desc(intelGeographicIndicators.createdAt));
  for (const { i, sourceName } of rows) {
    const def = INDICATOR_DEFS[i.indicator as keyof typeof INDICATOR_DEFS];
    out[i.indicator] = { key: i.indicator, label: def?.label ?? i.indicator, value: i.value, unit: i.unit, nature: i.nature as Indicator["nature"], source: sourceName, referenceDate: i.referenceDate, resolution: i.resolution, coverage: `Município ${municipalityCode}`, quality: i.quality as DataQuality, limitations: i.method };
  }
  return out;
}

/** Demanda agregada importada (EVIE) mais próxima do terreno, dentro de `radiusM`. Não interpola células. */
async function nearestExternalDemand(tx: Tx, lat: number, lng: number, orgId: string | null, radiusM = 1500) {
  const r = await tx.execute<{ indicator: string; value: number; reference_date: string; distance_m: number; quality: string }>(sql`
    select indicator, value, reference_date::text, quality, ST_Distance(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as distance_m
      from intel_geographic_indicators
     where indicator in ('evie_demanda_kwh','evie_indice') and location is not null
       and ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM}) and ${visibleTo(orgId)}
     order by distance_m, reference_date desc limit 10`);
  const kwh = r.rows.find((x) => x.indicator === "evie_demanda_kwh");
  const idx = r.rows.find((x) => x.indicator === "evie_indice");
  return { kwh: kwh ?? null, index: idx ?? null };
}

/** Distância até a via principal mais próxima pela malha OSM importada (null se a malha não cobre a área). */
async function mainRoadDistance(tx: Tx, lat: number, lng: number) {
  const r = await tx.execute<{ d: number | null; name: string | null }>(sql`
    select ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) as d, name
      from intel_roads where is_main and ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, 5000)
     order by geom <-> ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326) limit 1`);
  return r.rows[0] ?? null;
}

async function poisNear(tx: Tx, lat: number, lng: number, radiusM: number) {
  const r = await tx.execute<{ category: string; n: number }>(sql`
    select category, count(*)::int as n from intel_pois
     where ST_DWithin(location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM}) group by category order by n desc`);
  return r.rows;
}

export async function activeIndexConfig(tx: Tx): Promise<{ config: IndexConfig; version: string }> {
  const [r] = await tx.select().from(intelModelVersions).where(and(eq(intelModelVersions.kind, "potential_index"), eq(intelModelVersions.active, true))).limit(1);
  return r ? { config: r.config as IndexConfig, version: r.version } : { config: DEFAULT_INDEX_CONFIG, version: "padrao-v1 (não salvo)" };
}

type PropertyLike = { organizationId: string | null; lat: number | null; lng: number | null; municipalityCode: number | null; areaM2: number | null; parking: boolean | null; streetAccess: boolean | null; mainRoadDistanceM: number | null; destinationsWithin1km: number | null };

/** Análise completa de localização de um imóvel (concorrência + indicadores + índice). */
export async function analyzeSite(tx: Tx, p: PropertyLike, opts: { lowVoltage?: LvClass | null } = {}) {
  const { config, version } = await activeIndexConfig(tx);
  const org = p.organizationId;
  const stationsLoaded = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from intel_charging_stations where ${visibleTo(org)}`)).rows[0].n;
  const roadsLoaded = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from intel_roads`)).rows[0].n;
  const poisLoaded = (await tx.execute<{ n: number }>(sql`select count(*)::int as n from intel_pois`)).rows[0].n;

  const indicators = await municipalIndicators(tx, p.municipalityCode, org);
  const [mun] = p.municipalityCode === null ? [] : await tx.select().from(intelMunicipalities).where(eq(intelMunicipalities.ibgeCode, p.municipalityCode));
  const density: Indicator = mun?.population && mun.areaKm2
    ? { key: "densidade", label: "Densidade demográfica", value: mun.population / mun.areaKm2, unit: "hab/km²", nature: "estimado", source: "IBGE — Censo 2022 (população ÷ área)", referenceDate: mun.populationReference ?? "2022", resolution: "município", coverage: mun.name, quality: "alta", limitations: "Média municipal: não representa a densidade do entorno imediato do terreno." }
    : noData("densidade", "Densidade demográfica", "hab/km²", "População/área do município não carregadas (Catálogo de Dados → IBGE).");

  if (p.lat === null || p.lng === null) {
    const idx = computePotentialIndex({ bevFleet: indicators.frota_bev.value, phevFleet: indicators.frota_phev.value, populationDensity: density.value, mainRoadDistanceM: p.mainRoadDistanceM, destinationsWithin1km: p.destinationsWithin1km, competitorsWithin3km: null, externalDemandScore: null, areaM2: p.areaM2, streetAccess: p.streetAccess, parking: p.parking, lowVoltage: opts.lowVoltage ?? null, dataQuality: null }, config);
    return { located: false as const, indicators, density, index: idx, indexVersion: version, competition: null, stations: [], road: null, pois: [], coverage: { stationsLoaded, roadsLoaded, poisLoaded }, external: null };
  }

  const stations = await stationsNear(tx, p.lat, p.lng, 20_000, org);
  const competition = analyzeCompetition({ lat: p.lat, lng: p.lng }, stations);
  const road = p.mainRoadDistanceM !== null ? { d: p.mainRoadDistanceM, name: null, informed: true } : roadsLoaded ? await mainRoadDistance(tx, p.lat, p.lng).then((r) => (r ? { ...r, informed: false } : null)) : null;
  const pois = poisLoaded ? await poisNear(tx, p.lat, p.lng, 1000) : [];
  const destinations = p.destinationsWithin1km ?? (poisLoaded ? pois.reduce((s, x) => s + x.n, 0) : null);
  const external = await nearestExternalDemand(tx, p.lat, p.lng, org);
  const extIndex = external.index ? (external.index.value > 1 ? external.index.value / 100 : external.index.value) : null;

  const qualities = [indicators.frota_bev, indicators.frota_phev, density].filter((i) => i.value !== null).map((i) => DATA_QUALITY[i.quality].score);
  if (stationsLoaded) qualities.push(DATA_QUALITY.baixa.score);
  const dataQuality = qualities.length ? qualities.reduce((a, b) => a + b, 0) / qualities.length : null;

  const inputs: IndexInputs = {
    bevFleet: indicators.frota_bev.value, phevFleet: indicators.frota_phev.value, populationDensity: density.value,
    mainRoadDistanceM: road?.d ?? null, destinationsWithin1km: destinations,
    // Sem nenhum carregador na base, "zero concorrentes" seria falta de dado, não observação
    competitorsWithin3km: stationsLoaded ? competition.radii.find((r) => r.radiusKm === 3)!.count : null,
    externalDemandScore: extIndex, areaM2: p.areaM2, streetAccess: p.streetAccess, parking: p.parking, lowVoltage: opts.lowVoltage ?? null, dataQuality,
  };
  return { located: true as const, indicators, density, index: computePotentialIndex(inputs, config), indexVersion: version, competition, stations, road, pois, coverage: { stationsLoaded, roadsLoaded, poisLoaded }, external };
}
