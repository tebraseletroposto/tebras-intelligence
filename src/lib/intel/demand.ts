import { sessionCapacity, simulateInfrastructure, type ChargerLine, type SiteElectrical } from "./infrastructure";
import type { ValueNature } from "./provenance";

/**
 * Modelo de demanda por etapas (seção 7.2) — versão "regras e cenários".
 *
 *   1. Mercado potencial regional       = frota BEV + frota PHEV × fator PHEV  (veículos)
 *   2. Usuários de recarga pública      = (1) × parcela dependente de recarga pública
 *   3. Sessões públicas regionais/dia   = (2) × sessões públicas por semana / 7
 *   4. Parcela acessível ao terreno     = (3) × parcela da região na área de influência
 *   5. Demanda captável pelo hub        = (4) × parcela captável × fator de concorrência
 *   6. Demanda atendida                 = mín((5), capacidade instalada)
 *
 * População e fluxo de veículos NUNCA entram como demanda direta. Todas as premissas são editáveis
 * e exibidas com sua natureza. Os valores iniciais são pontos de partida de modelagem, não observações.
 */

export const MODEL_VERSION = "regras-v1";

export type DemandAssumptions = {
  /** Frota de veículos elétricos a bateria na região (veículos). */
  bevFleet: number | null;
  phevFleet: number | null;
  /** Peso de um PHEV em relação a um BEV na recarga pública (0–1). */
  phevFactor: number;
  /** Parcela da frota que depende de recarga pública (0–1). */
  publicChargingShare: number;
  /** Sessões públicas por usuário por semana. */
  publicSessionsPerWeek: number;
  /** Parcela da demanda regional dentro da área de influência do terreno (0–1). */
  catchmentShare: number;
  /** Parcela captável pelo hub sem concorrência (0–1). */
  captureShare: number;
  /** Concorrentes conhecidos na área de influência. */
  competitors: number | null;
  /** Sensibilidade à concorrência: fator = 1 / (1 + k × concorrentes). */
  competitionSensitivity: number;
  /** Energia média por sessão (kWh). */
  kwhPerSession: number;
  /** Crescimento anual da frota (0,25 = 25%). */
  annualFleetGrowth: number;
  /** Relação demanda fim de semana / dia útil. */
  weekendFactor: number;
  /** Demanda agregada importada de fonte autorizada (kWh/dia na área), quando existir — substitui as etapas 1 a 4. */
  externalDailyKwh: number | null;
  /** Preço de venda (R$/kWh). */
  pricePerKwh: number;
};

export type AssumptionMeta = { label: string; unit: string; nature: ValueNature; source: string | null; note?: string };

export const SCENARIO_KEYS = ["conservador", "base", "otimista"] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];
export const SCENARIO_LABELS: Record<ScenarioKey, string> = { conservador: "Conservador", base: "Base", otimista: "Otimista" };

/** Pontos de partida de modelagem (PREMISSAS). Devem ser substituídos por dados próprios ou importados. */
export const DEFAULT_SCENARIO_ASSUMPTIONS: Record<ScenarioKey, Omit<DemandAssumptions, "bevFleet" | "phevFleet" | "competitors" | "externalDailyKwh">> = {
  conservador: { phevFactor: 0.2, publicChargingShare: 0.2, publicSessionsPerWeek: 1, catchmentShare: 0.03, captureShare: 0.1, competitionSensitivity: 0.15, kwhPerSession: 22, annualFleetGrowth: 0.1, weekendFactor: 0.8, pricePerKwh: 1.8 },
  base: { phevFactor: 0.3, publicChargingShare: 0.3, publicSessionsPerWeek: 1.5, catchmentShare: 0.05, captureShare: 0.15, competitionSensitivity: 0.1, kwhPerSession: 25, annualFleetGrowth: 0.2, weekendFactor: 0.9, pricePerKwh: 2.0 },
  otimista: { phevFactor: 0.4, publicChargingShare: 0.4, publicSessionsPerWeek: 2, catchmentShare: 0.08, captureShare: 0.2, competitionSensitivity: 0.07, kwhPerSession: 28, annualFleetGrowth: 0.3, weekendFactor: 1, pricePerKwh: 2.2 },
};

export const ASSUMPTION_LABELS: Record<keyof DemandAssumptions, { label: string; unit: string; fraction?: boolean }> = {
  bevFleet: { label: "Frota BEV na região", unit: "veículos" },
  phevFleet: { label: "Frota PHEV na região", unit: "veículos" },
  phevFactor: { label: "Peso do PHEV na recarga pública", unit: "%", fraction: true },
  publicChargingShare: { label: "Parcela dependente de recarga pública", unit: "%", fraction: true },
  publicSessionsPerWeek: { label: "Sessões públicas por usuário/semana", unit: "sessões" },
  catchmentShare: { label: "Parcela da região na área de influência", unit: "%", fraction: true },
  captureShare: { label: "Parcela captável (sem concorrência)", unit: "%", fraction: true },
  competitors: { label: "Concorrentes na área de influência", unit: "carregadores" },
  competitionSensitivity: { label: "Sensibilidade à concorrência (k)", unit: "" },
  kwhPerSession: { label: "Energia média por sessão", unit: "kWh" },
  annualFleetGrowth: { label: "Crescimento anual da frota", unit: "%", fraction: true },
  weekendFactor: { label: "Fator fim de semana / dia útil", unit: "×" },
  externalDailyKwh: { label: "Demanda agregada importada (EVIE etc.)", unit: "kWh/dia" },
  pricePerKwh: { label: "Preço de venda", unit: "R$/kWh" },
};

export function validateAssumptions(a: DemandAssumptions): string[] {
  const e: string[] = [];
  const frac: (keyof DemandAssumptions)[] = ["phevFactor", "publicChargingShare", "catchmentShare", "captureShare"];
  for (const k of frac) { const v = a[k] as number; if (!(v >= 0 && v <= 1)) e.push(`${ASSUMPTION_LABELS[k].label} deve estar entre 0% e 100%.`); }
  if (a.bevFleet !== null && a.bevFleet < 0) e.push("Frota BEV não pode ser negativa.");
  if (a.phevFleet !== null && a.phevFleet < 0) e.push("Frota PHEV não pode ser negativa.");
  if (!(a.kwhPerSession > 0 && a.kwhPerSession <= 200)) e.push("Energia por sessão deve estar entre 0 e 200 kWh (verifique a unidade: kWh, não Wh).");
  if (!(a.publicSessionsPerWeek >= 0 && a.publicSessionsPerWeek <= 21)) e.push("Sessões por semana fora do intervalo plausível (0–21).");
  if (!(a.pricePerKwh > 0 && a.pricePerKwh < 50)) e.push("Preço por kWh fora do intervalo plausível (verifique a unidade: R$/kWh).");
  if (!(a.annualFleetGrowth > -1 && a.annualFleetGrowth <= 5)) e.push("Crescimento anual da frota fora do intervalo plausível.");
  if (!(a.competitionSensitivity >= 0)) e.push("Sensibilidade à concorrência deve ser ≥ 0.");
  if (a.externalDailyKwh !== null && a.externalDailyKwh < 0) e.push("Demanda importada não pode ser negativa.");
  return e;
}

export type DemandStep = { key: string; label: string; value: number | null; unit: string; formula: string };

export type DemandForecast = {
  modelVersion: string;
  steps: DemandStep[];
  demandSessionsPerDay: number | null;
  capacitySessionsPerDay: number;
  servedSessionsPerDay: number | null;
  capacityLimited: boolean;
  energyPerDayKwh: number | null;
  energyPerMonthKwh: number | null;
  energyPerYearKwh: number | null;
  weekdaySessions: number | null;
  weekendSessions: number | null;
  utilization: number | null;
  grossRevenueMonth: number | null;
  revenuePerChargerMonth: number | null;
  path: "funil" | "externo" | "sem_dados";
  warnings: string[];
};

/** Demanda captável (etapa 5) para o ano `year` (0 = ano corrente). */
function capturableSessions(a: DemandAssumptions, year = 0): { steps: DemandStep[]; sessions: number | null; path: DemandForecast["path"] } {
  const comp = a.competitors ?? 0;
  const compFactor = 1 / (1 + a.competitionSensitivity * comp);
  const growth = Math.pow(1 + a.annualFleetGrowth, year);
  if (a.externalDailyKwh !== null) {
    const kwh = a.externalDailyKwh * growth;
    const regionalSessions = kwh / a.kwhPerSession;
    const s = regionalSessions * a.captureShare * compFactor;
    return {
      path: "externo",
      sessions: s,
      steps: [
        { key: "externo", label: "Demanda agregada importada na área", value: kwh, unit: "kWh/dia", formula: "Fonte autorizada × crescimento" },
        { key: "sessoes_area", label: "Sessões equivalentes na área", value: regionalSessions, unit: "sessões/dia", formula: "kWh/dia ÷ kWh por sessão" },
        { key: "captavel", label: "Demanda captável pelo hub", value: s, unit: "sessões/dia", formula: `× parcela captável × 1/(1 + ${a.competitionSensitivity} × ${comp} concorrentes)` },
      ],
    };
  }
  if (a.bevFleet === null && a.phevFleet === null) {
    return { path: "sem_dados", sessions: null, steps: [{ key: "mercado", label: "Mercado potencial regional", value: null, unit: "veículos", formula: "Frota BEV/PHEV sem dados — importe estatísticas de frota ou informe a premissa" }] };
  }
  const fleet = ((a.bevFleet ?? 0) + (a.phevFleet ?? 0) * a.phevFactor) * growth;
  const users = fleet * a.publicChargingShare;
  const regional = (users * a.publicSessionsPerWeek) / 7;
  const accessible = regional * a.catchmentShare;
  const captured = accessible * a.captureShare * compFactor;
  return {
    path: "funil",
    sessions: captured,
    steps: [
      { key: "mercado", label: "1. Mercado potencial regional", value: fleet, unit: "veículos", formula: `(BEV + PHEV × ${a.phevFactor}) × (1 + ${a.annualFleetGrowth})^${year}` },
      { key: "usuarios", label: "2. Usuários de recarga pública", value: users, unit: "veículos", formula: `× ${a.publicChargingShare} dependentes de recarga pública` },
      { key: "regional", label: "3. Sessões públicas na região", value: regional, unit: "sessões/dia", formula: `× ${a.publicSessionsPerWeek} sessões/semana ÷ 7` },
      { key: "acessivel", label: "4. Parcela acessível ao terreno", value: accessible, unit: "sessões/dia", formula: `× ${a.catchmentShare} na área de influência` },
      { key: "captavel", label: "5. Demanda captável pelo hub", value: captured, unit: "sessões/dia", formula: `× ${a.captureShare} captável × 1/(1 + ${a.competitionSensitivity} × ${comp} concorrentes)` },
    ],
  };
}

export function forecastDemand(a: DemandAssumptions, chargers: ChargerLine[], site: SiteElectrical, opts: { year?: number; turnoverMin?: number } = {}): DemandForecast {
  const warnings = validateAssumptions(a);
  const { steps, sessions, path } = capturableSessions(a, opts.year ?? 0);
  const cap = sessionCapacity(chargers, site, a.kwhPerSession, { turnoverMin: opts.turnoverMin });
  const infra = simulateInfrastructure(chargers, site);
  if (a.competitors === null) warnings.push("Concorrência sem dados: fator de concorrência calculado com zero concorrentes CONHECIDOS.");
  if (path === "sem_dados") {
    return { modelVersion: MODEL_VERSION, steps, demandSessionsPerDay: null, capacitySessionsPerDay: cap.sessionsPerDay, servedSessionsPerDay: null, capacityLimited: false, energyPerDayKwh: null, energyPerMonthKwh: null, energyPerYearKwh: null, weekdaySessions: null, weekendSessions: null, utilization: null, grossRevenueMonth: null, revenuePerChargerMonth: null, path, warnings: [...warnings, "Sem frota nem demanda importada: a demanda não pode ser estimada."] };
  }
  const demand = sessions as number;
  const served = Math.min(demand, cap.sessionsPerDay);
  const limited = demand > cap.sessionsPerDay;
  steps.push({ key: "atendida", label: "6. Demanda atendida (limitada pela capacidade)", value: served, unit: "sessões/dia", formula: `mín(demanda, capacidade de ${cap.sessionsPerDay} sessões/dia)` });
  const energyDay = served * a.kwhPerSession;
  // Média diária = (5 dias úteis + 2 × fator fim de semana) / 7 → recompõe dia útil e fim de semana
  const wd = served / ((5 + 2 * a.weekendFactor) / 7);
  const energyMonth = energyDay * 30.4;
  const revenue = energyMonth * a.pricePerKwh;
  return {
    modelVersion: MODEL_VERSION, steps,
    demandSessionsPerDay: demand, capacitySessionsPerDay: cap.sessionsPerDay, servedSessionsPerDay: served, capacityLimited: limited,
    energyPerDayKwh: energyDay, energyPerMonthKwh: energyMonth, energyPerYearKwh: energyDay * 365,
    weekdaySessions: wd, weekendSessions: wd * a.weekendFactor,
    utilization: infra.maxDailyEnergyKwh > 0 ? energyDay / infra.maxDailyEnergyKwh : null,
    grossRevenueMonth: revenue,
    revenuePerChargerMonth: infra.chargerCount > 0 ? revenue / infra.chargerCount : null,
    path, warnings,
  };
}

/** Sensibilidade: variação da energia mensal atendida ao alterar cada premissa em ±pct. */
export function sensitivity(a: DemandAssumptions, chargers: ChargerLine[], site: SiteElectrical, pct = 0.2) {
  const base = forecastDemand(a, chargers, site).energyPerMonthKwh;
  if (base === null) return [];
  const keys: (keyof DemandAssumptions)[] = ["publicChargingShare", "publicSessionsPerWeek", "catchmentShare", "captureShare", "kwhPerSession", "competitionSensitivity", "phevFactor"];
  return keys.map((k) => {
    const v = a[k] as number;
    const clampFrac = (x: number) => (ASSUMPTION_LABELS[k].fraction ? Math.min(1, x) : x);
    const lo = forecastDemand({ ...a, [k]: clampFrac(v * (1 - pct)) }, chargers, site).energyPerMonthKwh ?? 0;
    const hi = forecastDemand({ ...a, [k]: clampFrac(v * (1 + pct)) }, chargers, site).energyPerMonthKwh ?? 0;
    return { key: k, label: ASSUMPTION_LABELS[k].label, low: lo - base, high: hi - base, swing: Math.abs(hi - lo) };
  }).sort((x, y) => y.swing - x.swing);
}

/* ------------------------------------------------------------------ */
/* Calibração estatística (etapa posterior): avaliação honesta de erro */
/* ------------------------------------------------------------------ */

export type Observation = { date: string; sessions: number; energyKwh: number };

/** MAE e WAPE. WAPE = Σ|erro| / Σ|real| (indefinido quando Σ|real| = 0). */
export function errorMetrics(actual: number[], predicted: number[]) {
  if (actual.length !== predicted.length || actual.length === 0) throw new Error("Séries de tamanhos diferentes ou vazias.");
  const absErr = actual.map((y, i) => Math.abs(y - predicted[i]));
  const sumAbs = absErr.reduce((a, b) => a + b, 0);
  const sumAct = actual.reduce((a, b) => a + Math.abs(b), 0);
  return { n: actual.length, mae: sumAbs / actual.length, wape: sumAct > 0 ? sumAbs / sumAct : null };
}

/**
 * Validação temporal: treina com as observações mais antigas e testa nas mais recentes (sem embaralhar).
 * Compara (a) linha de base ingênua = média do treino; (b) média móvel por dia da semana.
 * Só roda com pelo menos `minObservations` dias.
 */
export function temporalValidation(obs: Observation[], opts: { testFraction?: number; minObservations?: number } = {}) {
  const min = opts.minObservations ?? 28;
  const sorted = [...obs].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < min) return { ok: false as const, reason: `São necessárias pelo menos ${min} observações diárias (há ${sorted.length}).` };
  const nTest = Math.max(7, Math.floor(sorted.length * (opts.testFraction ?? 0.25)));
  const train = sorted.slice(0, sorted.length - nTest);
  const test = sorted.slice(sorted.length - nTest);
  const mean = train.reduce((s, o) => s + o.energyKwh, 0) / train.length;
  const dow = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
  const byDow = new Map<number, number[]>();
  for (const o of train) byDow.set(dow(o.date), [...(byDow.get(dow(o.date)) ?? []), o.energyKwh]);
  const dowMean = (d: number) => { const xs = byDow.get(d); return xs?.length ? xs.reduce((a, b) => a + b, 0) / xs.length : mean; };
  const actual = test.map((o) => o.energyKwh);
  const baseline = errorMetrics(actual, test.map(() => mean));
  const weekday = errorMetrics(actual, test.map((o) => dowMean(dow(o.date))));
  return {
    ok: true as const,
    trainPeriod: [train[0].date, train[train.length - 1].date] as const,
    testPeriod: [test[0].date, test[test.length - 1].date] as const,
    metric: "energia diária (kWh)",
    models: [
      { name: "Linha de base: média do treino", ...baseline },
      { name: "Média por dia da semana", ...weekday },
    ],
    better: (weekday.wape ?? Infinity) < (baseline.wape ?? Infinity) ? "Média por dia da semana" : "Linha de base: média do treino",
  };
}
