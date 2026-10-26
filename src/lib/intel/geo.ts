/**
 * Geometria básica do Tebras Intelligence (funções puras, sem dependência de banco).
 * No servidor, consultas espaciais em grande volume usam PostGIS (geography, ST_DWithin);
 * estas funções servem para validação, cálculos locais e testes.
 */

export type LatLng = { lat: number; lng: number };

/** Envelope aproximado do território brasileiro (inclui ilhas oceânicas). */
export const BRAZIL_BOUNDS = { minLat: -34.0, maxLat: 5.6, minLng: -74.1, maxLng: -28.6 } as const;

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export type CoordCheck = { ok: true; value: LatLng; outsideBrazil: boolean } | { ok: false; error: string };

/**
 * Valida coordenadas WGS84. Aceita número ou texto com vírgula decimal ("-23,56").
 * Coordenadas (0,0) são rejeitadas: quase sempre indicam campo vazio convertido em zero.
 */
export function parseCoordinates(latIn: unknown, lngIn: unknown): CoordCheck {
  const toNum = (v: unknown) => {
    if (typeof v === "number") return v;
    if (typeof v !== "string" || v.trim() === "") return NaN;
    return Number(v.trim().replace(",", "."));
  };
  const lat = toNum(latIn);
  const lng = toNum(lngIn);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { ok: false, error: "Latitude e longitude devem ser números." };
  if (lat < -90 || lat > 90) return { ok: false, error: "Latitude fora do intervalo −90 a 90." };
  if (lng < -180 || lng > 180) return { ok: false, error: "Longitude fora do intervalo −180 a 180." };
  if (lat === 0 && lng === 0) return { ok: false, error: "Coordenada (0, 0) inválida — provável campo vazio." };
  const outsideBrazil = lat < BRAZIL_BOUNDS.minLat || lat > BRAZIL_BOUNDS.maxLat || lng < BRAZIL_BOUNDS.minLng || lng > BRAZIL_BOUNDS.maxLng;
  return { ok: true, value: { lat, lng }, outsideBrazil };
}

/** Distância em linha reta (haversine), em metros. Não é distância pela rede viária. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumo inicial de a para b em graus (0 = norte), usado no croqui de localização dos relatórios. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Caixa envolvente para um raio (pré-filtro barato antes do cálculo exato). */
export function bboxAround(p: LatLng, radiusM: number) {
  const dLat = (radiusM / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLng = dLat / Math.max(Math.cos(rad(p.lat)), 1e-6);
  return { minLat: p.lat - dLat, maxLat: p.lat + dLat, minLng: p.lng - dLng, maxLng: p.lng + dLng };
}

export type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

/** "minLng,minLat,maxLng,maxLat" → Bbox validada; limita a área para evitar consultas nacionais por interação. */
export function parseBbox(s: string | null | undefined, maxSpanDeg = 12): Bbox | null {
  if (!s) return null;
  const n = s.split(",").map(Number);
  if (n.length !== 4 || n.some((v) => !Number.isFinite(v))) return null;
  const [minLng, minLat, maxLng, maxLat] = n;
  if (minLng >= maxLng || minLat >= maxLat) return null;
  if (minLat < -90 || maxLat > 90 || minLng < -180 || maxLng > 180) return null;
  if (maxLng - minLng > maxSpanDeg || maxLat - minLat > maxSpanDeg) return null;
  return { minLng, minLat, maxLng, maxLat };
}

/**
 * Área de um polígono (anel externo, [lng, lat]) em m², por projeção equiretangular local.
 * Erro desprezível para terrenos urbanos (centenas de metros); não usar para áreas continentais.
 */
export function polygonAreaM2(ring: [number, number][]): number {
  if (ring.length < 3) return 0;
  const lat0 = rad(ring.reduce((s, p) => s + p[1], 0) / ring.length);
  const pts = ring.map(([lng, lat]) => [rad(lng) * EARTH_RADIUS_M * Math.cos(lat0), rad(lat) * EARTH_RADIUS_M]);
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Valida um polígono GeoJSON simples desenhado no mapa. */
export function validatePolygon(input: unknown): { ok: true; ring: [number, number][] } | { ok: false; error: string } {
  const g = input as { type?: string; coordinates?: unknown };
  if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates) || !Array.isArray(g.coordinates[0])) return { ok: false, error: "Geometria deve ser um Polygon GeoJSON." };
  const ring = g.coordinates[0] as unknown[];
  if (ring.length < 4) return { ok: false, error: "O polígono precisa de pelo menos 3 vértices." };
  if (ring.length > 500) return { ok: false, error: "Polígono com vértices demais (máx. 500)." };
  const out: [number, number][] = [];
  for (const p of ring) {
    if (!Array.isArray(p) || p.length < 2) return { ok: false, error: "Vértice inválido." };
    const c = parseCoordinates(p[1], p[0]);
    if (!c.ok) return { ok: false, error: c.error };
    out.push([c.value.lng, c.value.lat]);
  }
  const [f, l] = [out[0], out[out.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) return { ok: false, error: "O polígono deve ser fechado (primeiro vértice = último)." };
  return { ok: true, ring: out.slice(0, -1) };
}

/** Identificador de célula de grade regular (graus) para agregação de mapa de calor. */
export function gridCell(p: LatLng, sizeDeg: number) {
  const i = Math.floor(p.lng / sizeDeg);
  const j = Math.floor(p.lat / sizeDeg);
  return { id: `${sizeDeg}:${i}:${j}`, center: { lng: (i + 0.5) * sizeDeg, lat: (j + 0.5) * sizeDeg } };
}
