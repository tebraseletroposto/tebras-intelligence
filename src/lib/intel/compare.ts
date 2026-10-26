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
