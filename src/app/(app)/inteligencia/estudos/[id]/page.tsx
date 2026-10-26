import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { DemoBanner, NatureBadge, ScoreGauge, Stat } from "@/components/intel/brand";
import { cn } from "@/lib/cn";
import { SCENARIO_KEYS, SCENARIO_LABELS } from "@/lib/intel/demand";
import { REVENUE_STATUS } from "@/lib/intel/finance";
import { LV_CLASSES } from "@/lib/intel/low-voltage";
import type { StudyChargers, StudyDemand, StudyElectrical, StudyFinance, StudySite } from "@/lib/intel/study-schema";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { AppError } from "@/server/errors";
import { getStudy, REVENUE_CATEGORIES } from "@/server/intel/studies";
import { addRevenueAction, removeRevenueAction, saveStudyMetaAction, saveStudySectionAction, shareStudyAction, snapshotAction } from "../../actions";
import { ChargersEditor, DemandEditor, FinanceEditor, MetaForm, RevenueForm, SiteElectricalEditor } from "./editors";

export const metadata = { title: "Estudo de viabilidade" };

const TABS = [["resumo", "Resumo"], ["infraestrutura", "Infraestrutura"], ["eletrica", "Elétrica e baixa tensão"], ["demanda", "Demanda"], ["financeiro", "Financeiro"], ["receitas", "Receitas complementares"], ["historico", "Histórico e compartilhamento"]] as const;
const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatCurrency(v));
const n = (v: number | null | undefined, d = 0) => (v === null || v === undefined ? "—" : formatNumber(v, d));

export default async function StudyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ aba?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const { id } = await params;
  const tab = (await searchParams).aba ?? "resumo";
  const s = await getStudy(ctx, id).catch((e) => { if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound(); throw e; });
  const sel = s.scenarios[s.selected];
  const ro = !s.canEdit;
  const act = (section: "chargers" | "site" | "electrical" | "demand" | "finance") => saveStudySectionAction.bind(null, id, section);
  return (
    <div className="space-y-5">
      {s.property.isDemo && <DemoBanner>Estudo sobre imóvel fictício.</DemoBanner>}
      <PageHeader title={s.study.name} breadcrumb={<><Link href="/inteligencia/analise" className="hover:text-brand">Análise de terreno</Link> / <Link href={`/inteligencia/imoveis/${s.property.id}`} className="hover:text-brand">{s.property.name}</Link></>}
        description={<span className="font-semibold text-brand">{s.nature}</span>}
        actions={<><LinkButton href={`/inteligencia/estudos/${id}/pdf`} variant="dark" prefetch={false} target="_blank">Relatório PDF</LinkButton>{!ro && <form action={snapshotAction.bind(null, id)}><button className="h-10 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium hover:bg-zinc-50">Registrar previsão</button></form>}</>} />
      {ro && <Alert kind="info">Somente leitura (estudo compartilhado ou seu papel não permite edição).</Alert>}
      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-200" aria-label="Seções do estudo">
        {TABS.map(([k, l]) => <Link key={k} href={`?aba=${k}`} aria-current={tab === k ? "page" : undefined} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", tab === k ? "border-brand text-ink" : "border-transparent text-zinc-500 hover:text-ink")}>{l}</Link>)}
      </nav>

      {tab === "resumo" && (
        <>
          {!ro && <Card><div className="p-4"><MetaForm action={saveStudyMetaAction.bind(null, id)} name={s.study.name} status={s.study.status} selected={s.study.selectedScenario} /></div></Card>}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={`Energia vendida/mês (${SCENARIO_LABELS[s.selected]})`} value={sel.forecast.energyPerMonthKwh === null ? "Sem dados" : `${n(sel.forecast.energyPerMonthKwh)} kWh`} hint={sel.forecast.capacityLimited ? "Limitada pela capacidade instalada" : "Demanda captável estimada"} />
            <Stat label="Receita bruta de recarga/mês" value={brl(sel.forecast.grossRevenueMonth)} hint="Faturamento — não é lucro" />
            <Stat label="Resultado operacional (ano 1)" value={brl(sel.finance?.firstYear.operatingResult)} tone="dark" hint="Antes de depreciação, juros e IR" />
            <Stat label="Prazo de retorno" value={sel.finance ? (sel.finance.paybackMonths === null ? "Não atingido" : `${n(sel.finance.paybackMonths, 1)} meses`) : "—"} tone="brand" hint={`Horizonte de ${(s.study.finance as StudyFinance).horizonMonths} meses`} />
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card><CardHeader title="Localização" /><div className="p-5"><ScoreGauge score={s.location.index.score} confidence={s.location.index.confidence} /><p className="mt-3 text-xs text-zinc-600">{s.location.index.justification}</p></div></Card>
            <Card><CardHeader title="Infraestrutura" /><div className="space-y-1 p-5 text-sm"><p><strong>{s.infra.chargerCount}</strong> carregador(es) · <strong>{n(s.infra.installedKw)} kW</strong> instalados</p><p>Simultânea estimada: {n(s.infra.simultaneousKw, 1)} kW</p><p>Baixa tensão: <Badge tone={LV_CLASSES[s.lv.classification].tone}>{LV_CLASSES[s.lv.classification].label}</Badge></p></div></Card>
            <Card><CardHeader title="Pendências" description={`${s.pendencies.length} item(ns)`} /><ul className="max-h-48 list-disc space-y-1 overflow-y-auto py-3 pl-9 pr-5 text-xs text-zinc-700">{s.pendencies.length ? s.pendencies.map((p) => <li key={p}>{p}</li>) : <li>Nenhuma</li>}</ul></Card>
          </div>
          <ScenarioTable s={s} />
          <Card>
            <CardHeader title="Avisos do modelo" />
            <ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm text-amber-900">{[...sel.forecast.warnings, ...(sel.finance?.warnings ?? [])].map((w) => <li key={w}>{w}</li>)}{!sel.forecast.warnings.length && !sel.finance?.warnings.length && <li className="text-zinc-600">Nenhum aviso.</li>}</ul>
          </Card>
        </>
      )}

      {tab === "infraestrutura" && (
        <>
          <Card><CardHeader title="Configuração de carregadores" description="Quantidade e potência por categoria. A melhor configuração é a que maximiza o resultado dentro das restrições — não necessariamente a mais potente." /><div className="p-5"><ChargersEditor action={act("chargers")} initial={s.study.chargers as StudyChargers} disabled={ro} /></div></Card>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Potência nominal instalada" value={`${n(s.infra.installedKw)} kW`} hint="Não é consumo nem demanda garantida" />
            <Stat label="Potência simultânea estimada" value={`${n(s.infra.simultaneousKw, 1)} kW`} hint="Instalada × fator de simultaneidade (premissa)" />
            <Stat label="Energia máxima teórica/dia" value={`${n(s.infra.maxDailyEnergyKwh)} kWh`} hint={`${n(s.infra.maxMonthlyEnergyKwh)} kWh/mês`} />
            <Stat label="Capacidade de atendimento" value={`${n(sel.forecast.capacitySessionsPerDay)} sessões/dia`} hint={`Com ${n(sel.assumptions.kwhPerSession)} kWh/sessão`} />
          </div>
          <Card><CardHeader title="Limitações" /><ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm">{s.infra.limitations.map((l) => <li key={l}>{l}</li>)}{s.infra.capex.missing.map((l) => <li key={l} className="text-amber-800">Não cotado — {l}</li>)}</ul>
            <p className="border-t border-zinc-100 px-5 py-3 text-sm">Investimento em equipamentos: <strong>{brl(s.infra.capex.equipment)}</strong> · instalação: <strong>{brl(s.infra.capex.installation)}</strong> · energia da rede p/ energia teórica: {n(s.infra.gridDailyEnergyKwh)} kWh/dia</p></Card>
          <p className="text-sm text-zinc-600">Para comparar alternativas lado a lado (ex.: 1×60 kW DC + 2×7 kW AC vs 2×60 kW DC), use o <Link href={`/inteligencia/simulador?estudo=${id}`} className="font-medium text-brand">Simulador / comparador de configurações</Link> com as premissas deste estudo.</p>
        </>
      )}

      {tab === "eletrica" && (
        <>
          <Card><CardHeader title="Local e dados elétricos" description="Não calcula viabilidade elétrica definitiva a partir de dados aproximados." /><div className="p-5"><SiteElectricalEditor siteAction={act("site")} elecAction={act("electrical")} site={s.study.site as StudySite} elec={s.study.electrical as StudyElectrical} disabled={ro} /></div></Card>
          <Card>
            <CardHeader title="Avaliação preliminar de baixa tensão" description={s.lv.disclaimer} />
            <div className="space-y-3 p-5 text-sm">
              <p><Badge tone={LV_CLASSES[s.lv.classification].tone}>{LV_CLASSES[s.lv.classification].label}</Badge>{s.lv.headroomKw !== null && <span className="ml-2 text-zinc-600">Folga estimada: {n(s.lv.headroomKw)} kW</span>}</p>
              <div className="grid gap-4 md:grid-cols-3">
                <div><p className="font-semibold">Motivos</p><ul className="list-disc pl-5">{s.lv.reasons.map((r) => <li key={r}>{r}</li>)}</ul></div>
                <div><p className="font-semibold">Informações ausentes</p><ul className="list-disc pl-5">{s.lv.missing.map((r) => <li key={r}>{r}</li>)}</ul></div>
                <div><p className="font-semibold">Próximos passos</p><ul className="list-disc pl-5">{s.lv.nextSteps.map((r) => <li key={r}>{r}</li>)}</ul></div>
              </div>
              <p className="text-xs text-zinc-500">O relatório PDF contém esta avaliação para revisão por engenheiro ou profissional legalmente habilitado.</p>
            </div>
          </Card>
        </>
      )}

      {tab === "demanda" && (
        <>
          <Card>
            <CardHeader title="Origem das entradas do modelo" description={`Modelo ${s.modelVersion} (regras e cenários).`} />
            <Table><thead><tr><Th>Entrada</Th><Th className="text-right">Valor</Th><Th>Natureza</Th><Th>Fonte</Th></tr></thead>
              <tbody className="divide-y divide-zinc-100">{([["Frota BEV", s.inputsOrigin.bevFleet], ["Frota PHEV", s.inputsOrigin.phevFleet], ["Concorrentes na área de influência", s.inputsOrigin.competitors], ["Demanda agregada externa (kWh/dia)", s.inputsOrigin.externalDailyKwh]] as const).map(([l, o]) => <tr key={l}><Td>{l}</Td><Td className="tabular text-right">{n(o.value)}</Td><Td><NatureBadge nature={o.nature} /></Td><Td className="text-sm">{o.source ?? "—"}</Td></tr>)}</tbody></Table>
          </Card>
          <Card>
            <CardHeader title={`Etapas da estimativa — cenário ${SCENARIO_LABELS[s.selected]}`} description="População e fluxo de veículos não são tratados como demanda direta." />
            <Table><thead><tr><Th>Etapa</Th><Th className="text-right">Valor</Th><Th>Cálculo</Th></tr></thead>
              <tbody className="divide-y divide-zinc-100">{sel.forecast.steps.map((st) => <tr key={st.key}><Td className="font-medium">{st.label}</Td><Td className="tabular text-right">{st.value === null ? "sem dados" : `${n(st.value, st.value < 100 ? 2 : 0)} ${st.unit}`}</Td><Td className="text-xs text-zinc-600">{st.formula}</Td></tr>)}</tbody></Table>
          </Card>
          <ScenarioTable s={s} />
          <Card>
            <CardHeader title="Principais variáveis que alteram o resultado" description="Variação da energia mensal atendida com cada premissa ±20% (demais constantes)." />
            {s.sensitivity.length === 0 ? <EmptyState title="Sem estimativa de demanda" /> : (
              <div className="space-y-2 p-5">{s.sensitivity.map((x) => { const max = Math.max(...s.sensitivity.map((y) => Math.max(Math.abs(y.low), Math.abs(y.high))), 1); return (
                <div key={x.key} className="grid grid-cols-[minmax(0,14rem)_1fr] items-center gap-3 text-sm"><span className="truncate">{x.label}</span>
                  <div className="relative h-5 rounded bg-zinc-100"><div className="absolute top-0 h-5 bg-zinc-400" style={{ right: "50%", width: `${(Math.abs(Math.min(x.low, x.high, 0)) / max) * 50}%` }} /><div className="absolute top-0 h-5 bg-brand" style={{ left: "50%", width: `${(Math.max(x.low, x.high, 0) / max) * 50}%` }} /><div className="absolute inset-y-0 left-1/2 w-px bg-ink" /></div></div>); })}
                <p className="text-xs text-zinc-500">Barras em kWh/mês. Cinza = redução; vermelho = aumento.</p></div>
            )}
          </Card>
          <Card>
            <CardHeader title="Calibração com dados reais" description="Validação temporal (treino nas datas antigas, teste nas recentes) contra linha de base simples. Métricas: MAE e WAPE da energia diária." />
            <div className="p-5 text-sm">{s.calibration.ok ? (
              <>
                <p>Treino {s.calibration.trainPeriod.join(" a ")} · Teste {s.calibration.testPeriod.join(" a ")}</p>
                <Table><thead><tr><Th>Modelo</Th><Th className="text-right">n</Th><Th className="text-right">MAE (kWh/dia)</Th><Th className="text-right">WAPE</Th></tr></thead><tbody className="divide-y divide-zinc-100">{s.calibration.models.map((m) => <tr key={m.name}><Td>{m.name}</Td><Td className="tabular text-right">{m.n}</Td><Td className="tabular text-right">{n(m.mae, 1)}</Td><Td className="tabular text-right">{m.wape === null ? "—" : `${n(m.wape * 100, 1)}%`}</Td></tr>)}</tbody></Table>
                <p className="mt-2">Menor erro: <strong>{s.calibration.better}</strong>. Machine learning só será adotado se superar estas referências com dados suficientes.</p>
              </>
            ) : <p className="text-zinc-600">{s.calibration.reason} Importe a operação diária do hub em Importação de dados → “Operação dos hubs próprios”.</p>}</div>
          </Card>
          <Card><CardHeader title="Premissas por cenário" description="Edite e salve para recalcular." /><div className="p-5"><DemandEditor action={act("demand")} initial={s.study.demand as StudyDemand} disabled={ro} /></div></Card>
          <p className="text-xs text-zinc-500">Distribuição horária não é exibida: não há dados que a sustentem. Intervalos de previsão só serão mostrados com metodologia calibrada.</p>
        </>
      )}

      {tab === "financeiro" && (
        <>
          <FinanceSummary s={s} />
          <Card><CardHeader title="Premissas financeiras" description="Sem tarifa nacional única: informe a tarifa da distribuidora local. Valores vazios = não informados." /><div className="p-5"><FinanceEditor action={act("finance")} initial={s.study.finance as StudyFinance} disabled={ro} /></div></Card>
          {sel.finance && <CashFlow f={sel.finance} />}
        </>
      )}

      {tab === "receitas" && (
        <Card>
          <CardHeader title="Receitas complementares" description="Receitas não confirmadas não são tratadas como garantidas. Receita de recarga e receita de energia não são somadas em duplicidade." />
          {s.revenues.length === 0 ? <EmptyState title="Nenhuma receita complementar" /> : (
            <Table><thead><tr><Th>Receita</Th><Th>Situação</Th><Th className="text-right">Bruta/mês</Th><Th className="text-right">Custos/mês</Th><Th className="text-right">Comissão</Th><Th className="text-right">Impostos</Th><Th className="text-right">Líquida/mês</Th><Th className="text-right">Investimento</Th><Th>Confiança</Th><Th /></tr></thead>
              <tbody className="divide-y divide-zinc-100">{s.revenues.map((r) => { const net = Number(r.grossMonthly) * (1 - r.commissionRate - r.taxRate) - Number(r.costsMonthly); const included = (s.study.finance as StudyFinance).includeStatuses.includes(r.status as never); return (
                <tr key={r.id}><Td><span className="font-medium">{r.name}</span><p className="text-xs text-zinc-500">{REVENUE_CATEGORIES[r.category as keyof typeof REVENUE_CATEGORIES]}{r.commercialModel ? ` · ${r.commercialModel}` : ""}</p></Td>
                  <Td><Badge tone={REVENUE_STATUS[r.status as keyof typeof REVENUE_STATUS].tone}>{REVENUE_STATUS[r.status as keyof typeof REVENUE_STATUS].label}</Badge>{!included && <p className="text-[11px] text-zinc-500">fora do resultado</p>}</Td>
                  <Td className="tabular text-right">{brl(Number(r.grossMonthly))}</Td><Td className="tabular text-right">{brl(Number(r.costsMonthly))}</Td><Td className="tabular text-right">{n(r.commissionRate * 100, 1)}%</Td><Td className="tabular text-right">{n(r.taxRate * 100, 1)}%</Td><Td className="tabular text-right">{brl(net)}</Td><Td className="tabular text-right">{brl(Number(r.initialInvestment))}</Td><Td>{r.confidence}</Td>
                  <Td>{!ro && <form action={removeRevenueAction.bind(null, id, r.id)}><button className="text-xs text-red-700 hover:underline">Remover</button></form>}</Td></tr>); })}</tbody></Table>
          )}
          {!ro && <div className="border-t border-zinc-100 p-5"><RevenueForm action={addRevenueAction.bind(null, id)} categories={REVENUE_CATEGORIES} /></div>}
        </Card>
      )}

      {tab === "historico" && (
        <>
          <Card>
            <CardHeader title="Previsões registradas" description="Cada registro guarda versão do modelo, parâmetros e resultado — reprodutível." />
            {s.history.length === 0 ? <EmptyState title="Nenhuma previsão registrada" description="Use “Registrar previsão” para guardar o estado atual." /> : (
              <Table><thead><tr><Th>Data</Th><Th>Cenário</Th><Th>Modelo</Th><Th className="text-right">Energia/mês</Th><Th className="text-right">Retorno</Th></tr></thead>
                <tbody className="divide-y divide-zinc-100">{s.history.map((h) => { const r = h.result as { forecast: { energyPerMonthKwh: number | null }; finance: { paybackMonths: number | null } | null }; return <tr key={h.id}><Td>{formatDateTime(h.createdAt)}</Td><Td>{SCENARIO_LABELS[h.scenario as keyof typeof SCENARIO_LABELS]}</Td><Td>{h.modelVersion}</Td><Td className="tabular text-right">{n(r.forecast.energyPerMonthKwh)} kWh</Td><Td className="tabular text-right">{r.finance ? (r.finance.paybackMonths === null ? "não atingido" : `${n(r.finance.paybackMonths, 1)} m`) : "—"}</Td></tr>; })}</tbody></Table>
            )}
          </Card>
          <Card>
            <CardHeader title="Compartilhamento autorizado" description="Organizações com acesso de leitura a este estudo." />
            <ul className="divide-y divide-zinc-100">{s.shares.map((sh) => <li key={sh.organizationId} className="flex justify-between px-5 py-2 text-sm">{sh.name}{!ro && <form action={shareStudyAction.bind(null, id)}><input type="hidden" name="org" value={sh.organizationId} /><input type="hidden" name="op" value="remover" /><button className="text-xs text-red-700">Revogar</button></form>}</li>)}{s.shares.length === 0 && <li className="px-5 py-3 text-sm text-zinc-500">Não compartilhado.</li>}</ul>
            {!ro && s.scope.memberships.length > 1 && (
              <form action={shareStudyAction.bind(null, id)} className="flex gap-2 border-t border-zinc-100 p-4">
                <select name="org" aria-label="Organização" className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm">{s.scope.memberships.filter((m) => m.organizationId !== s.study.organizationId).map((m) => <option key={m.organizationId} value={m.organizationId}>{m.name}</option>)}</select>
                <button className="h-9 rounded-md bg-ink px-3 text-sm text-white">Compartilhar</button>
              </form>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

type S = Awaited<ReturnType<typeof getStudy>>;

function ScenarioTable({ s }: { s: S }) {
  const rows: [string, (k: (typeof SCENARIO_KEYS)[number]) => string][] = [
    ["Demanda captável (sessões/dia)", (k) => n(s.scenarios[k].forecast.demandSessionsPerDay, 1)],
    ["Sessões atendidas/dia", (k) => n(s.scenarios[k].forecast.servedSessionsPerDay, 1)],
    ["Sessões/mês", (k) => n(s.scenarios[k].forecast.servedSessionsPerDay === null ? null : s.scenarios[k].forecast.servedSessionsPerDay! * 30.4)],
    ["Dia útil / fim de semana (sessões)", (k) => `${n(s.scenarios[k].forecast.weekdaySessions, 1)} / ${n(s.scenarios[k].forecast.weekendSessions, 1)}`],
    ["Energia vendida/dia (kWh)", (k) => n(s.scenarios[k].forecast.energyPerDayKwh)],
    ["Energia vendida/mês (kWh)", (k) => n(s.scenarios[k].forecast.energyPerMonthKwh)],
    ["Energia vendida/ano (kWh)", (k) => n(s.scenarios[k].forecast.energyPerYearKwh)],
    ["Preço médio (R$/kWh)", (k) => formatCurrency(s.scenarios[k].assumptions.pricePerKwh)],
    ["Receita bruta de recarga/mês", (k) => brl(s.scenarios[k].forecast.grossRevenueMonth)],
    ["Receita por carregador/mês", (k) => brl(s.scenarios[k].forecast.revenuePerChargerMonth)],
    ["Utilização estimada", (k) => (s.scenarios[k].forecast.utilization === null ? "—" : `${n(s.scenarios[k].forecast.utilization! * 100, 1)}%`)],
    ["Limitado pela capacidade?", (k) => (s.scenarios[k].forecast.capacityLimited ? "Sim" : "Não")],
  ];
  return (
    <Card>
      <CardHeader title="Comparação de cenários" description="Resultados de premissas explícitas (simulação). Origem e confiança indicadas acima." />
      <Table><thead><tr><Th>Indicador</Th>{SCENARIO_KEYS.map((k) => <Th key={k} className={cn("text-right", k === s.selected && "text-brand")}>{SCENARIO_LABELS[k]}</Th>)}</tr></thead>
        <tbody className="divide-y divide-zinc-100">{rows.map(([l, f]) => <tr key={l}><Td>{l}</Td>{SCENARIO_KEYS.map((k) => <Td key={k} className="tabular text-right">{f(k)}</Td>)}</tr>)}</tbody></Table>
    </Card>
  );
}

function FinanceSummary({ s }: { s: S }) {
  const rows: [string, (k: (typeof SCENARIO_KEYS)[number]) => string, string?][] = [
    ["Investimento inicial", (k) => brl(s.scenarios[k].finance?.initialInvestment)],
    ["Receita bruta de recarga (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.chargingGross)],
    ["Receitas complementares líquidas (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.complementaryNet)],
    ["Custos variáveis (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.variableCosts)],
    ["Margem de contribuição (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.contributionMargin)],
    ["Margem de contribuição por kWh", (k) => brl(s.scenarios[k].finance?.contributionMarginPerKwh)],
    ["Custos fixos (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.fixedCosts)],
    ["Resultado operacional (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.operatingResult), "font-semibold"],
    ["Lucro líquido (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.netIncome)],
    ["Fluxo de caixa (ano 1)", (k) => brl(s.scenarios[k].finance?.firstYear.cashFlow)],
    ["Ponto de equilíbrio", (k) => (s.scenarios[k].finance ? (s.scenarios[k].finance!.breakEvenKwhMonth === null ? "inexistente" : `${n(s.scenarios[k].finance!.breakEvenKwhMonth)} kWh/mês`) : "—")],
    ["Ponto de equilíbrio (sessões/dia)", (k) => (s.scenarios[k].finance?.breakEvenKwhDay == null ? "—" : n(s.scenarios[k].finance!.breakEvenKwhDay! / s.scenarios[k].assumptions.kwhPerSession, 1))],
    ["Prazo de retorno (payback)", (k) => (s.scenarios[k].finance ? (s.scenarios[k].finance!.paybackMonths === null ? "Não atingido" : `${n(s.scenarios[k].finance!.paybackMonths, 1)} meses`) : "—"), "font-semibold"],
    ["Payback descontado", (k) => (s.scenarios[k].finance?.discountedPaybackMonths == null ? "—" : `${n(s.scenarios[k].finance!.discountedPaybackMonths, 1)} meses`)],
    ["VPL", (k) => brl(s.scenarios[k].finance?.npv)],
    ["Retorno sobre capital próprio (horizonte)", (k) => (s.scenarios[k].finance?.roi == null ? "—" : `${n(s.scenarios[k].finance!.roi! * 100, 1)}%`)],
    ["Necessidade adicional de capital de giro", (k) => brl(s.scenarios[k].finance?.workingCapitalNeed)],
  ];
  return (
    <Card>
      <CardHeader title="Indicadores financeiros por cenário" description="Faturamento ≠ lucro. Resultado operacional ≠ lucro líquido ≠ fluxo de caixa." />
      <Table><thead><tr><Th>Indicador</Th>{SCENARIO_KEYS.map((k) => <Th key={k} className={cn("text-right", k === s.selected && "text-brand")}>{SCENARIO_LABELS[k]}</Th>)}</tr></thead>
        <tbody className="divide-y divide-zinc-100">{rows.map(([l, f, c]) => <tr key={l} className={c}><Td>{l}</Td>{SCENARIO_KEYS.map((k) => <Td key={k} className="tabular text-right">{f(k)}</Td>)}</tr>)}</tbody></Table>
    </Card>
  );
}

function CashFlow({ f }: { f: NonNullable<S["scenarios"]["base"]["finance"]> }) {
  const years = Array.from({ length: Math.ceil(f.monthly.length / 12) }, (_, y) => f.monthly.slice(y * 12, y * 12 + 12));
  const sum = (rows: typeof f.monthly, k: keyof (typeof f.monthly)[number]) => rows.reduce((s, r) => s + (r[k] as number), 0);
  const maxAbs = Math.max(...years.map((y) => Math.abs(y[y.length - 1].cumulativeCash)), 1);
  return (
    <Card>
      <CardHeader title="Fluxo de caixa anual (cenário principal)" description="Juros e amortização separados do investimento. Caixa acumulado inclui o aporte inicial." />
      <Table><thead><tr><Th>Ano</Th><Th className="text-right">Energia (kWh)</Th><Th className="text-right">Receita recarga</Th><Th className="text-right">Resultado operacional</Th><Th className="text-right">Juros</Th><Th className="text-right">Amortização</Th><Th className="text-right">IR</Th><Th className="text-right">Fluxo de caixa</Th><Th>Caixa acumulado</Th></tr></thead>
        <tbody className="divide-y divide-zinc-100">{years.map((y, i) => { const cum = y[y.length - 1].cumulativeCash; return (
          <tr key={i}><Td>{i + 1}</Td><Td className="tabular text-right">{n(sum(y, "energyKwh"))}</Td><Td className="tabular text-right">{brl(sum(y, "chargingGross"))}</Td><Td className="tabular text-right">{brl(sum(y, "operatingResult"))}</Td><Td className="tabular text-right">{brl(sum(y, "interest"))}</Td><Td className="tabular text-right">{brl(sum(y, "amortization"))}</Td><Td className="tabular text-right">{brl(sum(y, "incomeTax"))}</Td><Td className="tabular text-right">{brl(sum(y, "cashFlow"))}</Td>
            <Td><div className="flex items-center gap-2"><div className="h-2 w-28 rounded bg-zinc-100"><div className={cn("h-2 rounded", cum < 0 ? "bg-zinc-500" : "bg-brand")} style={{ width: `${(Math.abs(cum) / maxAbs) * 100}%` }} /></div><span className={cn("tabular text-xs", cum < 0 && "text-red-700")}>{brl(cum)}</span></div></Td></tr>); })}</tbody></Table>
    </Card>
  );
}
