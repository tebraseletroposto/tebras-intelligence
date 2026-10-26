/**
 * Proveniência e natureza de cada número exibido pelo Tebras Intelligence.
 * Regra: todo valor carrega sua natureza. "sem_dados" é diferente de zero e nunca é convertido em zero.
 */

export const VALUE_NATURE = {
  observado: { label: "Observado", tone: "success", description: "Medido ou publicado por fonte identificada" },
  estimado: { label: "Estimado", tone: "info", description: "Calculado a partir de dados observados por método documentado" },
  premissa: { label: "Premissa", tone: "warning", description: "Valor assumido pelo usuário ou pelo modelo, editável" },
  simulacao: { label: "Simulação", tone: "brand", description: "Resultado de cenário hipotético" },
  sem_dados: { label: "Sem dados", tone: "neutral", description: "Nenhuma fonte disponível — não foi substituído por zero" },
} as const;
export type ValueNature = keyof typeof VALUE_NATURE;

export const DATA_QUALITY = {
  alta: { label: "Alta", score: 1 },
  media: { label: "Média", score: 0.7 },
  baixa: { label: "Baixa", score: 0.4 },
  desconhecida: { label: "Desconhecida", score: 0.25 },
} as const;
export type DataQuality = keyof typeof DATA_QUALITY;

/** Indicador geográfico com metadados obrigatórios (seção 4.5). */
export type Indicator = {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  nature: ValueNature;
  source: string | null;
  referenceDate: string | null;
  resolution: string | null; // ex.: "município", "ponto", "célula 1 km"
  coverage: string | null;
  quality: DataQuality;
  limitations: string | null;
};

export const noData = (key: string, label: string, unit: string, limitations = "Nenhuma fonte carregada para esta área."): Indicator => ({
  key, label, value: null, unit, nature: "sem_dados", source: null, referenceDate: null, resolution: null, coverage: null, quality: "desconhecida", limitations,
});

/** Idade de um dado em dias; usado para marcar fontes desatualizadas. */
export function ageInDays(referenceDate: string | Date | null, now: Date = new Date()): number | null {
  if (!referenceDate) return null;
  const d = typeof referenceDate === "string" ? new Date(referenceDate) : referenceDate;
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / 86_400_000);
}

/** Classificação de atualidade: fontes antigas reduzem a confiança, mas não são descartadas. */
export function freshness(referenceDate: string | Date | null, maxAgeDays: number, now: Date = new Date()): "atual" | "desatualizado" | "sem_data" {
  const age = ageInDays(referenceDate, now);
  if (age === null) return "sem_data";
  return age > maxAgeDays ? "desatualizado" : "atual";
}
