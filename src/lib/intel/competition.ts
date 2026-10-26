import { freshness } from "./provenance";
import { haversineMeters, type LatLng } from "./geo";

/** Situação de verificação dos carregadores conhecidos (seção 4.3). */
export const STATION_STATUS = {
  confirmado: { label: "Confirmado e atualizado", tone: "success" },
  nao_verificado: { label: "Fonte pública, não verificado", tone: "warning" },
  historico: { label: "Histórico (operação atual desconhecida)", tone: "neutral" },
  insuficiente: { label: "Informação insuficiente", tone: "neutral" },
} as const;
export type StationStatus = keyof typeof STATION_STATUS;

export type KnownStation = LatLng & {
  id: string;
  name: string | null;
  operator: string | null;
  maxPowerKw: number | null;
  connectors: number | null;
  currentType: "AC" | "DC" | "AC_DC" | null;
  pricePerKwh: number | null;
  status: StationStatus;
  verifiedAt: string | null;
};

export const DEFAULT_RADII_KM = [1, 3, 5, 10, 20] as const;

export const POWER_BANDS = [
  { key: "ac_ate_22", label: "AC até 22 kW", test: (s: KnownStation) => s.maxPowerKw !== null && s.maxPowerKw <= 22 },
  { key: "dc_23_59", label: "23–59 kW", test: (s: KnownStation) => s.maxPowerKw !== null && s.maxPowerKw > 22 && s.maxPowerKw < 60 },
  { key: "dc_60_119", label: "60–119 kW", test: (s: KnownStation) => s.maxPowerKw !== null && s.maxPowerKw >= 60 && s.maxPowerKw < 120 },
  { key: "dc_120_mais", label: "120 kW ou mais", test: (s: KnownStation) => s.maxPowerKw !== null && s.maxPowerKw >= 120 },
  { key: "desconhecida", label: "Potência desconhecida", test: (s: KnownStation) => s.maxPowerKw === null },
] as const;

export type RadiusSummary = {
  radiusKm: number;
  count: number;
  confirmed: number;
  unverified: number;
  /** Soma das potências conhecidas; `null` se nenhuma potência é conhecida. */
  knownPowerKw: number | null;
  unknownPowerCount: number;
  byBand: Record<string, number>;
  operators: { name: string; count: number }[];
  pricesPerKwh: { min: number; max: number; median: number; n: number } | null;
  densityPerKm2: number;
};

export type CompetitionAnalysis = {
  site: LatLng;
  radii: RadiusSummary[];
  nearest: (KnownStation & { distanceM: number })[];
  dataGaps: string[];
  interpretation: string[];
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Análise de concorrência por raio em linha reta. Distância por rede viária exige grafo viário
 * importado (não incluído no núcleo) e é indicada como lacuna.
 */
export function analyzeCompetition(site: LatLng, stations: KnownStation[], opts: { radiiKm?: readonly number[]; now?: Date; staleAfterDays?: number } = {}): CompetitionAnalysis {
  const radii = opts.radiiKm ?? DEFAULT_RADII_KM;
  const withDist = stations.map((s) => ({ ...s, distanceM: haversineMeters(site, s) })).sort((a, b) => a.distanceM - b.distanceM);
  const summaries: RadiusSummary[] = radii.map((r) => {
    const inR = withDist.filter((s) => s.distanceM <= r * 1000);
    const powers = inR.map((s) => s.maxPowerKw).filter((p): p is number => p !== null);
    const prices = inR.map((s) => s.pricePerKwh).filter((p): p is number => p !== null && p > 0);
    const ops = new Map<string, number>();
    for (const s of inR) {
      const k = s.operator?.trim() || "Operador não informado";
      ops.set(k, (ops.get(k) ?? 0) + 1);
    }
    return {
      radiusKm: r,
      count: inR.length,
      confirmed: inR.filter((s) => s.status === "confirmado").length,
      unverified: inR.filter((s) => s.status !== "confirmado").length,
      knownPowerKw: powers.length ? powers.reduce((a, b) => a + b, 0) : null,
      unknownPowerCount: inR.length - powers.length,
      byBand: Object.fromEntries(POWER_BANDS.map((b) => [b.key, inR.filter(b.test).length])),
      operators: [...ops.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      pricesPerKwh: prices.length ? { min: Math.min(...prices), max: Math.max(...prices), median: median(prices), n: prices.length } : null,
      densityPerKm2: inR.length / (Math.PI * r * r),
    };
  });

  const gaps: string[] = ["Distâncias calculadas em linha reta; distância pela rede viária não disponível sem grafo viário importado."];
  const maxR = summaries[summaries.length - 1];
  if (stations.length === 0) gaps.push("Nenhum carregador conhecido na base para esta área — pode ser falta de cobertura da base, não ausência real de concorrentes.");
  if (maxR && maxR.unknownPowerCount > 0) gaps.push(`${maxR.unknownPowerCount} carregador(es) em ${maxR.radiusKm} km sem potência informada.`);
  if (maxR && maxR.count > 0 && !maxR.pricesPerKwh) gaps.push("Nenhum preço de concorrente conhecido na área.");
  const stale = withDist.filter((s) => s.distanceM <= (maxR?.radiusKm ?? 20) * 1000 && freshness(s.verifiedAt, opts.staleAfterDays ?? 180, opts.now) !== "atual").length;
  if (stale) gaps.push(`${stale} registro(s) sem verificação nos últimos ${opts.staleAfterDays ?? 180} dias.`);

  const interp: string[] = [];
  const r3 = summaries.find((s) => s.radiusKm === 3);
  if (r3 && r3.count === 0)
    interp.push("Baixa cobertura de infraestrutura CONHECIDA em 3 km. Isso não comprova demanda reprimida: confirme a base de carregadores e os indicadores de demanda.");
  if (r3 && r3.byBand.dc_60_119 + r3.byBand.dc_120_mais > 0) interp.push("Há recarga rápida (≥ 60 kW) conhecida em 3 km: concorrência direta para sessões rápidas.");

  return { site, radii: summaries, nearest: withDist.slice(0, 10), dataGaps: gaps, interpretation: interp };
}
