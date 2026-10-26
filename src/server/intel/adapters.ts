import "server-only";

/**
 * Adaptadores de fontes externas. Cada adaptador:
 *  - recebe `fetch` injetável (testes usam respostas gravadas, sem rede);
 *  - aplica tempo limite, User-Agent identificado e limites de uso do provedor;
 *  - converte a resposta para o modelo interno e NUNCA inventa campos ausentes.
 * A URL de cada serviço é configurável por variável de ambiente (instância própria em produção).
 */

export type Fetcher = typeof fetch;

export const USER_AGENT = process.env.INTEL_USER_AGENT || "TebrasIntelligence/1.0 (contato: configure INTEL_USER_AGENT)";

export class SourceError extends Error {
  constructor(message: string, public readonly sourceKey: string, public readonly kind: "rede" | "http" | "formato" | "credencial" | "limite") { super(message); }
}

async function getJson(f: Fetcher, url: string, sourceKey: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<unknown> {
  let res: Response;
  try {
    res = await f(url, { ...init, headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    throw new SourceError(`Falha de rede ao acessar ${new URL(url).host}: ${(e as Error).message}`, sourceKey, "rede");
  }
  if (res.status === 429) throw new SourceError("Limite de uso do provedor atingido (HTTP 429).", sourceKey, "limite");
  if (res.status === 401 || res.status === 403) throw new SourceError(`Acesso negado pelo provedor (HTTP ${res.status}).`, sourceKey, "credencial");
  if (!res.ok) throw new SourceError(`Resposta HTTP ${res.status} de ${new URL(url).host}.`, sourceKey, "http");
  try { return await res.json(); } catch { throw new SourceError("Resposta não é JSON válido.", sourceKey, "formato"); }
}

/* ------------------------------- IBGE ------------------------------- */

const IBGE_BASE = () => process.env.IBGE_API_URL || "https://servicodados.ibge.gov.br/api";

export type IbgeMunicipality = { ibgeCode: number; name: string; uf: string };

export async function ibgeMunicipalities(uf: string, f: Fetcher = fetch): Promise<IbgeMunicipality[]> {
  if (!/^[A-Z]{2}$/.test(uf)) throw new SourceError("UF inválida.", "ibge_localidades", "formato");
  const data = await getJson(f, `${IBGE_BASE()}/v1/localidades/estados/${uf}/municipios`, "ibge_localidades");
  if (!Array.isArray(data)) throw new SourceError("Formato inesperado (esperava lista).", "ibge_localidades", "formato");
  return data.map((m: { id?: unknown; nome?: unknown }) => {
    if (typeof m.id !== "number" || typeof m.nome !== "string") throw new SourceError("Município sem id/nome.", "ibge_localidades", "formato");
    return { ibgeCode: m.id, name: m.nome, uf };
  });
}

/**
 * População residente (variável 93) e área territorial (variável 6318) do Censo 2022 — tabela 4714 do SIDRA.
 * Retorna somente os municípios presentes na resposta; ausentes ficam sem dado.
 */
export async function ibgePopulation(ufCode: number, f: Fetcher = fetch): Promise<Map<number, { population: number | null; areaKm2: number | null; period: string }>> {
  const url = `${IBGE_BASE()}/v3/agregados/4714/periodos/2022/variaveis/93|6318?localidades=N6[N3[${ufCode}]]`;
  const data = await getJson(f, url, "ibge_populacao", {}, 45_000);
  if (!Array.isArray(data)) throw new SourceError("Formato inesperado do SIDRA.", "ibge_populacao", "formato");
  const out = new Map<number, { population: number | null; areaKm2: number | null; period: string }>();
  for (const v of data as { id: string; resultados: { series: { localidade: { id: string }; serie: Record<string, string> }[] }[] }[]) {
    for (const r of v.resultados ?? []) for (const s of r.series ?? []) {
      const code = Number(s.localidade?.id);
      const raw = s.serie?.["2022"];
      const n = raw && !["-", "...", "X"].includes(raw) ? Number(raw) : null;
      const cur = out.get(code) ?? { population: null, areaKm2: null, period: "2022" };
      if (String(v.id) === "93") cur.population = n === null || !Number.isFinite(n) ? null : Math.round(n);
      if (String(v.id) === "6318") cur.areaKm2 = n === null || !Number.isFinite(n) ? null : n;
      out.set(code, cur);
    }
  }
  return out;
}

/* ----------------------------- Nominatim ----------------------------- */

const NOMINATIM = () => process.env.NOMINATIM_URL || "https://nominatim.openstreetmap.org";
let lastNominatimCall = 0;
const geocodeCache = new Map<string, { at: number; value: GeocodeResult[] }>();

export type GeocodeResult = { lat: number; lng: number; displayName: string; city: string | null; uf: string | null; district: string | null; zip: string | null; road: string | null; type: string | null };

const UF_BY_NAME: Record<string, string> = { "acre": "AC", "alagoas": "AL", "amapá": "AP", "amazonas": "AM", "bahia": "BA", "ceará": "CE", "distrito federal": "DF", "espírito santo": "ES", "goiás": "GO", "maranhão": "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", "pará": "PA", "paraíba": "PB", "paraná": "PR", "pernambuco": "PE", "piauí": "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", "rondônia": "RO", "roraima": "RR", "santa catarina": "SC", "são paulo": "SP", "sergipe": "SE", "tocantins": "TO" };

/** Geocodificação respeitando a política do Nominatim público: ≤ 1 req/s, cache, User-Agent, restrito ao Brasil. */
export async function geocode(query: string, f: Fetcher = fetch, opts: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {}): Promise<GeocodeResult[]> {
  const q = query.trim().slice(0, 200);
  if (q.length < 3) return [];
  const now = opts.now ?? Date.now;
  const cached = geocodeCache.get(q.toLowerCase());
  if (cached && now() - cached.at < 24 * 3600_000) return cached.value;
  const wait = 1100 - (now() - lastNominatimCall);
  if (wait > 0) await (opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(wait);
  lastNominatimCall = now();
  const url = `${NOMINATIM()}/search?format=jsonv2&addressdetails=1&limit=5&countrycodes=br&accept-language=pt-BR&q=${encodeURIComponent(q)}`;
  const data = await getJson(f, url, "osm_nominatim");
  if (!Array.isArray(data)) throw new SourceError("Formato inesperado do Nominatim.", "osm_nominatim", "formato");
  const value = data.map((r: { lat: string; lon: string; display_name: string; type?: string; address?: Record<string, string> }) => {
    const a = r.address ?? {};
    const iso = a["ISO3166-2-lvl4"];
    return {
      lat: Number(r.lat), lng: Number(r.lon), displayName: r.display_name, type: r.type ?? null,
      city: a.city ?? a.town ?? a.village ?? a.municipality ?? null,
      uf: iso?.startsWith("BR-") ? iso.slice(3) : a.state ? UF_BY_NAME[a.state.toLowerCase()] ?? null : null,
      district: a.suburb ?? a.neighbourhood ?? a.city_district ?? null,
      zip: a.postcode ?? null, road: a.road ?? null,
    };
  }).filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
  geocodeCache.set(q.toLowerCase(), { at: now(), value });
  return value;
}

/* ------------------------------ Overpass ------------------------------ */

const OVERPASS = () => process.env.OVERPASS_URL || "https://overpass-api.de/api/interpreter";

export type ExternalStation = { externalId: string; name: string | null; operator: string | null; lat: number; lng: number; maxPowerKw: number | null; connectors: number | null; currentType: "AC" | "DC" | "AC_DC" | null; connectorStandard: string | null; openingHours: string | null; address: string | null; raw: Record<string, unknown> };

/** Extrai a maior potência de tags OSM como "socket:ccs:output" = "50 kW" | "22kW" | "7400 W". */
export function osmPowerKw(tags: Record<string, string>): number | null {
  let max: number | null = null;
  for (const [k, v] of Object.entries(tags)) {
    if (!/(^socket:.+:output$)|(^charging_station:output$)/.test(k)) continue;
    for (const part of v.split(/[;,]/)) {
      const m = /([\d.]+)\s*(kw|w|kva)?/i.exec(part.trim());
      if (!m) continue;
      let n = Number(m[1]);
      if (!Number.isFinite(n)) continue;
      if ((m[2] ?? "").toLowerCase() === "w") n = n / 1000;
      if (n > 0 && n <= 1000) max = Math.max(max ?? 0, n);
    }
  }
  return max;
}

export function parseOverpassStations(data: unknown): ExternalStation[] {
  const els = (data as { elements?: unknown[] })?.elements;
  if (!Array.isArray(els)) throw new SourceError("Formato inesperado do Overpass.", "osm_overpass", "formato");
  return els.flatMap((e) => {
    const el = e as { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (typeof lat !== "number" || typeof lng !== "number") return [];
    const t = el.tags ?? {};
    const sockets = Object.keys(t).filter((k) => /^socket:[^:]+$/.test(k));
    const dc = sockets.some((k) => /ccs|chademo|gb_t_dc|type2_combo|tesla_supercharger/.test(k));
    const ac = sockets.some((k) => /type2$|type1$|gb_t_ac|schuko|type2_cable/.test(k));
    const count = sockets.reduce((s, k) => s + (Number(t[k]) || 0), 0);
    const addr = [t["addr:street"], t["addr:housenumber"], t["addr:city"]].filter(Boolean).join(", ");
    return [{
      externalId: `${el.type}/${el.id}`, name: t.name ?? null, operator: t.operator ?? t.network ?? t.brand ?? null, lat, lng,
      maxPowerKw: osmPowerKw(t), connectors: count > 0 ? count : t.capacity ? Number(t.capacity) || null : null,
      currentType: dc && ac ? "AC_DC" : dc ? "DC" : ac ? "AC" : null,
      connectorStandard: sockets.map((k) => k.slice(7)).join(", ") || null, openingHours: t.opening_hours ?? null, address: addr || null, raw: t,
    }];
  });
}

/** Busca estações de recarga mapeadas no OSM dentro de uma caixa (área limitada — nunca o país inteiro). */
export async function overpassStations(b: { minLat: number; minLng: number; maxLat: number; maxLng: number }, f: Fetcher = fetch) {
  if (b.maxLat - b.minLat > 1.5 || b.maxLng - b.minLng > 1.5) throw new SourceError("Área grande demais para o Overpass público (máx. 1,5°). Use extratos regionais.", "osm_overpass", "limite");
  const q = `[out:json][timeout:50];nwr["amenity"="charging_station"](${b.minLat},${b.minLng},${b.maxLat},${b.maxLng});out center tags;`;
  const data = await getJson(f, OVERPASS(), "osm_overpass", { method: "POST", body: new URLSearchParams({ data: q }), headers: { "Content-Type": "application/x-www-form-urlencoded" } }, 60_000);
  return parseOverpassStations(data);
}

/* --------------------------- Open Charge Map --------------------------- */

export async function openChargeMapStations(b: { lat: number; lng: number; radiusKm: number }, f: Fetcher = fetch): Promise<ExternalStation[]> {
  const key = process.env.OPEN_CHARGE_MAP_API_KEY;
  if (!key) throw new SourceError("OPEN_CHARGE_MAP_API_KEY não configurada.", "open_charge_map", "credencial");
  const url = `https://api.openchargemap.io/v3/poi?output=json&countrycode=BR&maxresults=500&compact=true&verbose=false&latitude=${b.lat}&longitude=${b.lng}&distance=${b.radiusKm}&distanceunit=KM`;
  const data = await getJson(f, url, "open_charge_map", { headers: { "X-API-Key": key } });
  if (!Array.isArray(data)) throw new SourceError("Formato inesperado do Open Charge Map.", "open_charge_map", "formato");
  return data.flatMap((p: { ID: number; AddressInfo?: { Title?: string; Latitude?: number; Longitude?: number; AddressLine1?: string; Town?: string }; OperatorInfo?: { Title?: string }; Connections?: { PowerKW?: number; Quantity?: number; CurrentTypeID?: number }[] }) => {
    const a = p.AddressInfo;
    if (typeof a?.Latitude !== "number" || typeof a?.Longitude !== "number") return [];
    const conns = p.Connections ?? [];
    const powers = conns.map((c) => c.PowerKW).filter((x): x is number => typeof x === "number" && x > 0);
    const hasDc = conns.some((c) => c.CurrentTypeID === 30);
    const hasAc = conns.some((c) => c.CurrentTypeID === 10 || c.CurrentTypeID === 20);
    const qty = conns.reduce((s, c) => s + (c.Quantity ?? 0), 0);
    return [{ externalId: `ocm/${p.ID}`, name: a.Title ?? null, operator: p.OperatorInfo?.Title ?? null, lat: a.Latitude, lng: a.Longitude, maxPowerKw: powers.length ? Math.max(...powers) : null, connectors: qty || null, currentType: hasAc && hasDc ? "AC_DC" : hasDc ? "DC" : hasAc ? "AC" : null, connectorStandard: null, openingHours: null, address: [a.AddressLine1, a.Town].filter(Boolean).join(", ") || null, raw: p as unknown as Record<string, unknown> }];
  });
}

/** Teste real de conectividade de uma fonte. Não marca "funcionando" sem resposta válida. */
export async function testSource(key: string, f: Fetcher = fetch): Promise<{ ok: boolean; detail: string }> {
  try {
    switch (key) {
      case "ibge_localidades": { const r = await ibgeMunicipalities("AC", f); return { ok: r.length > 0, detail: `${r.length} municípios do AC retornados.` }; }
      case "ibge_populacao": { const r = await ibgePopulation(12, f); return { ok: r.size > 0, detail: `${r.size} municípios com população.` }; }
      case "osm_nominatim": { const r = await geocode("Avenida Paulista, São Paulo", f); return { ok: r.length > 0, detail: `${r.length} resultado(s).` }; }
      case "osm_overpass": { const r = await overpassStations({ minLat: -23.57, minLng: -46.66, maxLat: -23.55, maxLng: -46.64 }, f); return { ok: true, detail: `${r.length} estação(ões) na área de teste.` }; }
      case "open_charge_map": { const r = await openChargeMapStations({ lat: -23.56, lng: -46.65, radiusKm: 2 }, f); return { ok: true, detail: `${r.length} ponto(s).` }; }
      case "osm_tiles": {
        const url = (process.env.MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png").replace("{z}", "3").replace("{x}", "2").replace("{y}", "4");
        const res = await f(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(15_000) });
        return { ok: res.ok, detail: `HTTP ${res.status}` };
      }
      default: return { ok: false, detail: "Fonte sem teste automático (importação manual ou não implementada)." };
    }
  } catch (e) {
    return { ok: false, detail: e instanceof SourceError ? e.message : `Erro: ${(e as Error).message}` };
  }
}
