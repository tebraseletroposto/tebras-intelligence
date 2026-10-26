import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { rankingTable } from "@/server/intel/reports";

export const metadata = { title: "Análise de terreno — ranking" };
const SORTS = { recomendacao: "Recomendação", potencial: "Potencial", investimento: "Investimento", aluguel: "Custo de ocupação", margem: "Margem", retorno: "Retorno" } as const;

export default async function RankingPage({ searchParams }: { searchParams: Promise<{ ordem?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const ordem = ((await searchParams).ordem ?? "recomendacao") as keyof typeof SORTS;
  const rows = await rankingTable(ctx);
  const nil = (v: number | null, asc: boolean) => (v === null ? (asc ? Infinity : -Infinity) : v);
  const sorted = [...rows].sort((a, b) => {
    switch (ordem) {
      case "potencial": return nil(b.index, false) - nil(a.index, false);
      case "investimento": return nil(a.investment, true) - nil(b.investment, true);
      case "aluguel": return nil(a.rent, true) - nil(b.rent, true);
      case "margem": return nil(b.margin, false) - nil(a.margin, false);
      case "retorno": return nil(a.payback, true) - nil(b.payback, true);
      default: return a.rank - b.rank;
    }
  });
  const tone = (v: string) => (v === "Priorizar" ? "success" : v === "Descartar por ora" ? "danger" : v === "Avaliar com cautela" ? "warning" : "neutral");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Análise de terreno — ranking</h1><p className="text-sm text-zinc-600">Um estudo por linha, no cenário principal de cada um. A recomendação não escolhe automaticamente o maior faturamento.</p></div>
        <div className="flex gap-2">{(["csv", "xlsx", "pdf"] as const).map((f) => <LinkButton key={f} href={`/inteligencia/analise/exportar?formato=${f}`} variant="outline" prefetch={false}>{f.toUpperCase()}</LinkButton>)}</div>
      </div>
      <Card>
        <div className="flex flex-wrap gap-2 border-b border-zinc-100 p-3 text-sm">Ordenar por: {Object.entries(SORTS).map(([k, l]) => <Link key={k} href={`?ordem=${k}`} className={`rounded-full px-3 py-1 ${ordem === k ? "bg-ink text-white" : "bg-zinc-100 hover:bg-zinc-200"}`}>{l}</Link>)}</div>
        {sorted.length === 0 ? <EmptyState title="Nenhum estudo" description="Crie estudos a partir dos imóveis para compor o ranking." action={<LinkButton href="/inteligencia/imoveis">Ir para imóveis</LinkButton>} /> : (
          <Table>
            <thead><tr><Th>#</Th><Th>Imóvel / endereço</Th><Th className="text-right">Área</Th><Th className="text-right">Aluguel</Th><Th className="text-right">Concorrente + próximo</Th><Th className="text-right">Índice</Th><Th>Confiança</Th><Th className="text-right">Investimento</Th><Th className="text-right">Receita/mês</Th><Th className="text-right">Resultado ano 1</Th><Th className="text-right">Retorno</Th><Th>Pendências</Th><Th>Recomendação</Th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{sorted.map((r) => (
              <tr key={r.studyId} className="hover:bg-zinc-50">
                <Td className="tabular font-bold">{r.rank}</Td>
                <Td><Link href={`/inteligencia/estudos/${r.studyId}`} className="font-medium hover:text-brand">{r.property}</Link>{r.demo && <Badge tone="brand" className="ml-1">DEMONSTRAÇÃO</Badge>}<p className="text-xs text-zinc-500">{r.address || "—"}{r.lat !== null && ` · ${r.lat.toFixed(4)}, ${r.lng!.toFixed(4)}`}</p></Td>
                <Td className="tabular text-right">{r.areaM2 === null ? "—" : `${formatNumber(r.areaM2, 0)} m²`}</Td>
                <Td className="tabular text-right">{r.rent === null ? "—" : formatCurrency(r.rent)}</Td>
                <Td className="tabular text-right">{r.nearestCompetitorM === null ? "—" : `${formatNumber(r.nearestCompetitorM / 1000, 2)} km`}</Td>
                <Td className="tabular text-right font-semibold">{r.index ?? "—"}</Td><Td>{r.confidence}</Td>
                <Td className="tabular text-right">{r.investment === null ? "—" : formatCurrency(r.investment)}</Td>
                <Td className="tabular text-right">{r.revenueMonth === null ? "—" : formatCurrency(r.revenueMonth)}</Td>
                <Td className={`tabular text-right ${r.operatingYear1 !== null && r.operatingYear1 < 0 ? "text-red-700" : ""}`}>{r.operatingYear1 === null ? "—" : formatCurrency(r.operatingYear1)}</Td>
                <Td className="tabular text-right">{r.payback === null ? "não atingido" : `${formatNumber(r.payback, 0)} m`}</Td>
                <Td className="tabular">{r.pendencies}</Td>
                <Td><Badge tone={tone(r.verdict)}>{r.verdict}</Badge><p className="mt-1 max-w-56 text-[11px] text-zinc-500">{r.reasons}</p></Td>
              </tr>))}</tbody>
          </Table>
        )}
      </Card>
      <Card><CardHeader title="Como ler" /><ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm text-zinc-700"><li>Índice: 0–100, pesos configuráveis (hipóteses). Confiança reflete cobertura e qualidade dos dados.</li><li>Valores “—” significam não calculado ou sem dados, nunca zero.</li><li>Resultados financeiros dependem das premissas de cada estudo; consulte o relatório PDF.</li></ul></Card>
    </div>
  );
}
