import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { NatureBadge } from "@/components/intel/brand";
import { SCENARIO_KEYS, SCENARIO_LABELS } from "@/lib/intel/demand";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { rankingData } from "@/server/intel/studies";

export const metadata = { title: "Previsão de demanda" };

export default async function DemandPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const { rows } = await rankingData(ctx);
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Previsão de demanda</h1><p className="text-sm text-zinc-600">Modelo por etapas: mercado regional → usuários de recarga pública → parcela acessível → demanda captável → limitada pela capacidade. Três cenários por estudo, com premissas explícitas.</p></div>
      <Card>
        {rows.length === 0 ? <EmptyState title="Nenhum estudo" description="Crie estudos nos imóveis para estimar demanda." /> : (
          <Table>
            <thead><tr><Th>Estudo</Th><Th>Base de dados</Th>{SCENARIO_KEYS.map((k) => <Th key={k} className="text-right">{SCENARIO_LABELS[k]} (kWh/mês)</Th>)}<Th className="text-right">Sessões/dia (principal)</Th><Th className="text-right">Receita bruta/mês</Th><Th className="text-right">Utilização</Th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{rows.map((r) => (
              <tr key={r.study.id}>
                <Td><Link href={`/inteligencia/estudos/${r.study.id}?aba=demanda`} className="font-medium hover:text-brand">{r.property.name}</Link><p className="text-xs text-zinc-500">{r.study.name}{r.property.isDemo && " · DEMONSTRAÇÃO"}</p></Td>
                <Td>{r.scenario.forecast.path === "externo" ? <Badge tone="info">EVIE/externo</Badge> : r.scenario.forecast.path === "funil" ? <Badge>Frota + premissas</Badge> : <NatureBadge nature="sem_dados" />}</Td>
                {SCENARIO_KEYS.map((k) => <Td key={k} className="tabular text-right">{r.scenarios[k].forecast.energyPerMonthKwh === null ? "—" : formatNumber(r.scenarios[k].forecast.energyPerMonthKwh!, 0)}</Td>)}
                <Td className="tabular text-right">{r.scenario.forecast.servedSessionsPerDay === null ? "—" : formatNumber(r.scenario.forecast.servedSessionsPerDay, 1)}{r.scenario.forecast.capacityLimited && <span className="block text-[11px] text-amber-700">capacidade</span>}</Td>
                <Td className="tabular text-right">{r.scenario.forecast.grossRevenueMonth === null ? "—" : formatCurrency(r.scenario.forecast.grossRevenueMonth)}</Td>
                <Td className="tabular text-right">{r.scenario.forecast.utilization === null ? "—" : `${formatNumber(r.scenario.forecast.utilization * 100, 1)}%`}</Td>
              </tr>))}</tbody>
          </Table>
        )}
      </Card>
      <Card><CardHeader title="Transparência estatística" /><ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm text-zinc-700">
        <li>Versão atual: modelo de regras (regras-v1). Não há afirmação de precisão equivalente ao EVIE sem validação empírica.</li>
        <li>Calibração: com operação diária dos hubs importada, cada estudo mostra validação temporal (MAE e WAPE) contra linha de base simples.</li>
        <li>Intervalos de previsão e distribuição horária só serão exibidos quando houver dados e metodologia que os sustentem.</li>
        <li>Fluxo de veículos e população nunca são tratados como demanda de recarga direta.</li></ul></Card>
    </div>
  );
}
