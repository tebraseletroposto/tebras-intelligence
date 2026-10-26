import { z } from "zod";
import { DEFAULT_SCENARIO_ASSUMPTIONS, SCENARIO_KEYS } from "./demand";
import { DEFAULT_CAPEX, DEFAULT_FIXED_COSTS } from "./finance";
import { DEFAULT_SITE } from "./infrastructure";

/** Esquemas das entradas de um estudo (JSONB em intel_studies). Mesmo esquema no cliente e no servidor. */

const num = (min: number, max: number) => z.coerce.number({ error: "Número inválido." }).min(min).max(max);
const nullableNum = (min: number, max: number) => z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number({ error: "Número inválido." }).min(min).max(max).nullable());

export const chargerLineSchema = z.object({
  label: z.string().trim().min(1).max(80),
  powerKw: num(0.1, 1000),
  current: z.enum(["AC", "DC"]),
  quantity: z.coerce.number().int().min(0).max(200),
  unitCost: nullableNum(0, 10_000_000),
  installCost: nullableNum(0, 10_000_000),
  efficiency: nullableNum(0.01, 1),
});
export const chargersSchema = z.array(chargerLineSchema).max(20);

export const siteSchema = z.object({
  availableKw: nullableNum(0, 100_000),
  simultaneityFactor: num(0, 1),
  dynamicLoadManagement: z.boolean(),
  operatingHours: num(0, 24),
  availability: num(0, 1),
  auxiliaryKw: nullableNum(0, 1000),
});

export const electricalSchema = z.object({
  supplyVoltageV: nullableNum(100, 50_000),
  phases: z.preprocess((v) => (v === "" || v === undefined || v === null ? null : Number(v)), z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable()),
  existingLoadKw: nullableNum(0, 100_000),
  contractedDemandKw: nullableNum(0, 100_000),
  distanceToSupplyM: nullableNum(0, 10_000),
  cableDistanceM: nullableNum(0, 10_000),
  hasTransformer: z.boolean().nullable(),
  existingInfrastructure: z.string().max(1000).nullable(),
  solar: z.boolean().nullable(),
  battery: z.boolean().nullable(),
  utilityStatement: z.enum(["nenhuma", "favoravel", "com_restricoes", "desfavoravel"]).nullable(),
  engineerOpinion: z.enum(["nenhum", "favoravel", "com_ressalvas", "desfavoravel"]).nullable(),
  lvReferenceKw: num(1, 10_000),
});

const scenarioAssumptions = z.object({
  phevFactor: num(0, 1), publicChargingShare: num(0, 1), publicSessionsPerWeek: num(0, 21), catchmentShare: num(0, 1), captureShare: num(0, 1),
  competitionSensitivity: num(0, 10), kwhPerSession: num(0.1, 200), annualFleetGrowth: num(-0.99, 5), weekendFactor: num(0, 3), pricePerKwh: num(0.01, 49.99),
});
export const demandSchema = z.object({
  /** Sobrescritas manuais (premissa) quando não houver dado importado. null = usar dado importado. */
  bevFleetOverride: nullableNum(0, 50_000_000),
  phevFleetOverride: nullableNum(0, 50_000_000),
  competitorsOverride: nullableNum(0, 10_000),
  externalDailyKwhOverride: nullableNum(0, 10_000_000),
  /** Raio da área de influência para contar concorrentes (km). */
  catchmentRadiusKm: num(0.5, 30),
  turnoverMin: num(0, 120),
  scenarios: z.object({ conservador: scenarioAssumptions, base: scenarioAssumptions, otimista: scenarioAssumptions }),
});

export const financeSchema = z.object({
  horizonMonths: z.coerce.number().int().min(12).max(240),
  energyCostPerKwh: num(0, 20),
  demandChargeMonthly: num(0, 10_000_000),
  chargerEfficiency: num(0.01, 1),
  averageDiscount: num(0, 0.99),
  revenueTaxRate: num(0, 0.99), paymentFeeRate: num(0, 0.99), platformFeeRate: num(0, 0.99), partnerCommissionRate: num(0, 0.99),
  fixedCosts: z.array(z.object({ label: z.string().trim().min(1).max(80), monthly: nullableNum(0, 100_000_000) })).max(40),
  capex: z.array(z.object({ label: z.string().trim().min(1).max(80), amount: nullableNum(0, 1_000_000_000) })).max(40),
  useChargerCapex: z.boolean(),
  contingencyRate: num(0, 0.99),
  workingCapital: num(0, 1_000_000_000),
  includeStatuses: z.array(z.enum(["hipotese", "negociando", "contratado", "realizado"])),
  inflationYear: num(-0.5, 2),
  discountRateYear: nullableNum(0, 2),
  incomeTaxRate: num(0, 0.99),
  depreciationYears: num(1, 50),
  financing: z.object({ principal: num(0, 1_000_000_000), annualRate: num(0, 5), months: z.coerce.number().int().min(1).max(360), graceMonths: z.coerce.number().int().min(0).max(60) }).nullable(),
});

export type StudyChargers = z.infer<typeof chargersSchema>;
export type StudySite = z.infer<typeof siteSchema>;
export type StudyElectrical = z.infer<typeof electricalSchema>;
export type StudyDemand = z.infer<typeof demandSchema>;
export type StudyFinance = z.infer<typeof financeSchema>;

export const DEFAULT_CHARGERS: StudyChargers = [
  { label: "60 kW DC", powerKw: 60, current: "DC", quantity: 1, unitCost: null, installCost: null, efficiency: null },
  { label: "7 kW AC", powerKw: 7, current: "AC", quantity: 2, unitCost: null, installCost: null, efficiency: null },
];
export const DEFAULT_STUDY_SITE: StudySite = { ...DEFAULT_SITE };
export const DEFAULT_ELECTRICAL: StudyElectrical = { supplyVoltageV: null, phases: null, existingLoadKw: null, contractedDemandKw: null, distanceToSupplyM: null, cableDistanceM: null, hasTransformer: null, existingInfrastructure: null, solar: null, battery: null, utilityStatement: null, engineerOpinion: null, lvReferenceKw: 75 };
export const DEFAULT_DEMAND: StudyDemand = {
  bevFleetOverride: null, phevFleetOverride: null, competitorsOverride: null, externalDailyKwhOverride: null, catchmentRadiusKm: 3, turnoverMin: 10,
  scenarios: Object.fromEntries(SCENARIO_KEYS.map((k) => [k, { ...DEFAULT_SCENARIO_ASSUMPTIONS[k] }])) as StudyDemand["scenarios"],
};
/** Valores financeiros iniciais: tarifas/custos ZERADOS não existem — campos monetários sem cotação ficam null ou exigem preenchimento. */
export const DEFAULT_FINANCE: StudyFinance = {
  horizonMonths: 120, energyCostPerKwh: 0, demandChargeMonthly: 0, chargerEfficiency: 0.93, averageDiscount: 0,
  revenueTaxRate: 0, paymentFeeRate: 0, platformFeeRate: 0, partnerCommissionRate: 0,
  fixedCosts: DEFAULT_FIXED_COSTS, capex: DEFAULT_CAPEX.filter((c) => !c.label.startsWith("Equipamentos") && c.label !== "Instalação"), useChargerCapex: true,
  contingencyRate: 0.1, workingCapital: 0, includeStatuses: ["contratado", "realizado"], inflationYear: 0, discountRateYear: null, incomeTaxRate: 0, depreciationYears: 10, financing: null,
};

/** Campos financeiros obrigatórios para considerar a projeção "completa" (tarifa de energia e tributos são premissas críticas). */
export function financeCompleteness(f: StudyFinance): string[] {
  const missing: string[] = [];
  if (f.energyCostPerKwh === 0) missing.push("Tarifa de compra de energia (R$/kWh) não informada — sem tarifa nacional única.");
  if (f.revenueTaxRate === 0) missing.push("Tributos sobre a receita informados como 0% — confirme com o contador.");
  return missing;
}
