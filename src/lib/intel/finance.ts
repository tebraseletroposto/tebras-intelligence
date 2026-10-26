/**
 * Viabilidade financeira do Tebras Smart Hub (Módulo D). Funções puras, valores em R$ (number).
 *
 * Distinções obrigatórias:
 *  - Faturamento (receita bruta) ≠ lucro.
 *  - Resultado operacional (EBITDA simplificado) ≠ lucro líquido ≠ fluxo de caixa.
 *  - Receitas complementares só entram se a situação comercial permitir (padrão: contratado/realizado).
 *  - Payback só é informado se o investimento for recuperado dentro do horizonte.
 */

export const REVENUE_STATUS = {
  hipotese: { label: "Hipótese", tone: "neutral" },
  negociando: { label: "Negociando", tone: "warning" },
  contratado: { label: "Contratado", tone: "success" },
  realizado: { label: "Realizado", tone: "success" },
} as const;
export type RevenueStatus = keyof typeof REVENUE_STATUS;

export type ComplementaryRevenue = {
  name: string;
  status: RevenueStatus;
  grossMonthly: number;
  costsMonthly: number;
  /** Comissão sobre a receita bruta (0–1). */
  commissionRate: number;
  /** Tributos sobre a receita bruta (0–1). */
  taxRate: number;
  initialInvestment: number;
};

export type CapexItem = { label: string; amount: number | null };
export type FixedCostItem = { label: string; monthly: number | null };

export type FinanceInputs = {
  horizonMonths: number;
  /** Energia vendida por mês no ano 1 (kWh) — vem do módulo de demanda. */
  energySoldMonthKwh: number;
  /** Crescimento anual da energia vendida (0–1). */
  energyGrowthYear: number;
  /** Teto de energia vendável por mês (capacidade instalada); null = sem teto. */
  energyCapMonthKwh?: number | null;
  pricePerKwh: number;
  /** Desconto médio concedido sobre o preço (0–1). */
  averageDiscount: number;
  /** Tarifa de compra de energia (R$/kWh, com encargos) — sem tarifa nacional única. */
  energyCostPerKwh: number;
  /** Demanda contratada mensal (R$), quando aplicável. */
  demandChargeMonthly: number;
  /** Eficiência de conversão rede→veículo (0–1): energia comprada = vendida / eficiência. */
  chargerEfficiency: number;
  /** Tributos sobre a receita de recarga (0–1). */
  revenueTaxRate: number;
  paymentFeeRate: number;
  platformFeeRate: number;
  /** Comissão de parceiros sobre a receita de recarga (0–1). */
  partnerCommissionRate: number;
  fixedCosts: FixedCostItem[];
  capex: CapexItem[];
  /** Contingência sobre o investimento (0–1). */
  contingencyRate: number;
  workingCapital: number;
  complementary: ComplementaryRevenue[];
  includeStatuses: RevenueStatus[];
  /** Inflação anual aplicada a preço, tarifa e custos fixos (0–1). */
  inflationYear: number;
  /** Taxa de desconto anual para VPL (0–1); null = não calcular. */
  discountRateYear: number | null;
  /** Imposto sobre o lucro (IR/CSLL simplificado) sobre resultado positivo antes de impostos (0–1). */
  incomeTaxRate: number;
  depreciationYears: number;
  financing: { principal: number; annualRate: number; months: number; graceMonths: number } | null;
};

export type MonthRow = {
  month: number;
  energyKwh: number;
  chargingGross: number;
  complementaryNet: number;
  variableCosts: number;
  contributionMargin: number;
  fixedCosts: number;
  operatingResult: number;
  depreciation: number;
  interest: number;
  incomeTax: number;
  netIncome: number;
  amortization: number;
  cashFlow: number;
  cumulativeCash: number;
};

export type FinanceResult = {
  initialInvestment: number;
  capexMissing: string[];
  fixedMissing: string[];
  monthly: MonthRow[];
  firstYear: { grossRevenue: number; chargingGross: number; complementaryNet: number; variableCosts: number; contributionMargin: number; fixedCosts: number; operatingResult: number; netIncome: number; cashFlow: number };
  contributionMarginPerKwh: number;
  breakEvenKwhMonth: number | null;
  breakEvenKwhDay: number | null;
  paybackMonths: number | null;
  discountedPaybackMonths: number | null;
  npv: number | null;
  roi: number | null;
  minCumulativeCash: number;
  workingCapitalNeed: number;
  excludedComplementary: string[];
  warnings: string[];
};

/** Prestação pela tabela Price. */
export function pricePayment(principal: number, monthlyRate: number, n: number) {
  if (n <= 0) return 0;
  if (monthlyRate === 0) return principal / n;
  return (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -n));
}

export const annualToMonthly = (r: number) => Math.pow(1 + r, 1 / 12) - 1;

/** Margem de contribuição por kWh vendido (antes de custos fixos). */
export function contributionPerKwh(i: Pick<FinanceInputs, "pricePerKwh" | "averageDiscount" | "energyCostPerKwh" | "chargerEfficiency" | "revenueTaxRate" | "paymentFeeRate" | "platformFeeRate" | "partnerCommissionRate">) {
  const net = i.pricePerKwh * (1 - i.averageDiscount);
  const pctCosts = i.revenueTaxRate + i.paymentFeeRate + i.platformFeeRate + i.partnerCommissionRate;
  return net * (1 - pctCosts) - i.energyCostPerKwh / Math.max(i.chargerEfficiency, 1e-6);
}

export function validateFinance(i: FinanceInputs): string[] {
  const e: string[] = [];
  const rates: [string, number][] = [["Desconto", i.averageDiscount], ["Tributos", i.revenueTaxRate], ["Taxa de pagamento", i.paymentFeeRate], ["Taxa de plataforma", i.platformFeeRate], ["Comissão", i.partnerCommissionRate], ["Contingência", i.contingencyRate], ["IR/CSLL", i.incomeTaxRate]];
  for (const [l, v] of rates) if (!(v >= 0 && v < 1)) e.push(`${l} deve estar entre 0% e 100%.`);
  if (!(i.chargerEfficiency > 0 && i.chargerEfficiency <= 1)) e.push("Eficiência deve estar entre 0 e 100%.");
  if (!(i.horizonMonths >= 12 && i.horizonMonths <= 240)) e.push("Horizonte deve estar entre 12 e 240 meses.");
  if (i.pricePerKwh < 0 || i.energyCostPerKwh < 0) e.push("Preço e tarifa não podem ser negativos.");
  if (i.energySoldMonthKwh < 0) e.push("Energia vendida não pode ser negativa.");
  if (i.financing && (i.financing.principal < 0 || i.financing.months <= 0 || i.financing.annualRate < 0 || i.financing.graceMonths < 0)) e.push("Dados de financiamento inválidos.");
  return e;
}

export function projectFinance(i: FinanceInputs): FinanceResult {
  const warnings = validateFinance(i);
  const capexMissing = i.capex.filter((c) => c.amount === null).map((c) => c.label);
  const fixedMissing = i.fixedCosts.filter((c) => c.monthly === null).map((c) => c.label);
  if (capexMissing.length) warnings.push(`Investimento incompleto — itens não informados: ${capexMissing.join(", ")}.`);
  if (fixedMissing.length) warnings.push(`Custos fixos não informados (não considerados): ${fixedMissing.join(", ")}.`);

  const included = i.complementary.filter((c) => i.includeStatuses.includes(c.status));
  const excluded = i.complementary.filter((c) => !i.includeStatuses.includes(c.status)).map((c) => `${c.name} (${REVENUE_STATUS[c.status].label})`);

  const capexBase = i.capex.reduce((s, c) => s + (c.amount ?? 0), 0) + included.reduce((s, c) => s + c.initialInvestment, 0);
  const depreciable = capexBase;
  const initialInvestment = capexBase * (1 + i.contingencyRate) + i.workingCapital;
  const fixedBase = i.fixedCosts.reduce((s, c) => s + (c.monthly ?? 0), 0);

  // Financiamento: carência paga apenas juros; depois tabela Price.
  const fin = i.financing && i.financing.principal > 0 ? i.financing : null;
  const mRate = fin ? annualToMonthly(fin.annualRate) : 0;
  const pmt = fin ? pricePayment(fin.principal, mRate, fin.months) : 0;
  let balance = fin?.principal ?? 0;

  const dRate = i.discountRateYear !== null ? annualToMonthly(i.discountRateYear) : null;
  const depMonthly = i.depreciationYears > 0 ? depreciable / (i.depreciationYears * 12) : 0;
  // Fluxo inicial: investimento total menos o que foi financiado
  let cumulative = -(initialInvestment - (fin?.principal ?? 0));
  let cumulativeDisc = cumulative;
  let npv = dRate !== null ? cumulative : null;
  let minCum = cumulative;
  let payback: number | null = null;
  let dPayback: number | null = null;
  const monthly: MonthRow[] = [];

  for (let m = 1; m <= i.horizonMonths; m++) {
    const year = Math.floor((m - 1) / 12);
    const infl = Math.pow(1 + i.inflationYear, year);
    const grown = i.energySoldMonthKwh * Math.pow(1 + i.energyGrowthYear, year);
    const energy = i.energyCapMonthKwh == null ? grown : Math.min(grown, i.energyCapMonthKwh);
    const price = i.pricePerKwh * infl;
    const chargingGross = energy * price * (1 - i.averageDiscount);
    const pct = i.revenueTaxRate + i.paymentFeeRate + i.platformFeeRate + i.partnerCommissionRate;
    const energyCost = (energy / Math.max(i.chargerEfficiency, 1e-6)) * i.energyCostPerKwh * infl;
    const variableCosts = chargingGross * pct + energyCost;
    const complementaryNet = included.reduce((s, c) => s + (c.grossMonthly * (1 - c.commissionRate - c.taxRate) - c.costsMonthly) * infl, 0);
    const contributionMargin = chargingGross - variableCosts + complementaryNet;
    const fixedCosts = (fixedBase + i.demandChargeMonthly) * infl;
    const operatingResult = contributionMargin - fixedCosts;

    let interest = 0, amortization = 0;
    if (fin && balance > 1e-6) {
      interest = balance * mRate;
      if (m > fin.graceMonths) amortization = Math.min(balance, pmt - interest);
      balance -= amortization;
    }
    const ebt = operatingResult - depMonthly - interest;
    const incomeTax = Math.max(0, ebt) * i.incomeTaxRate;
    const netIncome = ebt - incomeTax;
    const cashFlow = operatingResult - interest - incomeTax - amortization;
    const prev = cumulative;
    cumulative += cashFlow;
    minCum = Math.min(minCum, cumulative);
    if (payback === null && prev < 0 && cumulative >= 0) payback = m - 1 + (-prev / cashFlow);
    if (dRate !== null) {
      const disc = cashFlow / Math.pow(1 + dRate, m);
      const prevD = cumulativeDisc;
      cumulativeDisc += disc;
      npv = (npv as number) + disc;
      if (dPayback === null && prevD < 0 && cumulativeDisc >= 0) dPayback = m - 1 + (-prevD / disc);
    }
    monthly.push({ month: m, energyKwh: energy, chargingGross, complementaryNet, variableCosts, contributionMargin, fixedCosts, operatingResult, depreciation: depMonthly, interest, incomeTax, netIncome, amortization, cashFlow, cumulativeCash: cumulative });
  }
  if (fin && balance > 1) warnings.push("O financiamento não é quitado dentro do horizonte analisado.");
  if (payback === null) warnings.push("Retorno do investimento NÃO atingido dentro do horizonte analisado.");

  const y1 = monthly.slice(0, 12);
  const sum = (k: keyof MonthRow) => y1.reduce((s, r) => s + (r[k] as number), 0);
  const cmKwh = contributionPerKwh(i);
  const fixedM1 = fixedBase + i.demandChargeMonthly;
  const compM1 = included.reduce((s, c) => s + c.grossMonthly * (1 - c.commissionRate - c.taxRate) - c.costsMonthly, 0);
  const breakEven = cmKwh > 0 ? Math.max(0, (fixedM1 - compM1) / cmKwh) : null;
  if (cmKwh <= 0) warnings.push("Margem de contribuição por kWh não é positiva: cada kWh vendido aumenta o prejuízo. Ponto de equilíbrio inexistente.");
  const equity = initialInvestment - (fin?.principal ?? 0);

  return {
    initialInvestment, capexMissing, fixedMissing, monthly,
    firstYear: { grossRevenue: sum("chargingGross") + y1.reduce((s, r) => s + Math.max(0, r.complementaryNet), 0), chargingGross: sum("chargingGross"), complementaryNet: sum("complementaryNet"), variableCosts: sum("variableCosts"), contributionMargin: sum("contributionMargin"), fixedCosts: sum("fixedCosts"), operatingResult: sum("operatingResult"), netIncome: sum("netIncome"), cashFlow: sum("cashFlow") },
    contributionMarginPerKwh: cmKwh,
    breakEvenKwhMonth: breakEven,
    breakEvenKwhDay: breakEven === null ? null : breakEven / 30.4,
    paybackMonths: payback, discountedPaybackMonths: dPayback, npv,
    // ROI sobre o capital próprio: caixa acumulado no fim do horizonte ÷ capital próprio aplicado
    roi: equity > 0 ? cumulative / equity : null,
    minCumulativeCash: minCum,
    // Caixa adicional necessário para cobrir prejuízos operacionais após o aporte inicial
    workingCapitalNeed: Math.max(0, -(minCum + equity)),
    excludedComplementary: excluded, warnings,
  };
}

export const DEFAULT_FIXED_COSTS: FixedCostItem[] = ["Aluguel", "Internet", "Segurança", "Limpeza", "Manutenção", "Seguro", "Salários", "Contabilidade", "Marketing", "Sistema de gestão", "Reposição de equipamentos (provisão)"].map((label) => ({ label, monthly: null }));
export const DEFAULT_CAPEX: CapexItem[] = ["Equipamentos (carregadores)", "Instalação", "Infraestrutura elétrica", "Obras civis", "Mobiliário", "Comunicação visual", "Segurança (CFTV)", "Projetos e licenças", "Caução/garantia do aluguel", "Outros investimentos"].map((label) => ({ label, amount: null }));
