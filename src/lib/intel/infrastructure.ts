/**
 * Simulador de infraestrutura (Módulo B). Funções puras.
 *
 * Potência nominal instalada ≠ consumo real ≠ demanda simultânea garantida.
 * Os resultados são preliminares e dependem de confirmação por profissional habilitado.
 */

export const CHARGER_CATEGORIES = [
  { key: "ac7", label: "7 kW AC", powerKw: 7, current: "AC" as const },
  { key: "ac22", label: "22 kW AC", powerKw: 22, current: "AC" as const },
  { key: "dc30", label: "30 kW DC", powerKw: 30, current: "DC" as const },
  { key: "dc60", label: "60 kW DC", powerKw: 60, current: "DC" as const },
  { key: "dc80", label: "80 kW DC", powerKw: 80, current: "DC" as const },
  { key: "dc120", label: "120 kW DC", powerKw: 120, current: "DC" as const },
];

export type ChargerLine = {
  label: string;
  powerKw: number;
  current: "AC" | "DC";
  quantity: number;
  /** Custos unitários informados pelo usuário (null = não informado; não é zero). */
  unitCost: number | null;
  installCost: number | null;
  /** Eficiência rede→veículo, quando conhecida (0–1). */
  efficiency: number | null;
};

export type SiteElectrical = {
  /** Potência disponível no ponto de entrega para a recarga (kW); null = desconhecida. */
  availableKw: number | null;
  /** Fator de simultaneidade (0–1) — premissa editável. */
  simultaneityFactor: number;
  /** Gerenciamento dinâmico de carga limita a potência total ao disponível. */
  dynamicLoadManagement: boolean;
  /** Horas de funcionamento por dia. */
  operatingHours: number;
  /** Disponibilidade técnica dos equipamentos (0–1). */
  availability: number;
  /** Consumo auxiliar (iluminação, telas, climatização) em kW médio; null = não estimado. */
  auxiliaryKw: number | null;
};

export const DEFAULT_SITE: SiteElectrical = { availableKw: null, simultaneityFactor: 0.8, dynamicLoadManagement: false, operatingHours: 24, availability: 0.97, auxiliaryKw: null };

export type InfraResult = {
  installedKw: number;
  chargerCount: number;
  dcCount: number;
  simultaneousKw: number;
  /** Potência efetivamente utilizável (limitada pelo disponível quando conhecido e houver DLM). */
  usableKw: number;
  /** Excesso de potência simultânea sobre o disponível (kW). null quando disponível desconhecido. */
  powerShortfallKw: number | null;
  /** Energia teórica máxima entregável por dia (kWh), sem considerar demanda. */
  maxDailyEnergyKwh: number;
  maxMonthlyEnergyKwh: number;
  /** Energia retirada da rede para entregar a energia teórica (kWh/dia), incluindo perdas e auxiliares quando informados. */
  gridDailyEnergyKwh: number;
  weightedEfficiency: number | null;
  capex: { equipment: number | null; installation: number | null; total: number | null; missing: string[] };
  limitations: string[];
};

export function validateChargers(lines: ChargerLine[]): string[] {
  const errs: string[] = [];
  lines.forEach((l, i) => {
    if (!Number.isFinite(l.powerKw) || l.powerKw <= 0 || l.powerKw > 1000) errs.push(`Linha ${i + 1}: potência inválida.`);
    if (!Number.isInteger(l.quantity) || l.quantity < 0 || l.quantity > 200) errs.push(`Linha ${i + 1}: quantidade inválida.`);
    if (l.efficiency !== null && (l.efficiency <= 0 || l.efficiency > 1)) errs.push(`Linha ${i + 1}: eficiência deve estar entre 0 e 1.`);
    if (l.current === "AC" && l.powerKw > 43) errs.push(`Linha ${i + 1}: potência AC acima de 43 kW é incomum — confirme o tipo.`);
  });
  return errs;
}

export function simulateInfrastructure(lines: ChargerLine[], site: SiteElectrical = DEFAULT_SITE): InfraResult {
  const active = lines.filter((l) => l.quantity > 0);
  const installedKw = active.reduce((s, l) => s + l.powerKw * l.quantity, 0);
  const chargerCount = active.reduce((s, l) => s + l.quantity, 0);
  const sf = Math.max(0, Math.min(1, site.simultaneityFactor));
  const simultaneousKw = installedKw * sf;
  const limitations: string[] = [];

  let usableKw = simultaneousKw;
  let shortfall: number | null = null;
  if (site.availableKw === null) {
    limitations.push("Potência disponível no local desconhecida: não é possível confirmar o atendimento simultâneo.");
  } else {
    shortfall = Math.max(0, simultaneousKw - site.availableKw);
    if (shortfall > 0) {
      if (site.dynamicLoadManagement) {
        usableKw = site.availableKw;
        limitations.push(`Gerenciamento dinâmico limita a potência total a ${fmt(site.availableKw)} kW (demanda simultânea estimada de ${fmt(simultaneousKw)} kW).`);
      } else {
        usableKw = site.availableKw;
        limitations.push(`Potência simultânea estimada (${fmt(simultaneousKw)} kW) excede a disponível (${fmt(site.availableKw)} kW) sem gerenciamento de carga: provável necessidade de adequação.`);
      }
    }
  }

  const hours = Math.max(0, Math.min(24, site.operatingHours));
  const avail = Math.max(0, Math.min(1, site.availability));
  // Energia máxima teórica: todos os carregadores a plena potência durante o funcionamento,
  // limitada pela potência disponível no local quando conhecida (o local não fornece mais que isso).
  const capKw = site.availableKw === null ? installedKw : Math.min(installedKw, site.availableKw);
  const maxDailyEnergyKwh = capKw * hours * avail;

  const effLines = active.filter((l) => l.efficiency !== null);
  const weightedEfficiency = effLines.length === active.length && installedKw > 0 ? active.reduce((s, l) => s + (l.efficiency as number) * l.powerKw * l.quantity, 0) / installedKw : null;
  if (weightedEfficiency === null && active.length) limitations.push("Eficiência dos equipamentos não informada para todas as linhas: perdas não incluídas na energia da rede.");
  const aux = site.auxiliaryKw ?? 0;
  if (site.auxiliaryKw === null) limitations.push("Consumo auxiliar não estimado.");
  const gridDailyEnergyKwh = maxDailyEnergyKwh / (weightedEfficiency ?? 1) + aux * 24;

  const missingCost: string[] = [];
  let eq = 0, inst = 0, eqKnown = true, instKnown = true;
  for (const l of active) {
    if (l.unitCost === null) { eqKnown = false; missingCost.push(`Custo de aquisição: ${l.label}`); } else eq += l.unitCost * l.quantity;
    if (l.installCost === null) { instKnown = false; missingCost.push(`Custo de instalação: ${l.label}`); } else inst += l.installCost * l.quantity;
  }

  return {
    installedKw, chargerCount, dcCount: active.filter((l) => l.current === "DC").reduce((s, l) => s + l.quantity, 0),
    simultaneousKw, usableKw, powerShortfallKw: shortfall,
    maxDailyEnergyKwh, maxMonthlyEnergyKwh: maxDailyEnergyKwh * 30.4, gridDailyEnergyKwh, weightedEfficiency,
    capex: { equipment: eqKnown ? eq : null, installation: instKnown ? inst : null, total: eqKnown && instKnown ? eq + inst : null, missing: missingCost },
    limitations,
  };
}

/**
 * Capacidade de atendimento em sessões/dia: limitada pela energia (kWh por sessão) e pelo tempo de ocupação
 * de cada ponto (sessão + tempo de troca entre veículos).
 */
export function sessionCapacity(lines: ChargerLine[], site: SiteElectrical, kwhPerSession: number, opts: { turnoverMin?: number; peakConcentration?: number } = {}) {
  if (!(kwhPerSession > 0)) return { sessionsPerDay: 0, byLine: [], note: "Energia por sessão deve ser positiva." };
  const infra = simulateInfrastructure(lines, site);
  const scale = infra.installedKw > 0 ? Math.min(1, infra.usableKw / Math.max(infra.simultaneousKw, 1e-9)) : 0;
  const turnover = (opts.turnoverMin ?? 10) / 60;
  const hours = Math.max(0, Math.min(24, site.operatingHours)) * Math.max(0, Math.min(1, site.availability));
  const byLine = lines.filter((l) => l.quantity > 0).map((l) => {
    const effKw = l.powerKw * scale;
    const sessionHours = kwhPerSession / Math.max(effKw, 1e-9) + turnover;
    const perCharger = Math.floor(hours / sessionHours);
    return { label: l.label, sessionHours, perCharger, total: perCharger * l.quantity };
  });
  const raw = byLine.reduce((s, b) => s + b.total, 0);
  // Concentração em horários de pico: parte da demanda não pode ser deslocada (premissa, 1 = sem restrição)
  const pc = opts.peakConcentration ?? 1;
  return { sessionsPerDay: Math.floor(raw * Math.max(0, Math.min(1, pc))), byLine, note: "Capacidade teórica; filas e concentração horária reduzem o atendimento real." };
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
