import Link from "next/link";
import { Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { SCENARIO_LABELS } from "@/lib/intel/demand";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { rankingData } from "@/server/intel/studies";

export const metadata = { title: "Viabilidade financeira" };
const brl = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatCurrency(v));

export default async function FeasibilityPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const { rows } = await rankingData(ctx);
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Viabilidade financeira</h1><p className="text-sm text-zinc-600">Investimento, receitas, custos, ponto de equilíbrio e retorno por estudo (cenário principal). Faturamento não é lucro.</p></div>
      <Card>
        {rows.length === 0 ? <EmptyState title="Nenhum estudo" /> : (
          <Table>
            <thead><tr><Th>Estudo</Th><Th>Cenário</Th><Th className="text-right">Investimento</Th><Th className="text-right">Receita recarga (ano 1)</Th><Th className="text-right">Margem contrib. (ano 1)</Th><Th className="text-right">Resultado operacional (ano 1)</Th><Th className="text-right">Lucro líquido (ano 1)</Th><Th className="text-right">Equilíbrio (kWh/mês)</Th><Th className="text-right">Retorno</Th><Th>Alertas</Th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{rows.map((r) => { const f = r.scenario.finance; return (
              <tr key={r.study.id}>
                <Td><Link href={`/inteligencia/estudos/${r.study.id}?aba=financeiro`} className="font-medium hover:text-brand">{r.property.name}</Link><p className="text-xs text-zinc-500">{r.study.name}{r.property.isDemo && " · DEMONSTRAÇÃO"}</p></Td>
                <Td>{SCENARIO_LABELS[r.selected]}</Td>
                <Td className="tabular text-right">{brl(f?.initialInvestment)}{f?.capexMissing.length ? <span className="block text-[11px] text-amber-700">incompleto</span> : null}</Td>
                <Td className="tabular text-right">{brl(f?.firstYear.chargingGross)}</Td><Td className="tabular text-right">{brl(f?.firstYear.contributionMargin)}</Td>
                <Td className={`tabular text-right ${f && f.firstYear.operatingResult < 0 ? "text-red-700" : ""}`}>{brl(f?.firstYear.operatingResult)}</Td><Td className="tabular text-right">{brl(f?.firstYear.netIncome)}</Td>
                <Td className="tabular text-right">{f ? (f.breakEvenKwhMonth === null ? "inexistente" : formatNumber(f.breakEvenKwhMonth, 0)) : "—"}</Td>
                <Td className="tabular text-right">{f ? (f.paybackMonths === null ? "não atingido" : `${formatNumber(f.paybackMonths, 1)} m`) : "—"}</Td>
                <Td className="text-xs text-zinc-600">{f ? `${f.warnings.length} aviso(s)` : "Sem demanda estimável"}</Td>
              </tr>); })}</tbody>
          </Table>
        )}
      </Card>
      <Card><CardHeader title="Definições" /><ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm text-zinc-700"><li><strong>Receita bruta</strong>: energia vendida × preço praticado (com descontos).</li><li><strong>Margem de contribuição</strong>: receita − tributos, taxas, comissões e energia comprada (+ receitas complementares líquidas incluídas).</li><li><strong>Resultado operacional</strong>: margem de contribuição − custos fixos.</li><li><strong>Lucro líquido</strong>: resultado operacional − depreciação − juros − IR/CSLL.</li><li><strong>Fluxo de caixa</strong>: resultado operacional − juros − amortização − IR. <strong>Payback</strong> só é exibido se o investimento for recuperado no horizonte.</li></ul></Card>
    </div>
  );
}
