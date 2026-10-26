import "./env";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { intelDataSources, intelMunicipalities, intelPois } from "../src/db/schema";
import { ibgeMunicipalities, ibgePopulation, parseOverpassStations, USER_AGENT } from "../src/server/intel/adapters";
import { upsertExternalStations } from "../src/server/intel/sources";

/**
 * Carga de dados PÚBLICOS reais do estado de São Paulo, executada no servidor (precisa de internet).
 *
 *   pnpm dados:sp                       → todas as etapas
 *   pnpm dados:sp ibge carregadores     → só as etapas indicadas (ibge | carregadores | vias | pois)
 *
 * - IBGE: 645 municípios, população e área do Censo 2022 e ponto interno de cada município (malha oficial).
 * - OpenStreetMap (Overpass): carregadores (amenity=charging_station) de todo o estado, vias principais da
 *   Região Metropolitana de São Paulo e polos de atração (shoppings, aeroportos, terminais, estações).
 * - Respeita os servidores públicos: consultas em blocos, com pausa entre elas e User-Agent identificado.
 *   Pode levar 15–30 minutos. Pode ser executado de novo: atualiza sem duplicar e preserva carregadores "confirmados".
 * - Frota do SENATRAN não tem API: baixe a planilha e importe pela tela Importação de dados (ver docs/INTELLIGENCE.md).
 */

const IBGE = process.env.IBGE_API_URL || "https://servicodados.ibge.gov.br/api";
const OVERPASS = process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";
const SP_BBOX = { minLat: -25.35, minLng: -53.15, maxLat: -19.75, maxLng: -44.15 };
const RMSP_BBOX = { minLat: -24.05, minLng: -47.2, maxLat: -23.15, maxLng: -46.1 };
const MAIN = new Set(["motorway", "trunk", "primary", "secondary", "motorway_link", "trunk_link", "primary_link"]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tiles(b: typeof SP_BBOX, step: number) {
  const out: (typeof SP_BBOX)[] = [];
  for (let lat = b.minLat; lat < b.maxLat; lat += step)
    for (let lng = b.minLng; lng < b.maxLng; lng += step)
      out.push({ minLat: +lat.toFixed(4), minLng: +lng.toFixed(4), maxLat: +Math.min(lat + step, b.maxLat).toFixed(4), maxLng: +Math.min(lng + step, b.maxLng).toFixed(4) });
  return out;
}

async function overpass(query: string, attempt = 1): Promise<{ elements: unknown[] }> {
  const res = await fetch(OVERPASS, { method: "POST", body: new URLSearchParams({ data: query }), headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" }, signal: AbortSignal.timeout(180_000) }).catch((e) => ({ ok: false, status: 0, statusText: String(e) }) as Response);
  if ((res.status === 429 || res.status === 504 || res.status === 0) && attempt <= 4) {
    console.log(`   servidor ocupado (HTTP ${res.status}); nova tentativa em ${30 * attempt}s…`);
    await sleep(30_000 * attempt);
    return overpass(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`Overpass HTTP ${res.status}`);
  return res.json();
}

const bb = (b: typeof SP_BBOX) => `${b.minLat},${b.minLng},${b.maxLat},${b.maxLng}`;
const mark = (key: string) => getDb().update(intelDataSources).set({ lastImportAt: new Date(), status: "funcionando", lastTestOk: true, lastError: null, lastTestAt: new Date() }).where(eq(intelDataSources.key, key));

async function ibge() {
  console.log("IBGE: municípios de SP…");
  const muns = await ibgeMunicipalities("SP");
  const pop = await ibgePopulation(35);
  console.log(`   ${muns.length} municípios; ${pop.size} com dados do Censo 2022. Malha municipal…`);
  const res = await fetch(`${IBGE}/v3/malhas/estados/35?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=minima`, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`Malha IBGE HTTP ${res.status}`);
  const geo = (await res.json()) as { features: { properties: { codarea: string }; geometry: unknown }[] };
  const db = getDb();
  await db.transaction(async (tx) => {
    for (const m of muns) {
      const p = pop.get(m.ibgeCode);
      const v = { name: m.name, uf: "SP", sourceKey: "ibge_localidades", updatedAt: new Date(), population: p?.population ?? null, areaKm2: p?.areaKm2 ?? null, populationReference: p ? "Censo 2022" : null };
      await tx.insert(intelMunicipalities).values({ ibgeCode: m.ibgeCode, ...v }).onConflictDoUpdate({ target: intelMunicipalities.ibgeCode, set: v });
    }
    // Ponto interno (ST_PointOnSurface) da malha oficial: usado para exibir indicadores municipais no mapa
    for (const f of geo.features) {
      await tx.execute(sql`update intel_municipalities m set lat = ST_Y(pt), lng = ST_X(pt)
        from (select ST_PointOnSurface(ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(f.geometry)}), 4326)) as pt) x where m.ibge_code = ${Number(f.properties.codarea)}`);
    }
  });
  await mark("ibge_localidades"); await mark("ibge_populacao");
  console.log("   IBGE concluído.");
}

async function chargers() {
  const list = tiles(SP_BBOX, 1.4);
  console.log(`OSM: carregadores em ${list.length} blocos do estado…`);
  let total = 0, ins = 0, upd = 0, kept = 0;
  for (const [i, t] of list.entries()) {
    const data = await overpass(`[out:json][timeout:120];nwr["amenity"="charging_station"](${bb(t)});out center tags;`);
    const st = parseOverpassStations(data);
    const r = await getDb().transaction((tx) => upsertExternalStations(tx, "osm_overpass", st, null));
    total += st.length; ins += r.inserted; upd += r.updated; kept += r.skipped;
    console.log(`   bloco ${i + 1}/${list.length}: ${st.length}`);
    await sleep(4000);
  }
  await mark("osm_overpass");
  console.log(`   ${total} carregadores (${ins} novos, ${upd} atualizados, ${kept} confirmados preservados). Todos entram como "não verificados".`);
}

async function roads() {
  const list = tiles(RMSP_BBOX, 0.15);
  console.log(`OSM: vias principais da Região Metropolitana em ${list.length} blocos…`);
  let n = 0;
  for (const [i, t] of list.entries()) {
    const data = await overpass(`[out:json][timeout:120];way["highway"~"^(motorway|trunk|primary|secondary)(_link)?$"](${bb(t)});out geom tags;`);
    await getDb().transaction(async (tx) => {
      for (const e of data.elements as { id: number; geometry?: { lat: number; lon: number }[]; tags?: Record<string, string> }[]) {
        if (!e.geometry || e.geometry.length < 2 || !e.tags?.highway) continue;
        const gj = JSON.stringify({ type: "MultiLineString", coordinates: [e.geometry.map((p) => [p.lon, p.lat])] });
        await tx.execute(sql`insert into intel_roads (osm_id, name, highway, is_main, geom, source_key)
          values (${`way/${e.id}`}, ${e.tags.name ?? null}, ${e.tags.highway}, ${MAIN.has(e.tags.highway)}, ST_SetSRID(ST_GeomFromGeoJSON(${gj}), 4326), 'osm_extrato')
          on conflict (source_key, osm_id) do update set name = excluded.name, highway = excluded.highway, is_main = excluded.is_main, geom = excluded.geom`);
        n++;
      }
    });
    if ((i + 1) % 10 === 0) console.log(`   bloco ${i + 1}/${list.length} (${n} trechos)`);
    await sleep(3000);
  }
  await mark("osm_extrato");
  console.log(`   ${n} trechos de vias principais.`);
}

const POI_QUERY = (b: string) => `[out:json][timeout:120];(
  nwr["shop"="mall"](${b}); nwr["aeroway"="aerodrome"]["iata"](${b}); nwr["amenity"="bus_station"](${b});
  nwr["railway"="station"](${b}); nwr["amenity"="university"](${b}); nwr["shop"="supermarket"]["brand"](${b});
  nwr["amenity"="hospital"](${b}); nwr["tourism"="hotel"](${b}); );out center tags;`;
function poiCategory(t: Record<string, string>) {
  if (t.shop === "mall") return "shopping";
  if (t.aeroway === "aerodrome") return "aeroporto";
  if (t.amenity === "bus_station") return "terminal_rodoviario";
  if (t.railway === "station") return "estacao";
  if (t.amenity === "university") return "universidade";
  if (t.shop === "supermarket") return "supermercado";
  if (t.amenity === "hospital") return "hospital";
  if (t.tourism === "hotel") return "hotel";
  return null;
}

async function pois() {
  const list = tiles(SP_BBOX, 1.4);
  console.log(`OSM: polos de atração em ${list.length} blocos…`);
  let n = 0;
  for (const t of list) {
    const data = await overpass(POI_QUERY(bb(t)));
    for (const e of data.elements as { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[]) {
      const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon, cat = poiCategory(e.tags ?? {});
      if (lat === undefined || lng === undefined || !cat) continue;
      const v = { category: cat, name: e.tags?.name ?? null, lat, lng };
      await getDb().insert(intelPois).values({ ...v, externalId: `${e.type}/${e.id}`, sourceKey: "osm_extrato" }).onConflictDoUpdate({ target: [intelPois.sourceKey, intelPois.externalId], set: v });
      n++;
    }
    await sleep(4000);
  }
  console.log(`   ${n} polos de atração.`);
}

const STEPS = { ibge, carregadores: chargers, vias: roads, pois } as const;

async function main() {
  const asked = process.argv.slice(2).filter((a) => a in STEPS) as (keyof typeof STEPS)[];
  for (const s of asked.length ? asked : (Object.keys(STEPS) as (keyof typeof STEPS)[])) {
    try { await STEPS[s](); } catch (e) {
      console.error(`Falha na etapa ${s}: ${(e as Error).message}. As demais etapas continuam; execute novamente depois.`);
      process.exitCode = 1;
    }
  }
  console.log("Dados © IBGE e © colaboradores do OpenStreetMap (ODbL). Frota: importe a planilha do SENATRAN pela tela Importação de dados.");
}

main().finally(closeDb);
