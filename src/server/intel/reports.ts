import "server-only";
import ExcelJS from "exceljs";
import { intelReports } from "@/db/schema";
import { getDb } from "@/db/client";
import { recommend, VERDICT_LABELS, type ProjectSummary } from "@/lib/intel/compare";
import { SCENARIO_KEYS, SCENARIO_LABELS } from "@/lib/intel/demand";
import { bearingDegrees } from "@/lib/intel/geo";
import { LV_CLASSES } from "@/lib/intel/low-voltage";
import { STATION_STATUS } from "@/lib/intel/competition";
import { formatCurrency, formatDate, formatNumber } from "@/lib/format";
import { logEvent } from "../audit";
import type { AuthContext } from "../authz";
import { createBrandedDoc, GREY, INK, RED } from "../pdf/base";
import { getCompanySettings } from "../services/settings";
import { getStudy, rankingData } from "./studies";

const brl = (v: number | null | undefined) => (v === null || v === undefined ? "não calculado" : formatCurrency(v));
const num = (v: number | null | undefined, d = 0, unit = "") => (v === null || v === undefined ? "sem dados" : `${formatNumber(v, d)}${unit ? ` ${unit}` : ""}`);
const months = (v: number | null) => (v === null ? "Não atingido no horizonte" : `${formatNumber(v, 1)} meses`);

/** Relatório de viabilidade de um estudo (seção 8.7). */
export async function renderStudyPdf(ctx: AuthContext, studyId: string) {
  const s = await getStudy(ctx, studyId);
  const company = await getCompanySettings();
  const demo = s.property.isDemo;
  const { doc, section, paragraph, table, finish, contentW } = createBrandedDoc({
    title: `Estudo de viabilidade — ${s.study.name}`, company, footerLabel: "Tebras Intelligence · Estudo preliminar", generatedBy: ctx.name,
    watermark: demo ? "DEMONSTRAÇÃO" : "PRELIMINAR",
  });
  const p = s.property;
  doc.font("Helvetica-Bold").fontSize(18).fillColor(INK).text("Estudo de viabilidade — Tebras Smart Hub");
  doc.font("Helvetica").fontSize(11).fillColor(GREY).text(`${s.study.name} · ${p.name}`);
  doc.moveDown(0.3).font("Helvetica-Bold").fontSize(9).fillColor(RED).text(`NATUREZA DO DOCUMENTO: ${s.nature.toUpperCase()}`);
  doc.font("Helvetica").fontSize(8.5).fillColor(GREY).text(`Data da análise: ${formatDate(new Date())} · Modelo de demanda ${s.modelVersion} · Índice ${s.location.indexVersion}. Distâncias em linha reta. Resultados dependem das premissas listadas e não constituem garantia de faturamento.`, { width: contentW });

  section("Dados do imóvel");
  table([{ w: 0.3, t: "Campo", a: "left" }, { w: 0.7, t: "Valor", a: "left" }], [
    ["Endereço", [p.address, p.district, p.city && `${p.city}/${p.uf ?? ""}`, p.zip].filter(Boolean).join(", ") || "não informado"],
    ["Coordenadas", p.lat !== null ? `${p.lat.toFixed(6)}, ${p.lng!.toFixed(6)}` : "não informadas"],
    ["Área", num(p.areaM2, 0, "m²")], ["Aluguel mensal", p.monthlyRent === null ? "não informado" : formatCurrency(Number(p.monthlyRent))],
    ["Estacionamento / acesso pela rua", `${p.parking === null ? "?" : p.parking ? "Sim" : "Não"} / ${p.streetAccess === null ? "?" : p.streetAccess ? "Sim" : "Não"}`],
  ]);

  section("Localização e concorrentes conhecidos (croqui, sem escala cartográfica)");
  if (p.lat !== null && p.lng !== null && s.location.competition) {
    const cx = 50 + contentW / 2, cy = doc.y + 110, R = 100;
    if (doc.y + 230 > doc.page.height - 80) doc.addPage();
    const y0 = doc.y;
    const cyy = y0 + 110;
    for (const [km, frac] of [[1, 0.2], [3, 0.6], [5, 1]] as const) {
      doc.circle(cx, cyy, R * frac).lineWidth(0.6).dash(3, { space: 3 }).strokeColor("#A1A1AA").stroke().undash();
      doc.font("Helvetica").fontSize(7).fillColor(GREY).text(`${km} km`, cx + R * frac * 0.72, cyy - R * frac * 0.72);
    }
    for (const st of s.location.stations.filter((x) => (x.distanceM ?? 0) <= 5000)) {
      const b = (bearingDegrees({ lat: p.lat, lng: p.lng }, st) * Math.PI) / 180;
      const d = st.distanceM ?? 0;
      const rr = d <= 1000 ? (d / 1000) * R * 0.2 : d <= 3000 ? R * (0.2 + ((d - 1000) / 2000) * 0.4) : R * (0.6 + ((d - 3000) / 2000) * 0.4);
      doc.circle(cx + rr * Math.sin(b), cyy - rr * Math.cos(b), 3).fill(st.status === "confirmado" ? INK : "#71717A");
    }
    doc.save().polygon([cx, cyy - 9], [cx - 6, cyy + 2], [cx - 1, cyy + 2], [cx - 4, cyy + 10], [cx + 6, cyy - 2], [cx + 1, cyy - 2]).fill(RED).restore();
    doc.font("Helvetica").fontSize(7.5).fillColor(GREY).text("N ↑   ● carregador confirmado   ● não verificado   ⚡ terreno", 50, y0 + 225, { width: contentW, align: "center" });
    void cy;
    doc.y = y0 + 240;
    table([{ w: 0.12, t: "Raio", a: "left" }, { w: 0.16, t: "Carregadores", a: "right" }, { w: 0.2, t: "Potência conhecida", a: "right" }, { w: 0.18, t: "Confirmados", a: "right" }, { w: 0.34, t: "Operadores", a: "left" }],
      s.location.competition.radii.map((r) => [`${r.radiusKm} km`, String(r.count), r.knownPowerKw === null ? "sem dados" : `${formatNumber(r.knownPowerKw, 0)} kW`, String(r.confirmed), r.operators.slice(0, 3).map((o) => `${o.name} (${o.count})`).join(", ") || "—"]));
    for (const g of s.location.competition.dataGaps) paragraph(`• ${g}`);
  } else paragraph("Imóvel sem coordenadas: concorrência não analisada.");

  section("Indicadores de potencial e fontes");
  table([{ w: 0.32, t: "Indicador", a: "left" }, { w: 0.18, t: "Valor", a: "right" }, { w: 0.15, t: "Natureza", a: "left" }, { w: 0.35, t: "Fonte / referência", a: "left" }],
    [...Object.values(s.location.indicators).slice(0, 3), s.location.density].map((i) => [i.label, i.value === null ? "sem dados" : `${formatNumber(i.value, 0)} ${i.unit}`, i.nature, i.source ? `${i.source} (${i.referenceDate ?? "s/ data"})` : "—"]));
  const idx = s.location.index;
  paragraph(`Índice de Potencial Tebras: ${idx.score === null ? "não calculável" : `${idx.score}/100`} · cobertura dos dados ${Math.round(idx.coverage * 100)}% · confiança ${idx.confidence}. ${idx.justification}`);
  if (idx.positives.length) paragraph(`Fatores positivos: ${idx.positives.join("; ")}.`);
  if (idx.risks.length) paragraph(`Riscos: ${idx.risks.join("; ")}.`);

  section("Configuração de infraestrutura");
  table([{ w: 0.4, t: "Equipamento", a: "left" }, { w: 0.15, t: "Qtd.", a: "right" }, { w: 0.2, t: "Potência", a: "right" }, { w: 0.25, t: "Custo unit. + instalação", a: "right" }],
    (s.study.chargers as { label: string; quantity: number; powerKw: number; unitCost: number | null; installCost: number | null }[]).map((c) => [c.label, String(c.quantity), `${c.powerKw} kW`, c.unitCost === null || c.installCost === null ? "não cotado" : formatCurrency(c.unitCost + c.installCost)]));
  paragraph(`Potência instalada ${formatNumber(s.infra.installedKw, 0)} kW; simultânea estimada ${formatNumber(s.infra.simultaneousKw, 1)} kW (fator de simultaneidade é premissa). Potência nominal não equivale a consumo nem a demanda garantida.`);
  for (const l of s.infra.limitations) paragraph(`• ${l}`);
  paragraph(`Avaliação preliminar de baixa tensão: ${LV_CLASSES[s.lv.classification].label}. ${s.lv.disclaimer}`);

  section("Premissas de demanda e cenários");
  const sc = SCENARIO_KEYS.map((k) => s.scenarios[k]);
  table([{ w: 0.34, t: "Indicador", a: "left" }, ...SCENARIO_KEYS.map((k) => ({ w: 0.22, t: SCENARIO_LABELS[k], a: "right" as const }))], [
    ["Sessões/dia atendidas", ...sc.map((x) => num(x.forecast.servedSessionsPerDay, 1))],
    ["Energia vendida/mês", ...sc.map((x) => num(x.forecast.energyPerMonthKwh, 0, "kWh"))],
    ["Preço (premissa)", ...sc.map((x) => `${formatCurrency(x.assumptions.pricePerKwh)}/kWh`)],
    ["Receita bruta de recarga/mês", ...sc.map((x) => brl(x.forecast.grossRevenueMonth))],
    ["Utilização estimada", ...sc.map((x) => (x.forecast.utilization === null ? "—" : `${formatNumber(x.forecast.utilization * 100, 1)}%`))],
  ]);
  paragraph(`Origem dos dados: frota BEV — ${s.inputsOrigin.bevFleet.nature}${s.inputsOrigin.bevFleet.source ? ` (${s.inputsOrigin.bevFleet.source})` : ""}; concorrência — ${s.inputsOrigin.competitors.nature}; demanda agregada externa — ${s.inputsOrigin.externalDailyKwh.nature}. Demais parâmetros são PREMISSAS editáveis.`);

  section("Investimento, custos, receitas e resultado");
  table([{ w: 0.34, t: "Indicador", a: "left" }, ...SCENARIO_KEYS.map((k) => ({ w: 0.22, t: SCENARIO_LABELS[k], a: "right" as const }))], [
    ["Investimento inicial", ...sc.map((x) => brl(x.finance?.initialInvestment))],
    ["Receita bruta (ano 1)", ...sc.map((x) => brl(x.finance?.firstYear.chargingGross))],
    ["Receitas complementares líquidas (ano 1)", ...sc.map((x) => brl(x.finance?.firstYear.complementaryNet))],
    ["Custos variáveis (ano 1)", ...sc.map((x) => brl(x.finance?.firstYear.variableCosts))],
    ["Custos fixos (ano 1)", ...sc.map((x) => brl(x.finance?.firstYear.fixedCosts))],
    ["Resultado operacional (ano 1)", ...sc.map((x) => brl(x.finance?.firstYear.operatingResult))],
    ["Lucro líquido (ano 1)", ...sc.map((x) => brl(x.finance?.firstYear.netIncome))],
    ["Ponto de equilíbrio", ...sc.map((x) => (x.finance?.breakEvenKwhMonth == null ? "inexistente" : `${formatNumber(x.finance.breakEvenKwhMonth, 0)} kWh/mês`))],
    ["Prazo de retorno", ...sc.map((x) => (x.finance ? months(x.finance.paybackMonths) : "não calculado"))],
  ]);
  if (s.revenues.length) paragraph(`Receitas complementares cadastradas: ${s.revenues.map((r) => `${r.name} (${r.status})`).join(", ")}. Somente as situações selecionadas no estudo entram no resultado.`);

  section("Riscos, dados ausentes e limitações");
  const sel = s.scenarios[s.selected];
  for (const w of [...(sel.finance?.warnings ?? []), ...sel.forecast.warnings, ...s.pendencies]) paragraph(`• ${w}`);
  paragraph("• O modelo de demanda é baseado em regras e premissas (não calibrado com operação real) até que haja dados de hubs próprios suficientes.");
  paragraph("• Carregadores conhecidos dependem da cobertura das bases importadas; ausência na base não comprova ausência de concorrentes.");

  section("Recomendações");
  for (const st of s.lv.nextSteps) paragraph(`• ${st}`);
  paragraph("• Validar preço praticado, tarifa da distribuidora e tributos antes de decisão de investimento.");

  await getDb().insert(intelReports).values({ organizationId: s.study.organizationId, studyId, kind: "estudo", format: "pdf", nature: s.nature, createdBy: ctx.userId });
  await logEvent({ userId: ctx.userId, action: "export.pdf", entityType: "intel_studies", entityId: studyId, summary: `Estudo ${s.study.name}`, ip: ctx.ip, userAgent: ctx.userAgent });
  return finish();
}

/* ------------------------------- Ranking ------------------------------- */

export async function rankingTable(ctx: AuthContext, org?: string | null) {
  const { rows } = await rankingData(ctx, { org });
  const summaries: ProjectSummary[] = rows.map((r) => ({
    id: r.study.id, name: r.property.name, potentialScore: r.index.score, confidence: r.index.confidence,
    initialInvestment: r.scenario.finance?.initialInvestment ?? null, investmentComplete: !!r.scenario.finance && r.scenario.finance.capexMissing.length === 0,
    monthlyRevenue: r.scenario.forecast.grossRevenueMonth, operatingResultYear1: r.scenario.finance?.firstYear.operatingResult ?? null,
    paybackMonths: r.scenario.finance?.paybackMonths ?? null, horizonMonths: r.scenario.finance?.monthly.length ?? 120,
    lowVoltage: r.lv.classification, pendingTechnical: r.lv.missing.length,
  }));
  const rec = recommend(summaries);
  return rec.map((x) => {
    const r = rows.find((y) => y.study.id === x.id)!;
    const near = r.competition?.nearest[0];
    return {
      rank: x.rank, verdict: VERDICT_LABELS[x.verdict].label, reasons: x.reasons.join(" "), studyId: r.study.id, study: r.study.name, property: r.property.name,
      address: [r.property.address, r.property.city, r.property.uf].filter(Boolean).join(", "), lat: r.property.lat, lng: r.property.lng, areaM2: r.property.areaM2,
      rent: r.property.monthlyRent === null ? null : Number(r.property.monthlyRent), nearestCompetitorM: near?.distanceM ?? null,
      competitors3km: r.competition?.radii.find((z) => z.radiusKm === 3)?.count ?? null, index: r.index.score, confidence: r.index.confidence,
      investment: r.scenario.finance?.initialInvestment ?? null, revenueMonth: r.scenario.forecast.grossRevenueMonth,
      operatingYear1: r.scenario.finance?.firstYear.operatingResult ?? null, margin: r.scenario.finance && r.scenario.finance.firstYear.chargingGross > 0 ? r.scenario.finance.firstYear.operatingResult / r.scenario.finance.firstYear.chargingGross : null,
      payback: r.scenario.finance?.paybackMonths ?? null, installedKw: r.infra.installedKw, chargers: r.infra.chargerCount, energyMonth: r.scenario.forecast.energyPerMonthKwh,
      lv: LV_CLASSES[r.lv.classification].label, pendencies: r.pendencies.length, scenario: SCENARIO_LABELS[r.selected], nature: r.nature, demo: r.property.isDemo,
    };
  });
}

const RANK_COLS: [string, (r: Awaited<ReturnType<typeof rankingTable>>[number]) => string | number | null][] = [
  ["Posição", (r) => r.rank], ["Recomendação", (r) => r.verdict], ["Imóvel", (r) => r.property], ["Estudo", (r) => r.study], ["Endereço", (r) => r.address],
  ["Latitude", (r) => r.lat], ["Longitude", (r) => r.lng], ["Área (m²)", (r) => r.areaM2], ["Aluguel (R$)", (r) => r.rent], ["Concorrente mais próximo (m)", (r) => (r.nearestCompetitorM === null ? null : Math.round(r.nearestCompetitorM))],
  ["Carregadores em 3 km", (r) => r.competitors3km], ["Índice de potencial", (r) => r.index], ["Confiança", (r) => r.confidence], ["Investimento (R$)", (r) => r.investment],
  ["Receita de recarga/mês (R$)", (r) => r.revenueMonth], ["Resultado operacional ano 1 (R$)", (r) => r.operatingYear1], ["Margem operacional", (r) => r.margin], ["Retorno (meses)", (r) => r.payback],
  ["Baixa tensão", (r) => r.lv], ["Pendências", (r) => r.pendencies], ["Cenário", (r) => r.scenario], ["Natureza", (r) => r.nature], ["Motivos", (r) => r.reasons],
];

export async function rankingCsv(ctx: AuthContext, org?: string | null) {
  const rows = await rankingTable(ctx, org);
  const esc = (v: string | number | null) => (v === null ? "" : typeof v === "number" ? String(v).replace(".", ",") : `"${v.replace(/"/g, '""')}"`);
  await logEvent({ userId: ctx.userId, action: "export.csv", entityType: "intel_ranking", summary: `${rows.length} estudos`, ip: ctx.ip, userAgent: ctx.userAgent });
  return "﻿" + [RANK_COLS.map(([h]) => h).join(";"), ...rows.map((r) => RANK_COLS.map(([, f]) => esc(f(r))).join(";"))].join("\n");
}

export async function renderRankingXlsx(ctx: AuthContext, org?: string | null) {
  const rows = await rankingTable(ctx, org);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tebras Intelligence";
  const ws = wb.addWorksheet("Ranking");
  ws.addRow(RANK_COLS.map(([h]) => h)).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0C0B0E" } };
  for (const r of rows) ws.addRow(RANK_COLS.map(([, f]) => f(r)));
  ws.columns.forEach((c) => { c.width = 18; });
  const notes = wb.addWorksheet("Notas");
  ["Estudos preliminares baseados em premissas editáveis e dados importados, quando houver.", "Valores vazios = não calculados/sem dados (nunca zero).", "Distâncias em linha reta.", `Gerado em ${formatDate(new Date())} por ${ctx.name}.`].forEach((t) => notes.addRow([t]));
  await logEvent({ userId: ctx.userId, action: "export.xlsx", entityType: "intel_ranking", summary: `${rows.length} estudos`, ip: ctx.ip, userAgent: ctx.userAgent });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function renderRankingPdf(ctx: AuthContext, org?: string | null) {
  const rows = await rankingTable(ctx, org);
  const company = await getCompanySettings();
  const { doc, table, paragraph, finish } = createBrandedDoc({ title: "Ranking de terrenos", company, footerLabel: "Tebras Intelligence · Ranking preliminar", generatedBy: ctx.name, landscape: true, watermark: rows.some((r) => r.demo) ? "CONTÉM DEMONSTRAÇÃO" : "PRELIMINAR" });
  doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text("Ranking de terrenos — Tebras Smart Hub");
  paragraph("Ordenação: recomendação (considera resultado, retorno, investimento, confiança e pendências), depois resultado operacional por real investido e índice de potencial. Não seleciona automaticamente o maior faturamento.");
  table([{ w: 0.05, t: "#", a: "left" }, { w: 0.13, t: "Recomendação", a: "left" }, { w: 0.2, t: "Imóvel", a: "left" }, { w: 0.07, t: "Índice", a: "right" }, { w: 0.08, t: "Confiança", a: "left" }, { w: 0.12, t: "Investimento", a: "right" }, { w: 0.12, t: "Resultado ano 1", a: "right" }, { w: 0.1, t: "Retorno", a: "right" }, { w: 0.13, t: "Baixa tensão", a: "left" }],
    rows.map((r) => [String(r.rank), r.verdict, r.property, r.index === null ? "—" : String(r.index), r.confidence, brl(r.investment), brl(r.operatingYear1), r.payback === null ? "não atingido" : `${formatNumber(r.payback, 0)} m`, r.lv]));
  await logEvent({ userId: ctx.userId, action: "export.pdf", entityType: "intel_ranking", summary: `${rows.length} estudos`, ip: ctx.ip, userAgent: ctx.userAgent });
  return finish();
}

export { STATION_STATUS };
