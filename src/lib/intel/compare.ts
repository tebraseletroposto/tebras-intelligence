/**
 * Comparação e recomendação entre projetos (seção 8.6). A recomendação NÃO escolhe automaticamente o
 * maior faturamento: considera resultado, retorno, investimento, confiança e pendências técnicas.
 */

export type ProjectSummary = {
  id: string;
  name: string;
  potentialScore: number | null;
  confidence: "alta" | "media" | "baixa" | "insuficiente";
  initialInvestment: number | null;
  investmentComplete: boolean;
  monthlyRevenue: number | null;
  operatingResultYear1: number | null;
  paybackMonths: number | null;
  horizonMonths: number;
  lowVoltage: string | null;
  pendingTechnical: number;
};

export type Recommendation = { id: string; rank: number; verdict: "priorizar" | "avaliar" | "aguardar_dados" | "descartar_por_ora"; reasons: string[] };

export function recommend(projects: ProjectSummary[]): Recommendation[] {
  const scored = projects.map((p) => {
    const reasons: string[] = [];
    let verdict: Recommendation["verdict"];
    if (p.confidence === "insuficiente" || p.operatingResultYear1 === null || !p.investmentComplete) {
      verdict = "aguardar_dados";
      if (p.confidence === "insuficiente") reasons.push("Confiança insuficiente no potencial (poucos dados).");
      if (!p.investmentComplete) reasons.push("Investimento incompleto: há itens sem valor.");
      if (p.operatingResultYear1 === null) reasons.push("Resultado financeiro não calculado.");
    } else if (p.operatingResultYear1 < 0 && p.paybackMonths === null) {
      verdict = "descartar_por_ora";
      reasons.push("Resultado operacional negativo no ano 1 e retorno não atingido no horizonte.");
    } else if (p.paybackMonths !== null && p.paybackMonths <= p.horizonMonths * 0.6 && p.lowVoltage !== "risco_elevado" && p.pendingTechnical <= 2) {
      verdict = "priorizar";
      reasons.push(`Retorno estimado em ${Math.round(p.paybackMonths)} meses, dentro de 60% do horizonte.`);
    } else {
      verdict = "avaliar";
      if (p.paybackMonths === null) reasons.push("Retorno não atingido no horizonte.");
      else reasons.push(`Retorno estimado em ${Math.round(p.paybackMonths)} meses.`);
    }
    if (p.lowVoltage === "risco_elevado") reasons.push("Risco técnico elétrico elevado.");
    if (p.pendingTechnical > 0) reasons.push(`${p.pendingTechnical} pendência(s) técnica(s).`);
    if (p.confidence === "baixa") reasons.push("Confiança baixa: resultado sensível às premissas.");
    // Chave de ordenação: veredito, depois retorno por real investido, depois potencial
    const vOrder = { priorizar: 0, avaliar: 1, aguardar_dados: 2, descartar_por_ora: 3 }[verdict];
    const efficiency = p.operatingResultYear1 !== null && p.initialInvestment ? p.operatingResultYear1 / p.initialInvestment : -Infinity;
    return { p, verdict, reasons, vOrder, efficiency };
  });
  scored.sort((a, b) => a.vOrder - b.vOrder || b.efficiency - a.efficiency || (b.p.potentialScore ?? -1) - (a.p.potentialScore ?? -1));
  return scored.map((s, i) => ({ id: s.p.id, rank: i + 1, verdict: s.verdict, reasons: s.reasons }));
}

export const VERDICT_LABELS = {
  priorizar: { label: "Priorizar", tone: "success" },
  avaliar: { label: "Avaliar com cautela", tone: "warning" },
  aguardar_dados: { label: "Aguardar dados", tone: "neutral" },
  descartar_por_ora: { label: "Descartar por ora", tone: "danger" },
} as const;

/* ----------------------------- Parecer de viabilidade de um ponto ----------------------------- */

export const FEASIBILITY_LABELS = {
  viavel: { label: "Viável", tone: "success", description: "Atende aos critérios com os dados e premissas atuais" },
  viavel_ressalvas: { label: "Viável com ressalvas", tone: "warning", description: "Resultado positivo, mas há riscos ou critérios não atendidos" },
  nao_viavel: { label: "Não viável", tone: "danger", description: "Com as premissas atuais o ponto não se paga" },
  inconclusivo: { label: "Inconclusivo — faltam dados", tone: "neutral", description: "Não há informação suficiente para concluir" },
} as const;
export type Feasibility = keyof typeof FEASIBILITY_LABELS;

export type FeasibilityInput = {
  located: boolean;
  potentialScore: number | null;
  confidence: "alta" | "media" | "baixa" | "insuficiente";
  demandEstimated: boolean;
  financeComplete: boolean;
  /** Resultado operacional do ano 1 por cenário (null = não calculado). */
  operatingYear1: { conservador: number | null; base: number | null; otimista: number | null };
  paybackMonths: { conservador: number | null; base: number | null; otimista: number | null };
  horizonMonths: number;
  lowVoltage: string | null;
  competitorsWithin1km: number | null;
};

export type Criterion = { label: string; status: "ok" | "falha" | "sem_dados"; detail: string };

/**
 * Parecer em linguagem direta sobre um ponto. Regras explícitas (não é caixa-preta):
 *  - Inconclusivo: sem coordenadas, sem demanda estimável ou sem custos essenciais.
 *  - Não viável: cenário base não recupera o investimento no horizonte e o ano 1 é negativo.
 *  - Viável: cenário base com retorno ≤ 60% do horizonte, conservador com resultado ≥ 0 no ano 1,
 *    sem risco elétrico elevado e confiança ao menos média.
 *  - Demais casos: viável com ressalvas.
 * É um parecer PRELIMINAR baseado em premissas; não substitui validação técnica e comercial.
 */
export function assessFeasibility(i: FeasibilityInput): { verdict: Feasibility; criteria: Criterion[]; summary: string } {
  const pb = i.paybackMonths.base;
  const limit = Math.round(i.horizonMonths * 0.6);
  const criteria: Criterion[] = [
    { label: "Localização definida", status: i.located ? "ok" : "falha", detail: i.located ? "Coordenadas cadastradas" : "Informe latitude/longitude para analisar o entorno" },
    { label: "Potencial da região", status: i.potentialScore === null ? "sem_dados" : i.potentialScore >= 50 ? "ok" : "falha", detail: i.potentialScore === null ? "Índice não calculável" : `Índice ${i.potentialScore}/100 (referência ≥ 50)` },
    { label: "Confiança dos dados", status: i.confidence === "alta" || i.confidence === "media" ? "ok" : i.confidence === "baixa" ? "falha" : "sem_dados", detail: `Confiança ${i.confidence}` },
    { label: "Demanda estimada", status: i.demandEstimated ? "ok" : "sem_dados", detail: i.demandEstimated ? "Frota/demanda importada ou premissa informada" : "Importe a frota (SENATRAN) ou informe a frota no estudo" },
    { label: "Custos essenciais informados", status: i.financeComplete ? "ok" : "sem_dados", detail: i.financeComplete ? "Investimento, tarifa e tributos informados" : "Faltam cotações, tarifa de energia ou tributos" },
    { label: "Resultado do 1º ano (cenário base)", status: i.operatingYear1.base === null ? "sem_dados" : i.operatingYear1.base >= 0 ? "ok" : "falha", detail: i.operatingYear1.base === null ? "Não calculado" : i.operatingYear1.base >= 0 ? "Positivo" : "Negativo" },
    { label: "Retorno do investimento (base)", status: pb === null ? (i.operatingYear1.base === null ? "sem_dados" : "falha") : pb <= limit ? "ok" : "falha", detail: pb === null ? "Não atingido no horizonte" : `${Math.round(pb)} meses (referência ≤ ${limit})` },
    { label: "Resiste ao cenário conservador", status: i.operatingYear1.conservador === null ? "sem_dados" : i.operatingYear1.conservador >= 0 ? "ok" : "falha", detail: i.operatingYear1.conservador === null ? "Não calculado" : i.operatingYear1.conservador >= 0 ? "Resultado positivo mesmo no conservador" : "Prejuízo no cenário conservador" },
    { label: "Elétrica (baixa tensão)", status: i.lowVoltage === "risco_elevado" ? "falha" : i.lowVoltage === "potencialmente_compativel" ? "ok" : "sem_dados", detail: i.lowVoltage === "risco_elevado" ? "Risco técnico elevado" : i.lowVoltage === "potencialmente_compativel" ? "Potencialmente compatível (confirmar)" : "Dados elétricos incompletos" },
    { label: "Concorrência imediata (1 km)", status: i.competitorsWithin1km === null ? "sem_dados" : i.competitorsWithin1km <= 2 ? "ok" : "falha", detail: i.competitorsWithin1km === null ? "Base de carregadores sem cobertura" : `${i.competitorsWithin1km} carregador(es) conhecido(s) em 1 km` },
  ];
  let verdict: Feasibility;
  if (!i.located || !i.demandEstimated || !i.financeComplete || i.operatingYear1.base === null || i.confidence === "insuficiente") verdict = "inconclusivo";
  else if ((pb === null || pb > i.horizonMonths) && i.operatingYear1.base < 0) verdict = "nao_viavel";
  else if (pb !== null && pb <= limit && (i.operatingYear1.conservador ?? -1) >= 0 && i.lowVoltage !== "risco_elevado" && i.confidence !== "baixa") verdict = "viavel";
  else verdict = pb === null ? "nao_viavel" : "viavel_ressalvas";
  const fails = criteria.filter((c) => c.status === "falha").map((c) => c.label.toLowerCase());
  const missing = criteria.filter((c) => c.status === "sem_dados").map((c) => c.label.toLowerCase());
  const summary = {
    viavel: "Com os dados e premissas atuais, o ponto se paga dentro do prazo de referência e resiste ao cenário conservador.",
    viavel_ressalvas: `O ponto tende a se pagar, mas atenção a: ${fails.join(", ") || "critérios sem dados"}.`,
    nao_viavel: "Com as premissas atuais o investimento não é recuperado no horizonte analisado. Reavalie preço, configuração de carregadores ou custo de ocupação.",
    inconclusivo: `Ainda não é possível concluir. Complete: ${missing.join(", ") || "dados do estudo"}.`,
  }[verdict];
  return { verdict, criteria, summary };
}
