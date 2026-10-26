import "server-only";
import { sql } from "drizzle-orm";
import type { Bbox } from "@/lib/intel/geo";
import type { AuthContext } from "../authz";
import { loadScope, withIntel } from "./scope";

/**
 * Camadas do mapa por área visível (bbox limitada — nunca o país inteiro por interação).
 * Mapa de calor agregado no servidor em células de grade; cada camada declara sua natureza.
 */

export const HEAT_LAYERS = {
  carregadores: { label: "Carregadores existentes (conhecidos)", nature: "observado", legend: "Quantidade de carregadores conhecidos por célula. Ausência pode ser falta de cobertura da base." },
  frota_bev: { label: "Frota elétrica conhecida (BEV)", nature: "observado", legend: "Frota municipal importada, exibida no centróide do município (resolução municipal)." },
  frota_phev: { label: "Frota híbrida plug-in conhecida", nature: "observado", legend: "Frota municipal importada, exibida no centróide do município (resolução municipal)." },
  densidade: { label: "Densidade residencial", nature: "estimado", legend: "População ÷ área do município (IBGE). Média municipal, não por rua." },
  comercial: { label: "Atividade comercial", nature: "observado", legend: "Pontos de interesse comerciais importados do OSM por célula." },
  fluxo: { label: "Fluxo viário disponível", nature: "observado", legend: "Contagens de tráfego importadas — representam apenas os pontos medidos." },
  potencial: { label: "Indicador de potencial de recarga", nature: "estimado", legend: "Indicador INDIRETO (EVIE importado quando houver). Não é demanda real medida." },
  qualidade: { label: "Qualidade e cobertura dos dados", nature: "estimado", legend: "Número de fontes distintas com dados por célula." },
} as const;
export type HeatLayer = keyof typeof HEAT_LAYERS;

const env = (b: Bbox) => sql`ST_MakeEnvelope(${b.minLng}, ${b.minLat}, ${b.maxLng}, ${b.maxLat}, 4326)`;

/** Tamanho de célula proporcional à área visível (~40 células na largura). */
export const cellSizeFor = (b: Bbox) => Math.max(0.005, Math.min(0.5, (b.maxLng - b.minLng) / 40));

export async function heatLayer(ctx: AuthContext, layer: HeatLayer, b: Bbox, period?: { from?: string; to?: string }) {
  const scope = await loadScope(ctx);
  const cell = cellSizeFor(b);
  const orgs = `{${scope.orgIds.join(",")}}`;
  const visible = scope.global ? sql`true` : sql`(organization_id is null or organization_id = any(${orgs}::uuid[]))`;
  const dateFilter = (col: string) => sql.join([period?.from ? sql`${sql.raw(col)} >= ${period.from}::date` : sql`true`, period?.to ? sql`${sql.raw(col)} <= ${period.to}::date` : sql`true`], sql` and `);
  return withIntel(ctx, scope, async (tx) => {
    let q;
    const grid = (src: ReturnType<typeof sql>, valueExpr: ReturnType<typeof sql>) => sql`
      select floor(lng / ${cell})::int as i, floor(lat / ${cell})::int as j, ${valueExpr} as v from (${src}) s group by 1, 2`;
    const indicator = (key: string) => grid(sql`select lng, lat, value from (select distinct on (municipality_code, coalesce(area_id::text, ''), lat, lng) lng, lat, value from intel_geographic_indicators
        where indicator = ${key} and location is not null and ST_Intersects(location::geometry, ${env(b)}) and ${visible} and ${dateFilter("reference_date")} order by municipality_code, coalesce(area_id::text, ''), lat, lng, reference_date desc) x`, sql`sum(value)`);
    const munIndicator = (key: string) => grid(sql`select m.lng, m.lat, i.value from intel_municipalities m join lateral (select value from intel_geographic_indicators g where g.municipality_code = m.ibge_code and g.indicator = ${key} and ${dateFilter("g.reference_date")} and ${scope.global ? sql`true` : sql`(g.organization_id is null or g.organization_id = any(${orgs}::uuid[]))`} order by reference_date desc limit 1) i on true
        where m.location is not null and ST_Intersects(m.location::geometry, ${env(b)})`, sql`sum(value)`);
    switch (layer) {
      case "carregadores": q = grid(sql`select lng, lat from intel_charging_stations where ST_Intersects(location::geometry, ${env(b)}) and ${visible}`, sql`count(*)`); break;
      case "frota_bev": q = munIndicator("frota_bev"); break;
      case "frota_phev": q = munIndicator("frota_phev"); break;
      case "densidade": q = grid(sql`select lng, lat, population / nullif(area_km2, 0) as d from intel_municipalities where population is not null and location is not null and ST_Intersects(location::geometry, ${env(b)})`, sql`max(d)`); break;
      case "comercial": q = grid(sql`select lng, lat from intel_pois where category in ('shopping','polo_comercial','supermercado','restaurante','empresa') and ST_Intersects(location::geometry, ${env(b)})`, sql`count(*)`); break;
      case "fluxo": q = indicator("fluxo_veiculos"); break;
      case "potencial": q = grid(sql`select lng, lat, value from intel_geographic_indicators where indicator in ('evie_indice') and location is not null and ST_Intersects(location::geometry, ${env(b)}) and ${visible} and ${dateFilter("reference_date")}`, sql`avg(value)`); break;
      case "qualidade": q = grid(sql`
          select lng, lat, 'carregadores' as k from intel_charging_stations where ST_Intersects(location::geometry, ${env(b)}) and ${visible}
          union all select lng, lat, source_key from intel_geographic_indicators where location is not null and ST_Intersects(location::geometry, ${env(b)}) and ${visible}
          union all select lng, lat, 'poi' from intel_pois where ST_Intersects(location::geometry, ${env(b)})
          union all select lng, lat, 'ibge' from intel_municipalities where population is not null and location is not null and ST_Intersects(location::geometry, ${env(b)})`, sql`count(distinct k)`); break;
    }
    const rows = (await tx.execute<{ i: number; j: number; v: string | number | null }>(q)).rows;
    const max = rows.reduce((m, r) => Math.max(m, Number(r.v) || 0), 0);
    return {
      type: "FeatureCollection" as const,
      meta: { layer, ...HEAT_LAYERS[layer], cellDeg: cell, cells: rows.length, max },
      features: rows.filter((r) => r.v !== null).map((r) => {
        const x = r.i * cell, y = r.j * cell;
        return { type: "Feature" as const, properties: { v: Number(r.v), n: max > 0 ? Number(r.v) / max : 0 }, geometry: { type: "Polygon" as const, coordinates: [[[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell], [x, y]]] } };
      }),
    };
  });
}

export async function pointLayers(ctx: AuthContext, b: Bbox) {
  const scope = await loadScope(ctx);
  const orgs = `{${scope.orgIds.join(",")}}`;
  return withIntel(ctx, scope, async (tx) => {
    const stations = (await tx.execute<{ id: string; name: string | null; operator: string | null; lat: number; lng: number; max_power_kw: number | null; verification_status: string; source_key: string; is_demo: boolean }>(sql`
      select id, name, operator, lat, lng, max_power_kw, verification_status, source_key, is_demo from intel_charging_stations
       where ST_Intersects(location::geometry, ${env(b)}) and ${scope.global ? sql`true` : sql`(organization_id is null or organization_id = any(${orgs}::uuid[]))`} limit 3000`)).rows;
    const props = (await tx.execute<{ id: string; name: string; lat: number; lng: number; status: string; is_demo: boolean; polygon: string | null }>(sql`
      select id, name, lat, lng, status, is_demo, ST_AsGeoJSON(polygon) as polygon from intel_properties
       where location is not null and ST_Intersects(location::geometry, ${env(b)}) and ${scope.currentOrgId ? sql`organization_id = ${scope.currentOrgId}` : sql`false`} limit 2000`)).rows;
    return {
      stations: { type: "FeatureCollection" as const, features: stations.map((s) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [s.lng, s.lat] }, properties: { id: s.id, name: s.name ?? "Sem nome", operator: s.operator ?? "Operador não informado", power: s.max_power_kw, status: s.verification_status, source: s.source_key, demo: s.is_demo } })) },
      properties: { type: "FeatureCollection" as const, features: props.map((p) => ({ type: "Feature" as const, geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] }, properties: { id: p.id, name: p.name, status: p.status, demo: p.is_demo } })) },
      polygons: { type: "FeatureCollection" as const, features: props.filter((p) => p.polygon).map((p) => ({ type: "Feature" as const, geometry: JSON.parse(p.polygon as string), properties: { id: p.id, name: p.name } })) },
      truncated: stations.length >= 3000 || props.length >= 2000,
    };
  });
}
