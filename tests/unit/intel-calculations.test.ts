import { describe, expect, it } from "vitest";
import { analyzeCompetition, type KnownStation } from "@/lib/intel/competition";
import { errorMetrics, forecastDemand, DEFAULT_SCENARIO_ASSUMPTIONS, sensitivity, temporalValidation, validateAssumptions, type DemandAssumptions } from "@/lib/intel/demand";
import { contributionPerKwh, pricePayment, projectFinance, type FinanceInputs } from "@/lib/intel/finance";
import { bboxAround, haversineMeters, parseBbox, parseCoordinates, polygonAreaM2, validatePolygon } from "@/lib/intel/geo";
import { sessionCapacity, simulateInfrastructure, validateChargers, type ChargerLine, DEFAULT_SITE } from "@/lib/intel/infrastructure";
import { assessLowVoltage, type LvInputs } from "@/lib/intel/low-voltage";
import { computePotentialIndex, DEFAULT_INDEX_CONFIG, validateIndexConfig, type IndexInputs } from "@/lib/intel/potential-index";
import { recommend, type ProjectSummary } from "@/lib/intel/compare";
import { freshness } from "@/lib/intel/provenance";

const PAULISTA = { lat: -23.5614, lng: -46.6559 };

describe("geografia", () => {
  it("valida coordenadas, aceita vírgula decimal e rejeita (0,0)", () => {
    expect(parseCoordinates("-23,56", "-46,65")).toMatchObject({ ok: true, outsideBrazil: false });
    expect(parseCoordinates(0, 0).ok).toBe(false);
    expect(parseCoordinates(95, 10).ok).toBe(false);
    expect(parseCoordinates("abc", 1).ok).toBe(false);
    expect(parseCoordinates(40.7, -74).ok && (parseCoordinates(40.7, -74) as { outsideBrazil: boolean }).outsideBrazil).toBe(true);
  });
  it("haversine: Paulista → Sé ≈ 3,0 km; distância zero para o mesmo ponto", () => {
    const se = { lat: -23.5503, lng: -46.6339 };
    const d = haversineMeters(PAULISTA, se);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2700);
    expect(haversineMeters(PAULISTA, PAULISTA)).toBe(0);
  });
  it("bbox contém o raio pedido", () => {
    const b = bboxAround(PAULISTA, 5000);
    expect(haversineMeters(PAULISTA, { lat: b.maxLat, lng: PAULISTA.lng })).toBeCloseTo(5000, -1);
  });
  it("bbox de consulta rejeita áreas nacionais e valores inválidos", () => {
    expect(parseBbox("-46.8,-23.7,-46.4,-23.4")).not.toBeNull();
    expect(parseBbox("-74,-34,-28,5")).toBeNull();
    expect(parseBbox("1,2,3")).toBeNull();
    expect(parseBbox("-46,-23,-47,-22")).toBeNull();
  });
  it("área de polígono ≈ 100 m × 100 m", () => {
    const dLat = 100 / 111_195; const dLng = dLat / Math.cos((PAULISTA.lat * Math.PI) / 180);
    const ring: [number, number][] = [[PAULISTA.lng, PAULISTA.lat], [PAULISTA.lng + dLng, PAULISTA.lat], [PAULISTA.lng + dLng, PAULISTA.lat + dLat], [PAULISTA.lng, PAULISTA.lat + dLat]];
    expect(polygonAreaM2(ring)).toBeGreaterThan(9900);
    expect(polygonAreaM2(ring)).toBeLessThan(10100);
    expect(validatePolygon({ type: "Polygon", coordinates: [[...ring, ring[0]]] }).ok).toBe(true);
    expect(validatePolygon({ type: "Polygon", coordinates: [ring] }).ok).toBe(false);
  });
});

const st = (id: string, dLatKm: number, extra: Partial<KnownStation> = {}): KnownStation => ({
  id, lat: PAULISTA.lat + dLatKm / 111.195, lng: PAULISTA.lng, name: id, operator: null, maxPowerKw: null, connectors: null, currentType: null, pricePerKwh: null, status: "nao_verificado", verifiedAt: null, ...extra,
});

describe("concorrência", () => {
  it("conta por raio, soma potências conhecidas e distribui por faixa", () => {
    const a = analyzeCompetition(PAULISTA, [st("a", 0.5, { maxPowerKw: 60, operator: "X", status: "confirmado", verifiedAt: new Date().toISOString() }), st("b", 2, { maxPowerKw: 7, pricePerKwh: 1.5 }), st("c", 8), st("d", 30)]);
    const r1 = a.radii.find((r) => r.radiusKm === 1)!;
    const r3 = a.radii.find((r) => r.radiusKm === 3)!;
    const r10 = a.radii.find((r) => r.radiusKm === 10)!;
    expect(r1.count).toBe(1);
    expect(r3.count).toBe(2);
    expect(r3.knownPowerKw).toBe(67);
    expect(r3.byBand.dc_60_119).toBe(1);
    expect(r10.unknownPowerCount).toBe(1);
    expect(a.radii.find((r) => r.radiusKm === 20)!.count).toBe(3);
    expect(r3.pricesPerKwh).toMatchObject({ min: 1.5, n: 1 });
    expect(a.nearest[0].id).toBe("a");
  });
  it("sem carregadores: não conclui demanda reprimida e aponta lacuna", () => {
    const a = analyzeCompetition(PAULISTA, []);
    expect(a.radii.every((r) => r.count === 0 && r.knownPowerKw === null)).toBe(true);
    expect(a.dataGaps.join(" ")).toMatch(/falta de cobertura/);
    expect(a.interpretation.join(" ")).toMatch(/não comprova demanda reprimida/);
  });
  it("marca registros desatualizados", () => {
    const now = new Date("2026-10-01");
    expect(freshness("2026-01-01", 180, now)).toBe("desatualizado");
    expect(freshness(null, 180, now)).toBe("sem_data");
    const a = analyzeCompetition(PAULISTA, [st("a", 1, { verifiedAt: "2025-01-01" })], { now });
    expect(a.dataGaps.join(" ")).toMatch(/sem verificação/);
  });
});

const emptyIdx: IndexInputs = { bevFleet: null, phevFleet: null, populationDensity: null, mainRoadDistanceM: null, destinationsWithin1km: null, competitorsWithin3km: null, externalDemandScore: null, areaM2: null, streetAccess: null, parking: null, lowVoltage: null, dataQuality: null };

describe("índice de potencial", () => {
  it("sem dados: nota nula e confiança insuficiente (nunca zero)", () => {
    const r = computePotentialIndex(emptyIdx);
    expect(r.score).toBeNull();
    expect(r.confidence).toBe("insuficiente");
    expect(r.coverage).toBe(0);
  });
  it("dados parciais reduzem cobertura e confiança, mas calculam a nota", () => {
    const partial = computePotentialIndex({ ...emptyIdx, mainRoadDistanceM: 0, areaM2: 600, streetAccess: true, parking: true });
    const full = computePotentialIndex({ ...emptyIdx, bevFleet: 5000, populationDensity: 10000, externalDemandScore: 1, mainRoadDistanceM: 0, destinationsWithin1km: 10, competitorsWithin3km: 0, areaM2: 600, streetAccess: true, parking: true, lowVoltage: "potencialmente_compativel", dataQuality: 1 });
    expect(partial.score).toBe(100);
    expect(partial.coverage).toBeLessThan(0.5);
    expect(full.score).toBe(100);
    expect(full.coverage).toBeCloseTo(1);
    expect(full.confidence).toBe("alta");
    expect(full.risks.join(" ")).toMatch(/verificar se a base cobre/);
  });
  it("pesos configuráveis alteram a nota; validação rejeita pesos negativos", () => {
    const i = { ...emptyIdx, mainRoadDistanceM: 0, competitorsWithin3km: 15 };
    const a = computePotentialIndex(i).score!;
    const b = computePotentialIndex(i, { ...DEFAULT_INDEX_CONFIG, weights: { ...DEFAULT_INDEX_CONFIG.weights, concorrencia: 0 } }).score!;
    expect(b).toBeGreaterThan(a);
    expect(validateIndexConfig({ ...DEFAULT_INDEX_CONFIG, weights: { ...DEFAULT_INDEX_CONFIG.weights, mercado: -1 } })).not.toHaveLength(0);
  });
});

const line = (powerKw: number, quantity: number, current: "AC" | "DC" = powerKw > 22 ? "DC" : "AC", extra: Partial<ChargerLine> = {}): ChargerLine => ({ label: `${powerKw} kW`, powerKw, current, quantity, unitCost: null, installCost: null, efficiency: null, ...extra });

describe("infraestrutura", () => {
  it("soma potências e aplica simultaneidade", () => {
    const r = simulateInfrastructure([line(60, 1), line(7, 2)], { ...DEFAULT_SITE, simultaneityFactor: 0.8 });
    expect(r.installedKw).toBe(74);
    expect(r.chargerCount).toBe(3);
    expect(r.dcCount).toBe(1);
    expect(r.simultaneousKw).toBeCloseTo(59.2);
    expect(r.powerShortfallKw).toBeNull();
    expect(r.limitations.join(" ")).toMatch(/desconhecida/);
    expect(r.capex.total).toBeNull();
  });
  it("limita pela potência disponível e aponta adequação sem DLM", () => {
    const r = simulateInfrastructure([line(60, 2)], { ...DEFAULT_SITE, availableKw: 75, simultaneityFactor: 1, operatingHours: 10, availability: 1 });
    expect(r.powerShortfallKw).toBe(45);
    expect(r.usableKw).toBe(75);
    expect(r.maxDailyEnergyKwh).toBe(750);
    expect(r.limitations.join(" ")).toMatch(/adequação/);
  });
  it("calcula capex só quando todos os custos são conhecidos", () => {
    const r = simulateInfrastructure([line(60, 1, "DC", { unitCost: 100000, installCost: 20000 }), line(7, 2, "AC", { unitCost: 5000, installCost: 2000 })]);
    expect(r.capex.total).toBe(134000);
  });
  it("capacidade de sessões depende da energia por sessão", () => {
    const site = { ...DEFAULT_SITE, operatingHours: 24, availability: 1 };
    const c = sessionCapacity([line(60, 1)], site, 30, { turnoverMin: 0 });
    expect(c.sessionsPerDay).toBe(48);
    expect(sessionCapacity([line(60, 1)], site, 0).sessionsPerDay).toBe(0);
  });
  it("valida configurações", () => {
    expect(validateChargers([line(-1, 1)])).toHaveLength(1);
    expect(validateChargers([line(60, 1, "AC")]).join()).toMatch(/AC acima/);
  });
});

const lv = (p: Partial<LvInputs>): LvInputs => ({ supplyVoltageV: null, phases: null, availableKw: null, existingLoadKw: null, projectedSimultaneousKw: null, distanceToSupplyM: null, hasTransformer: null, utilityStatement: null, engineerOpinion: null, dynamicLoadManagement: false, ...p });

describe("baixa tensão", () => {
  it("sem dados: não avaliável", () => expect(assessLowVoltage(lv({})).classification).toBe("nao_avaliavel"));
  it("folga positiva com dados completos: potencialmente compatível (sujeito a confirmação)", () => {
    const r = assessLowVoltage(lv({ supplyVoltageV: 380, phases: 3, availableKw: 75, existingLoadKw: 5, projectedSimultaneousKw: 50, distanceToSupplyM: 15, utilityStatement: "favoravel", engineerOpinion: "favoravel" }));
    expect(r.classification).toBe("potencialmente_compativel");
    expect(r.disclaimer).toMatch(/distribuidora/);
  });
  it("monofásico com DC: risco elevado", () => {
    expect(assessLowVoltage(lv({ phases: 1, availableKw: 20, projectedSimultaneousKw: 60 })).classification).toBe("risco_elevado");
  });
  it("dados parciais: necessita informações", () => {
    expect(assessLowVoltage(lv({ phases: 3, projectedSimultaneousKw: 30 })).classification).toBe("necessita_informacoes");
  });
});

const assumptions = (p: Partial<DemandAssumptions> = {}): DemandAssumptions => ({ ...DEFAULT_SCENARIO_ASSUMPTIONS.base, bevFleet: 10000, phevFleet: 0, competitors: 0, externalDailyKwh: null, ...p });
const site = { ...DEFAULT_SITE, operatingHours: 24, availability: 1 };

describe("demanda", () => {
  it("funil por etapas reproduzível", () => {
    const a = assumptions({ publicChargingShare: 0.3, publicSessionsPerWeek: 1.4, catchmentShare: 0.05, captureShare: 0.2 });
    const f1 = forecastDemand(a, [line(60, 2)], site);
    const f2 = forecastDemand(a, [line(60, 2)], site);
    // 10000 × 0,3 × 1,4/7 × 0,05 × 0,2 = 6 sessões/dia
    expect(f1.demandSessionsPerDay).toBeCloseTo(6);
    expect(f1.energyPerDayKwh).toBeCloseTo(150);
    expect(f1).toEqual(f2);
    expect(f1.steps.map((s) => s.key)).toEqual(["mercado", "usuarios", "regional", "acessivel", "captavel", "atendida"]);
  });
  it("limita pela capacidade instalada", () => {
    const f = forecastDemand(assumptions({ bevFleet: 1_000_000 }), [line(7, 1)], site);
    expect(f.capacityLimited).toBe(true);
    expect(f.servedSessionsPerDay).toBe(f.capacitySessionsPerDay);
    expect(f.utilization).toBeLessThanOrEqual(1);
  });
  it("sem frota nem dado externo: sem estimativa (não zero)", () => {
    const f = forecastDemand(assumptions({ bevFleet: null, phevFleet: null }), [line(60, 1)], site);
    expect(f.path).toBe("sem_dados");
    expect(f.energyPerMonthKwh).toBeNull();
  });
  it("dados parciais: só PHEV conhecido ainda estima", () => {
    expect(forecastDemand(assumptions({ bevFleet: null, phevFleet: 5000 }), [line(60, 1)], site).energyPerDayKwh).toBeGreaterThan(0);
  });
  it("usa demanda importada quando disponível", () => {
    const f = forecastDemand(assumptions({ externalDailyKwh: 1000, captureShare: 0.1 }), [line(60, 2)], site);
    expect(f.path).toBe("externo");
    expect(f.energyPerDayKwh).toBeCloseTo(100);
  });
  it("cenários: otimista > base > conservador", () => {
    const run = (k: keyof typeof DEFAULT_SCENARIO_ASSUMPTIONS) => forecastDemand({ ...DEFAULT_SCENARIO_ASSUMPTIONS[k], bevFleet: 20000, phevFleet: 5000, competitors: 3, externalDailyKwh: null }, [line(60, 4)], site).energyPerMonthKwh!;
    expect(run("otimista")).toBeGreaterThan(run("base"));
    expect(run("base")).toBeGreaterThan(run("conservador"));
  });
  it("detecta erros de unidade", () => {
    expect(validateAssumptions(assumptions({ kwhPerSession: 25000 })).join()).toMatch(/Wh/);
    expect(validateAssumptions(assumptions({ captureShare: 15 })).join()).toMatch(/entre 0% e 100%/);
  });
  it("sensibilidade ordena premissas por impacto", () => {
    const s = sensitivity(assumptions(), [line(60, 4)], site);
    expect(s.length).toBeGreaterThan(3);
    expect(s[0].swing).toBeGreaterThanOrEqual(s[s.length - 1].swing);
  });
  it("métricas de erro e validação temporal", () => {
    expect(errorMetrics([10, 10], [8, 12])).toEqual({ n: 2, mae: 2, wape: 0.2 });
    expect(temporalValidation([{ date: "2026-01-01", sessions: 1, energyKwh: 1 }]).ok).toBe(false);
    const obs = Array.from({ length: 56 }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 1 + i)); const we = [0, 6].includes(d.getUTCDay()); return { date: d.toISOString().slice(0, 10), sessions: 1, energyKwh: we ? 50 : 200 }; });
    const v = temporalValidation(obs);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.better).toBe("Média por dia da semana");
  });
});

const fin = (p: Partial<FinanceInputs> = {}): FinanceInputs => ({
  horizonMonths: 60, energySoldMonthKwh: 10000, energyGrowthYear: 0, pricePerKwh: 2, averageDiscount: 0, energyCostPerKwh: 0.8, demandChargeMonthly: 0, chargerEfficiency: 1,
  revenueTaxRate: 0.1, paymentFeeRate: 0, platformFeeRate: 0, partnerCommissionRate: 0, fixedCosts: [{ label: "Aluguel", monthly: 5000 }], capex: [{ label: "Equipamentos", amount: 200000 }],
  contingencyRate: 0, workingCapital: 0, complementary: [], includeStatuses: ["contratado", "realizado"], inflationYear: 0, discountRateYear: null, incomeTaxRate: 0, depreciationYears: 10, financing: null, ...p,
});

describe("financeiro", () => {
  it("receita por kWh, custos variáveis e margem de contribuição", () => {
    expect(contributionPerKwh(fin())).toBeCloseTo(1.0); // 2×0,9 − 0,8
    const r = projectFinance(fin());
    expect(r.monthly[0].chargingGross).toBeCloseTo(20000);
    expect(r.monthly[0].variableCosts).toBeCloseTo(2000 + 8000);
    expect(r.monthly[0].contributionMargin).toBeCloseTo(10000);
    expect(r.monthly[0].operatingResult).toBeCloseTo(5000);
  });
  it("ponto de equilíbrio e payback", () => {
    const r = projectFinance(fin());
    expect(r.breakEvenKwhMonth).toBeCloseTo(5000);
    expect(r.paybackMonths).toBeCloseTo(40);
    expect(r.initialInvestment).toBe(200000);
  });
  it("não informa payback quando não recupera no horizonte", () => {
    const r = projectFinance(fin({ energySoldMonthKwh: 5500 }));
    expect(r.paybackMonths).toBeNull();
    expect(r.warnings.join()).toMatch(/NÃO atingido/);
  });
  it("cenário com prejuízo: margem negativa sem ponto de equilíbrio", () => {
    const r = projectFinance(fin({ pricePerKwh: 0.8 }));
    expect(r.breakEvenKwhMonth).toBeNull();
    expect(r.firstYear.operatingResult).toBeLessThan(0);
  });
  it("receitas complementares: só contratadas entram; sem dupla contagem com a recarga", () => {
    const comp = [
      { name: "Publicidade", status: "contratado" as const, grossMonthly: 1000, costsMonthly: 100, commissionRate: 0.1, taxRate: 0, initialInvestment: 0 },
      { name: "Café", status: "hipotese" as const, grossMonthly: 9999, costsMonthly: 0, commissionRate: 0, taxRate: 0, initialInvestment: 0 },
    ];
    const r = projectFinance(fin({ complementary: comp }));
    expect(r.monthly[0].complementaryNet).toBeCloseTo(800);
    expect(r.monthly[0].chargingGross).toBeCloseTo(20000);
    expect(r.excludedComplementary).toEqual(["Café (Hipótese)"]);
  });
  it("financiamento separa juros e amortização", () => {
    expect(pricePayment(12000, 0, 12)).toBe(1000);
    const r = projectFinance(fin({ financing: { principal: 100000, annualRate: 0.12, months: 24, graceMonths: 0 } }));
    const m1 = r.monthly[0];
    expect(m1.interest).toBeGreaterThan(0);
    expect(m1.amortization).toBeGreaterThan(0);
    const totalAmort = r.monthly.reduce((s, x) => s + x.amortization, 0);
    expect(totalAmort).toBeCloseTo(100000, 0);
    expect(m1.cashFlow).toBeCloseTo(m1.operatingResult - m1.interest - m1.amortization);
  });
  it("lucro líquido ≠ resultado operacional ≠ fluxo de caixa (depreciação e IR)", () => {
    const r = projectFinance(fin({ incomeTaxRate: 0.34 }));
    const m = r.monthly[0];
    expect(m.netIncome).toBeLessThan(m.operatingResult);
    expect(m.cashFlow).not.toBeCloseTo(m.netIncome);
  });
  it("itens de investimento sem valor geram aviso", () => {
    const r = projectFinance(fin({ capex: [{ label: "Obras", amount: null }, { label: "Equipamentos", amount: 1000 }] }));
    expect(r.capexMissing).toEqual(["Obras"]);
  });
});

describe("recomendação", () => {
  const base: ProjectSummary = { id: "a", name: "A", potentialScore: 70, confidence: "media", initialInvestment: 300000, investmentComplete: true, monthlyRevenue: 50000, operatingResultYear1: 80000, paybackMonths: 30, horizonMonths: 120, lowVoltage: null, pendingTechnical: 0 };
  it("não escolhe automaticamente o maior faturamento", () => {
    const r = recommend([
      { ...base, id: "fat", monthlyRevenue: 200000, operatingResultYear1: -50000, paybackMonths: null },
      { ...base, id: "bom" },
      { ...base, id: "semdados", confidence: "insuficiente" },
    ]);
    expect(r[0].id).toBe("bom");
    expect(r.find((x) => x.id === "fat")!.verdict).toBe("descartar_por_ora");
    expect(r.find((x) => x.id === "semdados")!.verdict).toBe("aguardar_dados");
  });
});
