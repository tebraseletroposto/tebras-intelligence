import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Pagination, Table, Td, Th } from "@/components/ui/table";
import { STATION_STATUS, type StationStatus } from "@/lib/intel/competition";
import { formatDate, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { listStations } from "@/server/intel/sources";

export const metadata = { title: "Concorrência" };

export default async function CompetitionPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; source?: string; minPower?: string; page?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const sp = await searchParams;
  const { rows, total, page } = await listStations(ctx, sp);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Concorrência — carregadores conhecidos</h1><p className="text-sm text-zinc-600">Base geográfica de pontos de recarga com fonte, verificação e confiança. A análise por raio (1, 3, 5, 10 e 20 km) aparece em cada imóvel.</p></div>
        {(can(ctx, "inteligencia.import") || can(ctx, "inteligencia.admin")) && <LinkButton href="/inteligencia/concorrencia/novo">Cadastrar carregador</LinkButton>}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">{(Object.keys(STATION_STATUS) as StationStatus[]).map((k) => <div key={k} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm"><Badge tone={STATION_STATUS[k].tone}>{STATION_STATUS[k].label}</Badge></div>)}</div>
      <Card>
        <form method="get" className="flex flex-wrap gap-2 border-b border-zinc-100 p-4">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Nome, operador ou endereço" aria-label="Busca" className="h-9 min-w-56 flex-1 rounded-md border border-zinc-300 px-2 text-sm" />
          <select name="status" defaultValue={sp.status ?? ""} aria-label="Verificação" className="h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm"><option value="">Toda verificação</option>{Object.entries(STATION_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <input name="minPower" defaultValue={sp.minPower ?? ""} placeholder="Potência mín. (kW)" aria-label="Potência mínima" className="h-9 w-40 rounded-md border border-zinc-300 px-2 text-sm" />
          <button className="h-9 rounded-md bg-ink px-4 text-sm text-white">Filtrar</button>
        </form>
        {rows.length === 0 ? <EmptyState title="Nenhum carregador na base" description="Importe carregadores (CSV/XLSX), consulte o OpenStreetMap em Catálogo de fontes ou cadastre manualmente. Ausência na base não significa ausência de concorrentes." /> : (
          <Table>
            <thead><tr><Th>Estabelecimento</Th><Th>Operador</Th><Th className="text-right">Potência</Th><Th>Tipo</Th><Th className="text-right">Preço</Th><Th>Verificação</Th><Th>Fonte</Th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{rows.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <Td><Link href={`/inteligencia/concorrencia/${r.id}`} className="font-medium hover:text-brand">{r.name ?? "Sem nome"}</Link>{r.is_demo && <Badge tone="brand" className="ml-1">DEMONSTRAÇÃO</Badge>}{r.organization_id && <Badge className="ml-1">privado</Badge>}<p className="text-xs text-zinc-500">{r.address ?? `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`}</p></Td>
                <Td>{r.operator ?? <span className="text-zinc-400">—</span>}</Td>
                <Td className="tabular text-right">{r.max_power_kw === null ? "—" : `${formatNumber(r.max_power_kw, 0)} kW`}</Td><Td>{r.current_type ?? "—"}</Td>
                <Td className="tabular text-right">{r.price_per_kwh === null ? "—" : `R$ ${formatNumber(Number(r.price_per_kwh), 2)}`}</Td>
                <Td><Badge tone={STATION_STATUS[r.verification_status as StationStatus].tone}>{STATION_STATUS[r.verification_status as StationStatus].label}</Badge>{r.verified_at && <p className="text-xs text-zinc-500">{formatDate(r.verified_at)}</p>}</Td>
                <Td className="text-xs">{r.source_key}</Td>
              </tr>))}</tbody>
          </Table>
        )}
        <Pagination base="/inteligencia/concorrencia" params={sp} page={page} pageCount={Math.max(1, Math.ceil(total / 100))} total={total} />
      </Card>
      <Card><CardHeader title="Regras de interpretação" /><ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm text-zinc-700"><li>Não se conclui demanda reprimida apenas pela ausência de carregadores cadastrados.</li><li>Fontes públicas (OSM, Open Charge Map) são colaborativas: registros entram como “não verificados”.</li><li>Correções exigem motivo/evidência e ficam no histórico; registros confirmados não são sobrescritos por novas importações.</li></ul></Card>
    </div>
  );
}
