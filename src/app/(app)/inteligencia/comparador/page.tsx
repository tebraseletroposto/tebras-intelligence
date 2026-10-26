import Link from "next/link";
import { Alert, Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { recommend, VERDICT_LABELS } from "@/lib/intel/compare";
import { LV_CLASSES } from "@/lib/intel/low-voltage";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { rankingData } from "@/server/intel/studies";

export const metadata = { title: "Comparador de projetos" };
const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatCurrency(v));

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const raw = (await searchParams).ids;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 6);
  const all = await rankingData(ctx);
  const chosen = ids.length ? all.rows.filter((r) => ids.includes(r.study.id)) : [];
  const rec = recommend(chosen.map((r) => ({
    id: r.study.id, name: r.property.name, potentialScore: r.index.score, confidence: r.index.confidence, initialInvestment: r.scenario.finance?.initialInvestment ?? null,
    investmentComplete: !!r.scenario.finance && r.scenario.finance.capexMissing.length === 0, monthlyRevenue: r.scenario.forecast.grossRevenueMonth,
    operatingResultYear1: r.scenario.finance?.firstYear.operatingResult ?? null, paybackMonths: r.scenario.finance?.paybackMonths ?? null, horizonMonths: r.scenario.finance?.monthly.length ?? 120,
    lowVoltage: r.lv.classification, pendingTechnical: r.lv.missing.length,
  })));
  const ordered = rec.map((x) => ({ rec: x, r: chosen.find((c) => c.study.id === x.id)! }));
  const line = (label: string, f: (r: (typeof chosen)[number]) => React.ReactNode) => <tr><Td className="font-medium">{label}</Td>{ordered.map(({ r }) => <Td key={r.study.id} className="tabular text-right">{f(r)}</Td>)}</tr>;
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Comparador de projetos</h1><p className="text-sm text-zinc-600">Selecione pelo menos três estudos. A recomendação explica cada classificação e não escolhe automaticamente o maior faturamento.</p></div>
      <Card>
        <form method="get" className="p-4">
          {all.rows.length === 0 ? <EmptyState title="Nenhum estudo disponível" /> : <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{all.rows.map((r) => <label key={r.study.id} className="flex items-start gap-2 rounded-md border border-zinc-200 p-2 text-sm"><input type="checkbox" name="ids" value={r.study.id} defaultChecked={ids.includes(r.study.id)} className="mt-1 accent-brand" /><span><strong>{r.property.name}</strong><span className="block text-xs text-zinc-500">{r.study.name}{r.property.isDemo && " · DEMONSTRAÇÃO"}</span></span></label>)}</div>}
          <button className="mt-3 h-9 rounded-md bg-ink px-4 text-sm text-white">Comparar</button>
        </form>
      </Card>
      {ids.length > 0 && chosen.length < 3 && <Alert kind="warning">Selecione ao menos três estudos para a comparação lado a lado.</Alert>}
      {chosen.length >= 2 && (
        <Card>
          <CardHeader title="Comparação lado a lado" description="Cenário principal de cada estudo." />
          <Table>
            <thead><tr><Th>Indicador</Th>{ordered.map(({ r, rec: x }) => <Th key={r.study.id} className="text-right">{x.rank}º · <Link href={`/inteligencia/estudos/${r.study.id}`} className="normal-case hover:text-brand">{r.property.name}</Link></Th>)}</tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {line("Investimento inicial", (r) => brl(r.scenario.finance?.initialInvestment))}
              {line("Aluguel", (r) => (r.property.monthlyRent === null ? "—" : formatCurrency(Number(r.property.monthlyRent))))}
              {line("Carregadores", (r) => r.infra.chargerCount)}
              {line("Potência instalada", (r) => `${formatNumber(r.infra.installedKw, 0)} kW`)}
              {line("Energia projetada/mês", (r) => (r.scenario.forecast.energyPerMonthKwh === null ? "—" : `${formatNumber(r.scenario.forecast.energyPerMonthKwh, 0)} kWh`))}
              {line("Receita de recarga (ano 1)", (r) => brl(r.scenario.finance?.firstYear.chargingGross))}
              {line("Receitas complementares (ano 1)", (r) => brl(r.scenario.finance?.firstYear.complementaryNet))}
              {line("Custos operacionais (ano 1)", (r) => brl(r.scenario.finance ? r.scenario.finance.firstYear.variableCosts + r.scenario.finance.firstYear.fixedCosts : null))}
              {line("Resultado operacional (ano 1)", (r) => brl(r.scenario.finance?.firstYear.operatingResult))}
              {line("Ponto de equilíbrio", (r) => (r.scenario.finance ? (r.scenario.finance.breakEvenKwhMonth === null ? "inexistente" : `${formatNumber(r.scenario.finance.breakEvenKwhMonth, 0)} kWh/mês`) : "—"))}
              {line("Prazo de retorno", (r) => (r.scenario.finance ? (r.scenario.finance.paybackMonths === null ? "não atingido" : `${formatNumber(r.scenario.finance.paybackMonths, 1)} meses`) : "—"))}
              {line("Índice de potencial / confiança", (r) => `${r.index.score ?? "—"} · ${r.index.confidence}`)}
              {line("Baixa tensão", (r) => LV_CLASSES[r.lv.classification].label)}
              {line("Pendências técnicas", (r) => r.pendencies.length)}
              <tr><Td className="font-medium">Recomendação</Td>{ordered.map(({ r, rec: x }) => <Td key={r.study.id} className="text-right"><Badge tone={VERDICT_LABELS[x.verdict].tone}>{VERDICT_LABELS[x.verdict].label}</Badge><p className="mt-1 text-xs text-zinc-600">{x.reasons.join(" ")}</p></Td>)}</tr>
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
