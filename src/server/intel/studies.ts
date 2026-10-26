import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/client";
import { intelDemandForecasts, intelHubObservations, intelOrganizations, intelProperties, intelStudies, intelStudyRevenues, intelStudyShares } from "@/db/schema";
import { MODEL_VERSION, SCENARIO_KEYS, forecastDemand, sensitivity, temporalValidation, type DemandAssumptions, type ScenarioKey } from "@/lib/intel/demand";
import { projectFinance, type FinanceInputs, type RevenueStatus } from "@/lib/intel/finance";
import { simulateInfrastructure, validateChargers, type ChargerLine } from "@/lib/intel/infrastructure";
import { assessLowVoltage } from "@/lib/intel/low-voltage";
import {
  DEFAULT_CHARGERS, DEFAULT_DEMAND, DEFAULT_ELECTRICAL, DEFAULT_FINANCE, DEFAULT_STUDY_SITE, chargersSchema, demandSchema, electricalSchema, financeCompleteness, financeSchema, siteSchema,
  type StudyChargers, type StudyDemand, type StudyElectrical, type StudyFinance, type StudySite,
} from "@/lib/intel/study-schema";
import { requiredText } from "@/lib/validation/common";
import type { AuthContext } from "../authz";
import { notFound, validation } from "../errors";
import { formDataSafe } from "../validate";
import { analyzeSite } from "./analysis";
import { assertCanEditOrg, assertOrgVisible, loadScope, orgFilter, withIntel, type IntelScope } from "./scope";

const uuidOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

export async function createStudy(ctx: AuthContext, propertyId: string, input: unknown) {
  const scope = await loadScope(ctx);
  const d = formDataSafe(z.object({ name: requiredText("Nome do estudo", 2, 150) }), input);
  return withIntel(ctx, scope, async (tx) => {
    const [p] = await tx.select({ org: intelProperties.organizationId, isDemo: intelProperties.isDemo, businessModel: intelProperties.businessModel, rent: intelProperties.monthlyRent }).from(intelProperties).where(eq(intelProperties.id, propertyId));
    if (!p) throw notFound("Imóvel não encontrado.");
    assertCanEditOrg(ctx, scope, p.org);
    // O aluguel cadastrado no imóvel entra como custo fixo (dado informado, não estimado)
    const finance: StudyFinance = { ...DEFAULT_FINANCE, fixedCosts: DEFAULT_FINANCE.fixedCosts.map((c) => (c.label === "Aluguel" ? { ...c, monthly: p.rent === null ? null : Number(p.rent) } : c)) };
    const [s] = await tx.insert(intelStudies).values({ organizationId: p.org, propertyId, name: d.name, businessModel: p.businessModel, chargers: DEFAULT_CHARGERS, site: DEFAULT_STUDY_SITE, electrical: DEFAULT_ELECTRICAL, demand: DEFAULT_DEMAND, finance, isDemo: p.isDemo, createdBy: ctx.userId }).returning({ id: intelStudies.id });
    await tx.update(intelProperties).set({ status: "em_estudo" }).where(and(eq(intelProperties.id, propertyId), eq(intelProperties.status, "prospeccao")));
    return s;
  });
}

async function loadStudyRow(tx: Tx, scope: IntelScope, id: string) {
  if (!uuidOk(id)) throw notFound("Estudo não encontrado.");
  const [s] = await tx.select().from(intelStudies).where(eq(intelStudies.id, id));
  if (!s) throw notFound("Estudo não encontrado.");
  if (!scope.global && !scope.orgIds.includes(s.organizationId)) {
    const [sh] = await tx.select().from(intelStudyShares).where(and(eq(intelStudyShares.studyId, id), inArray(intelStudyShares.organizationId, scope.orgIds.length ? scope.orgIds : ["00000000-0000-0000-0000-000000000000"])));
    if (!sh) assertOrgVisible(scope, s.organizationId);
  }
  return s;
}

const SECTION_SCHEMAS = { chargers: chargersSchema, site: siteSchema, electrical: electricalSchema, demand: demandSchema, finance: financeSchema } as const;
export type StudySection = keyof typeof SECTION_SCHEMAS;

/** Atualiza uma seção do estudo (JSON validado). */
export async function updateStudySection(ctx: AuthContext, id: string, section: StudySection, data: unknown) {
  const scope = await loadScope(ctx);
  const r = SECTION_SCHEMAS[section].safeParse(data);
  if (!r.success) throw validation("Verifique os valores informados.", Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message])));
  if (section === "chargers") {
    const errs = validateChargers(r.data as ChargerLine[]);
    if (errs.length) throw validation(errs.join(" "));
  }
  return withIntel(ctx, scope, async (tx) => {
    const s = await loadStudyRow(tx, scope, id);
    assertCanEditOrg(ctx, scope, s.organizationId);
    await tx.update(intelStudies).set({ [section]: r.data }).where(eq(intelStudies.id, id));
  });
}

export async function updateStudyMeta(ctx: AuthContext, id: string, input: unknown) {
  const scope = await loadScope(ctx);
  const d = formDataSafe(z.object({ name: requiredText("Nome", 2, 150), status: z.enum(["em_andamento", "concluido", "arquivado"]), selectedScenario: z.enum(SCENARIO_KEYS) }), input);
  return withIntel(ctx, scope, async (tx) => {
    const s = await loadStudyRow(tx, scope, id);
    assertCanEditOrg(ctx, scope, s.organizationId);
    await tx.update(intelStudies).set(d).where(eq(intelStudies.id, id));
  });
}

const revenueSchema = z.object({
  category: z.enum(["publicidade_telas", "publicidade_totens", "parcerias", "conveniencia", "alimentos_bebidas", "maquinas_automaticas", "cafe", "servicos_motoristas", "troca_baterias", "limpeza_capacetes", "assinaturas", "coworking", "outras"]),
  name: requiredText("Descrição", 2, 120),
  commercialModel: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.string().max(200).nullable()),
  status: z.enum(["hipotese", "negociando", "contratado", "realizado"]),
  grossMonthly: z.coerce.number().min(0).max(100_000_000),
  costsMonthly: z.coerce.number().min(0).max(100_000_000),
  commissionRate: z.coerce.number().min(0).max(99).transform((v) => v / 100),
  taxRate: z.coerce.number().min(0).max(99).transform((v) => v / 100),
  initialInvestment: z.coerce.number().min(0).max(1_000_000_000),
  confidence: z.enum(["alta", "media", "baixa"]),
});
export const REVENUE_CATEGORIES: Record<z.infer<typeof revenueSchema>["category"], string> = {
  publicidade_telas: "Publicidade em telas", publicidade_totens: "Publicidade em totens", parcerias: "Parcerias comerciais", conveniencia: "Conveniência",
  alimentos_bebidas: "Bebidas e alimentos", maquinas_automaticas: "Máquinas automáticas", cafe: "Café", servicos_motoristas: "Serviços para motoristas",
  troca_baterias: "Troca de baterias (parceria)", limpeza_capacetes: "Limpeza de capacetes", assinaturas: "Assinaturas e benefícios", coworking: "Coworking", outras: "Outras receitas",
};

export async function addRevenue(ctx: AuthContext, studyId: string, input: unknown) {
  const scope = await loadScope(ctx);
  const d = formDataSafe(revenueSchema, input);
  return withIntel(ctx, scope, async (tx) => {
    const s = await loadStudyRow(tx, scope, studyId);
    assertCanEditOrg(ctx, scope, s.organizationId);
    await tx.insert(intelStudyRevenues).values({ ...d, studyId, organizationId: s.organizationId, grossMonthly: String(d.grossMonthly), costsMonthly: String(d.costsMonthly), initialInvestment: String(d.initialInvestment) });
  });
}

export async function removeRevenue(ctx: AuthContext, studyId: string, revenueId: string) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, async (tx) => {
    const s = await loadStudyRow(tx, scope, studyId);
    assertCanEditOrg(ctx, scope, s.organizationId);
    await tx.delete(intelStudyRevenues).where(and(eq(intelStudyRevenues.id, revenueId), eq(intelStudyRevenues.studyId, studyId)));
  });
}

export async function shareStudy(ctx: AuthContext, studyId: string, orgId: string, share: boolean) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, async (tx) => {
    const s = await loadStudyRow(tx, scope, studyId);
    assertCanEditOrg(ctx, scope, s.organizationId);
    if (orgId === s.organizationId) throw validation("O estudo já pertence a esta organização.");
    const [o] = await tx.select({ id: intelOrganizations.id }).from(intelOrganizations).where(eq(intelOrganizations.id, orgId));
    if (!o) throw notFound("Organização não encontrada.");
    if (share) await tx.insert(intelStudyShares).values({ studyId, organizationId: orgId, sharedBy: ctx.userId }).onConflictDoNothing();
    else await tx.delete(intelStudyShares).where(and(eq(intelStudyShares.studyId, studyId), eq(intelStudyShares.organizationId, orgId)));
  });
}

/* ------------------------------------ Cálculo ------------------------------------ */

export type StudyComputation = Awaited<ReturnType<typeof computeStudy>>;

/** Executa todos os módulos para um estudo (infraestrutura, baixa tensão, localização, demanda ×3, financeiro ×3). */
export async function computeStudy(tx: Tx, s: typeof intelStudies.$inferSelect) {
  const chargers = s.chargers as StudyChargers;
  const site = s.site as StudySite;
  const electrical = s.electrical as StudyElectrical;
  const demand = s.demand as StudyDemand;
  const finance = s.finance as StudyFinance;
  const [prop] = await tx.select().from(intelProperties).where(eq(intelProperties.id, s.propertyId));
  const revenues = await tx.select().from(intelStudyRevenues).where(eq(intelStudyRevenues.studyId, s.id));

  const infra = simulateInfrastructure(chargers, site);
  const lv = assessLowVoltage({
    supplyVoltageV: electrical.supplyVoltageV, phases: electrical.phases, availableKw: site.availableKw, existingLoadKw: electrical.existingLoadKw,
    projectedSimultaneousKw: infra.installedKw > 0 ? infra.simultaneousKw : null, distanceToSupplyM: electrical.distanceToSupplyM, hasTransformer: electrical.hasTransformer,
    utilityStatement: electrical.utilityStatement, engineerOpinion: electrical.engineerOpinion, dynamicLoadManagement: site.dynamicLoadManagement,
  }, electrical.lvReferenceKw);
  const location = await analyzeSite(tx, prop, { lowVoltage: lv.classification });

  // Origem de cada entrada do modelo: dado importado (observado) ou premissa do usuário
  const compCount = location.competition && location.coverage.stationsLoaded ? location.competition.radii.reduce((best, r) => (Math.abs(r.radiusKm - demand.catchmentRadiusKm) < Math.abs(best.radiusKm - demand.catchmentRadiusKm) ? r : best)).count : null;
  const inputsOrigin = {
    bevFleet: demand.bevFleetOverride !== null ? { value: demand.bevFleetOverride, nature: "premissa" as const, source: "Informado no estudo" } : { value: location.indicators.frota_bev.value, nature: location.indicators.frota_bev.nature, source: location.indicators.frota_bev.source },
    phevFleet: demand.phevFleetOverride !== null ? { value: demand.phevFleetOverride, nature: "premissa" as const, source: "Informado no estudo" } : { value: location.indicators.frota_phev.value, nature: location.indicators.frota_phev.nature, source: location.indicators.frota_phev.source },
    competitors: demand.competitorsOverride !== null ? { value: demand.competitorsOverride, nature: "premissa" as const, source: "Informado no estudo" } : { value: compCount, nature: compCount === null ? ("sem_dados" as const) : ("observado" as const), source: compCount === null ? null : "Base de carregadores conhecidos" },
    externalDailyKwh: demand.externalDailyKwhOverride !== null ? { value: demand.externalDailyKwhOverride, nature: "premissa" as const, source: "Informado no estudo" } : { value: location.external?.kwh?.value ?? null, nature: location.external?.kwh ? ("observado" as const) : ("sem_dados" as const), source: location.external?.kwh ? "EVIE (arquivo autorizado)" : null },
  };

  const scenarioResults = Object.fromEntries(SCENARIO_KEYS.map((k) => {
    const a: DemandAssumptions = { ...demand.scenarios[k], bevFleet: inputsOrigin.bevFleet.value, phevFleet: inputsOrigin.phevFleet.value, competitors: inputsOrigin.competitors.value, externalDailyKwh: inputsOrigin.externalDailyKwh.value };
    const forecast = forecastDemand(a, chargers, site, { turnoverMin: demand.turnoverMin });
    const capMonth = forecast.capacitySessionsPerDay * a.kwhPerSession * 30.4;
    const fin = forecast.energyPerMonthKwh === null ? null : projectFinance({ ...toFinanceInputs(finance, chargers, revenues, forecast.energyPerMonthKwh, a), energyGrowthYear: a.annualFleetGrowth, energyCapMonthKwh: capMonth });
    return [k, { assumptions: a, forecast, finance: fin }];
  })) as Record<ScenarioKey, { assumptions: DemandAssumptions; forecast: ReturnType<typeof forecastDemand>; finance: ReturnType<typeof projectFinance> | null }>;

  const sel = scenarioResults[s.selectedScenario as ScenarioKey];
  const sens = sensitivity(sel.assumptions, chargers, site);
  const obs = await tx.select().from(intelHubObservations).where(eq(intelHubObservations.propertyId, s.propertyId));
  const calibration = temporalValidation(obs.map((o) => ({ date: o.date, sessions: o.sessions, energyKwh: o.energyKwh })));

  const pendencies = [...lv.missing.map((m) => `Elétrica: ${m}`), ...infra.capex.missing, ...financeCompleteness(finance)];
  const nature = prop.isDemo ? "DEMONSTRAÇÃO (dados fictícios)" : sel.forecast.path === "sem_dados" ? "Preliminar — sem dados de demanda" : "Preliminar — simulação baseada em premissas" + (inputsOrigin.bevFleet.nature === "observado" || inputsOrigin.externalDailyKwh.nature === "observado" ? " e dados importados" : "");
  return { property: prop, infra, lv, location, inputsOrigin, scenarios: scenarioResults, selected: s.selectedScenario as ScenarioKey, sensitivity: sens, calibration, revenues, pendencies, nature, modelVersion: MODEL_VERSION };
}

export function toFinanceInputs(f: StudyFinance, chargers: StudyChargers, revenues: (typeof intelStudyRevenues.$inferSelect)[], energyMonthKwh: number, a: Pick<DemandAssumptions, "pricePerKwh" | "annualFleetGrowth">): FinanceInputs {
  const capex = [...f.capex];
  if (f.useChargerCapex) {
    const infra = simulateInfrastructure(chargers);
    capex.unshift({ label: "Equipamentos (carregadores)", amount: infra.capex.equipment }, { label: "Instalação dos carregadores", amount: infra.capex.installation });
  }
  return {
    horizonMonths: f.horizonMonths, energySoldMonthKwh: energyMonthKwh, energyGrowthYear: 0, pricePerKwh: a.pricePerKwh, averageDiscount: f.averageDiscount,
    energyCostPerKwh: f.energyCostPerKwh, demandChargeMonthly: f.demandChargeMonthly, chargerEfficiency: f.chargerEfficiency,
    revenueTaxRate: f.revenueTaxRate, paymentFeeRate: f.paymentFeeRate, platformFeeRate: f.platformFeeRate, partnerCommissionRate: f.partnerCommissionRate,
    fixedCosts: f.fixedCosts, capex, contingencyRate: f.contingencyRate, workingCapital: f.workingCapital,
    complementary: revenues.map((r) => ({ name: r.name, status: r.status as RevenueStatus, grossMonthly: Number(r.grossMonthly), costsMonthly: Number(r.costsMonthly), commissionRate: r.commissionRate, taxRate: r.taxRate, initialInvestment: Number(r.initialInvestment) })),
    includeStatuses: f.includeStatuses, inflationYear: f.inflationYear, discountRateYear: f.discountRateYear, incomeTaxRate: f.incomeTaxRate, depreciationYears: f.depreciationYears, financing: f.financing,
  };
}

export async function getStudy(ctx: AuthContext, id: string) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, async (tx) => {
    const s = await loadStudyRow(tx, scope, id);
    const comp = await computeStudy(tx, s);
    const shares = await tx.select({ organizationId: intelStudyShares.organizationId, name: intelOrganizations.name }).from(intelStudyShares).innerJoin(intelOrganizations, eq(intelOrganizations.id, intelStudyShares.organizationId)).where(eq(intelStudyShares.studyId, id));
    const history = await tx.select({ id: intelDemandForecasts.id, scenario: intelDemandForecasts.scenario, modelVersion: intelDemandForecasts.modelVersion, createdAt: intelDemandForecasts.createdAt, result: intelDemandForecasts.result }).from(intelDemandForecasts).where(eq(intelDemandForecasts.studyId, id)).orderBy(desc(intelDemandForecasts.createdAt)).limit(10);
    const canEdit = scope.orgIds.includes(s.organizationId) && (ctx.permissions.has("inteligencia.edit") || ctx.permissions.has("inteligencia.admin")) && scope.memberships.find((m) => m.organizationId === s.organizationId)?.role !== "consulta";
    return { study: s, ...comp, shares, history, canEdit, scope };
  });
}

/** Registra a previsão atual (parâmetros + versão do modelo + resultado) para reprodutibilidade e histórico. */
export async function snapshotForecast(ctx: AuthContext, id: string) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, async (tx) => {
    const s = await loadStudyRow(tx, scope, id);
    assertCanEditOrg(ctx, scope, s.organizationId);
    const c = await computeStudy(tx, s);
    for (const k of SCENARIO_KEYS) {
      const r = c.scenarios[k];
      await tx.insert(intelDemandForecasts).values({
        studyId: id, organizationId: s.organizationId, scenario: k, modelVersion: MODEL_VERSION, createdBy: ctx.userId,
        parameters: { assumptions: r.assumptions, chargers: s.chargers, site: s.site, inputsOrigin: c.inputsOrigin },
        result: { forecast: r.forecast, finance: r.finance ? { initialInvestment: r.finance.initialInvestment, firstYear: r.finance.firstYear, paybackMonths: r.finance.paybackMonths, breakEvenKwhMonth: r.finance.breakEvenKwhMonth, npv: r.finance.npv } : null },
      });
    }
  });
}

/* --------------------------- Ranking e comparação --------------------------- */

export async function rankingData(ctx: AuthContext, opts: { org?: string | null; ids?: string[] } = {}) {
  const scope = await loadScope(ctx, opts.org);
  return withIntel(ctx, scope, async (tx) => {
    const where = and(orgFilter(scope, intelStudies.organizationId, !opts.ids), opts.ids?.length ? inArray(intelStudies.id, opts.ids) : undefined, sql`${intelStudies.status} <> 'arquivado'`);
    const studies = await tx.select().from(intelStudies).where(where).orderBy(desc(intelStudies.updatedAt)).limit(opts.ids ? 10 : 200);
    const out = [];
    for (const s of studies) {
      if (opts.ids && !scope.global && !scope.orgIds.includes(s.organizationId)) {
        // estudo compartilhado: loadStudyRow valida o compartilhamento
        await loadStudyRow(tx, scope, s.id);
      }
      const c = await computeStudy(tx, s);
      const sel = c.scenarios[c.selected];
      out.push({ study: s, property: c.property, index: c.location.index, competition: c.location.competition, infra: c.infra, lv: c.lv, selected: c.selected, scenario: sel, scenarios: c.scenarios, pendencies: c.pendencies, nature: c.nature });
    }
    return { rows: out, scope };
  });
}
