/**
 * Avaliação PRELIMINAR de compatibilidade com baixa tensão (seção 6.4).
 * Nunca afirma aprovação pela distribuidora. O resultado é insumo para o parecer de profissional habilitado.
 */

export const LV_CLASSES = {
  potencialmente_compativel: { label: "Potencialmente compatível, sujeito a confirmação", tone: "success" },
  necessita_informacoes: { label: "Necessita informações adicionais", tone: "warning" },
  provavel_adequacao: { label: "Provável necessidade de adequação", tone: "warning" },
  risco_elevado: { label: "Risco técnico elevado", tone: "danger" },
  nao_avaliavel: { label: "Não avaliável com os dados atuais", tone: "neutral" },
} as const;
export type LvClass = keyof typeof LV_CLASSES;

export type LvInputs = {
  supplyVoltageV: number | null; // ex.: 127/220, 220/380
  phases: 1 | 2 | 3 | null;
  availableKw: number | null;
  existingLoadKw: number | null;
  projectedSimultaneousKw: number | null;
  distanceToSupplyM: number | null;
  hasTransformer: boolean | null;
  utilityStatement: "nenhuma" | "favoravel" | "com_restricoes" | "desfavoravel" | null;
  engineerOpinion: "nenhum" | "favoravel" | "com_ressalvas" | "desfavoravel" | null;
  dynamicLoadManagement: boolean;
};

/**
 * Limite de referência para atendimento em BT. É um parâmetro editável: cada distribuidora define
 * seus limites em norma técnica própria (ex.: faixa de 75 kW de carga instalada é comum, mas não universal).
 */
export const DEFAULT_LV_REFERENCE_KW = 75;

export type LvAssessment = {
  classification: LvClass;
  reasons: string[];
  missing: string[];
  nextSteps: string[];
  headroomKw: number | null;
  disclaimer: string;
};

export function assessLowVoltage(i: LvInputs, referenceKw = DEFAULT_LV_REFERENCE_KW): LvAssessment {
  const reasons: string[] = [];
  const missing: string[] = [];
  const next: string[] = [];
  if (i.supplyVoltageV === null) missing.push("Tensão de alimentação");
  if (i.phases === null) missing.push("Número de fases");
  if (i.availableKw === null) missing.push("Potência disponível (conta de energia / distribuidora)");
  if (i.existingLoadKw === null) missing.push("Carga já existente no imóvel");
  if (i.projectedSimultaneousKw === null) missing.push("Potência simultânea projetada (configure o simulador)");
  if (i.distanceToSupplyM === null) missing.push("Distância até o ponto de alimentação");
  if (i.utilityStatement === null || i.utilityStatement === "nenhuma") missing.push("Consulta/parecer de acesso da distribuidora");
  if (i.engineerOpinion === null || i.engineerOpinion === "nenhum") missing.push("Parecer de profissional habilitado");

  const disclaimer = "Avaliação preliminar automatizada. Não substitui projeto elétrico, ART/RRT nem a análise de acesso da distribuidora. A aprovação depende exclusivamente da distribuidora.";

  if (i.projectedSimultaneousKw === null && i.availableKw === null && i.phases === null) {
    return { classification: "nao_avaliavel", reasons: ["Sem dados elétricos mínimos (fases, potência disponível ou projeto)."], missing, nextSteps: ["Obter conta de energia, padrão de entrada e configurar os carregadores no simulador."], headroomKw: null, disclaimer };
  }

  let risk = 0;
  const headroom = i.availableKw !== null && i.projectedSimultaneousKw !== null ? i.availableKw - (i.existingLoadKw ?? 0) - i.projectedSimultaneousKw : null;

  if (i.engineerOpinion === "desfavoravel" || i.utilityStatement === "desfavoravel") {
    reasons.push("Parecer desfavorável registrado (profissional ou distribuidora).");
    risk += 3;
  }
  if (i.phases !== null && i.phases < 3 && (i.projectedSimultaneousKw ?? 0) > 22) {
    reasons.push("Alimentação monofásica/bifásica com carga projetada acima de 22 kW.");
    risk += 2;
  }
  if (i.projectedSimultaneousKw !== null && i.projectedSimultaneousKw > referenceKw) {
    reasons.push(`Carga simultânea projetada (${i.projectedSimultaneousKw} kW) acima da referência configurada para BT (${referenceKw} kW).`);
    risk += i.dynamicLoadManagement ? 1 : 2;
  }
  if (headroom !== null) {
    if (headroom < 0) {
      reasons.push(`Potência disponível insuficiente: faltam ${Math.abs(Math.round(headroom))} kW considerando a carga existente${i.existingLoadKw === null ? " (não informada, considerada desconhecida)" : ""}.`);
      risk += i.dynamicLoadManagement ? 1 : 2;
    } else reasons.push(`Folga estimada de ${Math.round(headroom)} kW sobre a potência disponível.`);
  }
  if (i.distanceToSupplyM !== null && i.distanceToSupplyM > 50) {
    reasons.push(`Distância de ${i.distanceToSupplyM} m até a alimentação: queda de tensão e custo de cabeamento relevantes.`);
    risk += 1;
  }
  if (i.utilityStatement === "com_restricoes" || i.engineerOpinion === "com_ressalvas") { reasons.push("Parecer com ressalvas registrado."); risk += 1; }
  if (i.hasTransformer === true) reasons.push("Imóvel informa transformador próprio (avaliar se o atendimento é em média tensão).");

  let classification: LvClass;
  if (risk >= 3) classification = "risco_elevado";
  else if (risk >= 2) classification = "provavel_adequacao";
  else if (missing.length > 3 || headroom === null) classification = "necessita_informacoes";
  else classification = "potencialmente_compativel";

  if (classification !== "potencialmente_compativel") next.push("Avaliar gerenciamento dinâmico de carga ou redução da configuração inicial.");
  if (missing.length) next.push("Completar as informações ausentes listadas.");
  next.push("Encaminhar este relatório para revisão por engenheiro eletricista habilitado.");
  next.push("Solicitar à distribuidora a análise de acesso/aumento de carga antes de qualquer compromisso de investimento.");

  return { classification, reasons, missing, nextSteps: next, headroomKw: headroom, disclaimer };
}
