/**
 * Índice de Potencial Tebras (0–100). Seção 4.7.
 *
 * - Pesos e escalas são HIPÓTESES DE MODELAGEM, configuráveis pelo administrador (versão do modelo).
 * - Cada dimensão só entra na nota se tiver dados; dimensões sem dados reduzem a COBERTURA e a CONFIANÇA,
 *   nunca são preenchidas com zero.
 * - A nota é a média ponderada das dimensões disponíveis; a confiança é exibida separadamente.
 */

export type IndexInputs = {
  /** Veículos elétricos a bateria registrados no município (SENATRAN/DETRAN importado). */
  bevFleet: number | null;
  /** Híbridos plug-in registrados no município. */
  phevFleet: number | null;
  /** Habitantes por km² (IBGE, resolução municipal ou setor censitário). */
  populationDensity: number | null;
  /** Distância até a via principal mais próxima, em metros (informada ou calculada). */
  mainRoadDistanceM: number | null;
  /** Pontos de interesse relevantes (shoppings, terminais, aeroportos, polos) em 1 km. */
  destinationsWithin1km: number | null;
  /** Carregadores conhecidos em 3 km (null = base de carregadores não carregada para a área). */
  competitorsWithin3km: number | null;
  /** Indicador de demanda importado de fonte agregada autorizada (ex.: EVIE), normalizado 0–1. */
  externalDemandScore: number | null;
  /** Compatibilidade operacional do terreno. */
  areaM2: number | null;
  streetAccess: boolean | null;
  parking: boolean | null;
  lowVoltage: "potencialmente_compativel" | "necessita_informacoes" | "provavel_adequacao" | "risco_elevado" | "nao_avaliavel" | null;
  /** Qualidade média das fontes usadas (0–1). */
  dataQuality: number | null;
};

export const DIMENSIONS = {
  mercado: { label: "Potencial de mercado", description: "Frota elétrica/PHEV e densidade residencial da área" },
  acessibilidade: { label: "Acessibilidade", description: "Proximidade de vias principais" },
  destinos: { label: "Perfil de destinos", description: "Polos de atração em 1 km" },
  concorrencia: { label: "Oferta concorrente", description: "Menos carregadores conhecidos = maior nota (com ressalvas)" },
  operacional: { label: "Compatibilidade operacional", description: "Área, acesso, estacionamento e baixa tensão" },
  qualidade: { label: "Qualidade dos dados", description: "Confiabilidade média das fontes utilizadas" },
} as const;
export type DimensionKey = keyof typeof DIMENSIONS;

export type IndexConfig = {
  weights: Record<DimensionKey, number>;
  /** Valores de referência para normalização linear (valor ≥ ref → 1). */
  scales: {
    bevFleetRef: number;
    phevWeight: number;
    densityRef: number;
    roadDistanceZeroM: number;
    destinationsRef: number;
    competitorsSaturation: number;
    areaRefM2: number;
  };
};

/** Configuração inicial — HIPÓTESE, não calibrada. Ajustável em Configurações. */
export const DEFAULT_INDEX_CONFIG: IndexConfig = {
  weights: { mercado: 30, acessibilidade: 20, destinos: 15, concorrencia: 15, operacional: 15, qualidade: 5 },
  scales: { bevFleetRef: 5000, phevWeight: 0.5, densityRef: 10000, roadDistanceZeroM: 2000, destinationsRef: 10, competitorsSaturation: 15, areaRefM2: 600 },
};

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? { value: v.reduce((a, b) => a + b, 0) / v.length, used: v.length, total: xs.length } : null;
};

type DimResult = { key: DimensionKey; score: number | null; partial: number; note: string };

export function dimensionScores(i: IndexInputs, cfg: IndexConfig = DEFAULT_INDEX_CONFIG): DimResult[] {
  const s = cfg.scales;
  const fleet = i.bevFleet === null && i.phevFleet === null ? null : clamp01(((i.bevFleet ?? 0) + (i.phevFleet ?? 0) * s.phevWeight) / s.bevFleetRef);
  const dens = i.populationDensity === null ? null : clamp01(i.populationDensity / s.densityRef);
  const ext = i.externalDemandScore === null ? null : clamp01(i.externalDemandScore);
  const market = avg([fleet, dens, ext]);

  const access = i.mainRoadDistanceM === null ? null : clamp01(1 - i.mainRoadDistanceM / s.roadDistanceZeroM);
  const dest = i.destinationsWithin1km === null ? null : clamp01(i.destinationsWithin1km / s.destinationsRef);
  const comp = i.competitorsWithin3km === null ? null : clamp01(1 - i.competitorsWithin3km / s.competitorsSaturation);

  const lv = { potencialmente_compativel: 1, necessita_informacoes: 0.5, provavel_adequacao: 0.35, risco_elevado: 0.1, nao_avaliavel: null } as const;
  const op = avg([
    i.areaM2 === null ? null : clamp01(i.areaM2 / s.areaRefM2),
    i.streetAccess === null ? null : i.streetAccess ? 1 : 0,
    i.parking === null ? null : i.parking ? 1 : 0,
    i.lowVoltage === null ? null : lv[i.lowVoltage],
  ]);

  return [
    { key: "mercado", score: market?.value ?? null, partial: market ? market.used / market.total : 0, note: market ? `${market.used} de ${market.total} componentes com dados` : "Sem frota, densidade ou indicador externo" },
    { key: "acessibilidade", score: access, partial: access === null ? 0 : 1, note: i.mainRoadDistanceM === null ? "Distância até via principal não informada" : `${Math.round(i.mainRoadDistanceM)} m até via principal` },
    { key: "destinos", score: dest, partial: dest === null ? 0 : 1, note: i.destinationsWithin1km === null ? "Pontos de interesse não levantados" : `${i.destinationsWithin1km} destino(s) em 1 km` },
    { key: "concorrencia", score: comp, partial: comp === null ? 0 : 1, note: i.competitorsWithin3km === null ? "Base de carregadores sem cobertura" : `${i.competitorsWithin3km} carregador(es) conhecido(s) em 3 km` },
    { key: "operacional", score: op?.value ?? null, partial: op ? op.used / op.total : 0, note: op ? `${op.used} de ${op.total} itens informados` : "Características do terreno não informadas" },
    { key: "qualidade", score: i.dataQuality, partial: i.dataQuality === null ? 0 : 1, note: i.dataQuality === null ? "Sem fontes associadas" : "Média das fontes utilizadas" },
  ];
}

export type PotentialIndex = {
  score: number | null;
  coverage: number;
  confidence: "alta" | "media" | "baixa" | "insuficiente";
  dimensions: (DimResult & { weight: number; label: string })[];
  positives: string[];
  risks: string[];
  missing: string[];
  justification: string;
};

export function computePotentialIndex(i: IndexInputs, cfg: IndexConfig = DEFAULT_INDEX_CONFIG): PotentialIndex {
  const dims = dimensionScores(i, cfg).map((d) => ({ ...d, weight: Math.max(0, cfg.weights[d.key] ?? 0), label: DIMENSIONS[d.key].label }));
  const totalW = dims.reduce((s, d) => s + d.weight, 0) || 1;
  const avail = dims.filter((d) => d.score !== null && d.weight > 0);
  const availW = avail.reduce((s, d) => s + d.weight, 0);
  // Cobertura considera dados parciais dentro de cada dimensão
  const coverage = dims.reduce((s, d) => s + d.weight * d.partial, 0) / totalW;
  const score = availW > 0 ? Math.round((avail.reduce((s, d) => s + d.weight * (d.score as number), 0) / availW) * 100) : null;
  const q = i.dataQuality ?? 0.25;
  const conf = coverage * (0.5 + 0.5 * q);
  const confidence = score === null || coverage < 0.3 ? "insuficiente" : conf >= 0.7 ? "alta" : conf >= 0.45 ? "media" : "baixa";

  const positives = avail.filter((d) => (d.score as number) >= 0.7).map((d) => `${d.label}: ${d.note}`);
  const risks = avail.filter((d) => (d.score as number) < 0.35).map((d) => `${d.label}: ${d.note}`);
  if (i.competitorsWithin3km === 0) risks.push("Nenhum concorrente conhecido em 3 km: verificar se a base cobre a região antes de concluir que há lacuna de oferta.");
  if (i.lowVoltage === "risco_elevado") risks.push("Risco técnico elétrico elevado.");
  const missing = dims.filter((d) => d.partial < 1).map((d) => `${d.label}: ${d.note}`);

  const justification =
    score === null
      ? "Dados insuficientes para calcular a nota. Cadastre características do terreno e importe fontes para a região."
      : `Nota ${score}/100 calculada com ${avail.length} de ${dims.length} dimensões (cobertura ${Math.round(coverage * 100)}%). ` +
        `Pesos são hipóteses de modelagem configuráveis, não coeficientes calibrados.`;

  return { score, coverage, confidence, dimensions: dims, positives, risks, missing, justification };
}

export function validateIndexConfig(cfg: IndexConfig): string[] {
  const errs: string[] = [];
  const total = Object.values(cfg.weights).reduce((a, b) => a + b, 0);
  if (Object.values(cfg.weights).some((w) => !Number.isFinite(w) || w < 0)) errs.push("Pesos devem ser números não negativos.");
  if (total <= 0) errs.push("A soma dos pesos deve ser positiva.");
  for (const [k, v] of Object.entries(cfg.scales)) if (!Number.isFinite(v) || v <= 0) errs.push(`Escala ${k} deve ser positiva.`);
  return errs;
}
