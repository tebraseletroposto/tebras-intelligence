import Link from "next/link";
import { Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { rankingData } from "@/server/intel/studies";
import { listReports } from "@/server/intel/reports-log";

export const metadata = { title: "Relatórios" };

export default async function ReportsPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const [{ rows }, log] = await Promise.all([rankingData(ctx), listReports(ctx)]);
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Relatórios</h1><p className="text-sm text-zinc-600">PDF profissional por estudo (imóvel, croqui de localização, concorrentes, fontes, indicadores, infraestrutura, premissas, cenários, investimento, custos, receitas, riscos, dados ausentes, limitações e recomendações) e exportações do ranking. Todo documento indica se é preliminar, simulado ou demonstração.</p></div>
      <Card>
        <CardHeader title="Ranking de terrenos" actions={<>{(["csv", "xlsx", "pdf"] as const).map((f) => <LinkButton key={f} href={`/inteligencia/analise/exportar?formato=${f}`} variant="outline" size="sm" prefetch={false}>{f.toUpperCase()}</LinkButton>)}<LinkButton href="/inteligencia/imoveis/exportar" variant="outline" size="sm" prefetch={false}>Imóveis (CSV)</LinkButton></>} />
      </Card>
      <Card>
        <CardHeader title="Estudos de viabilidade" />
        {rows.length === 0 ? <EmptyState title="Nenhum estudo" /> : (
          <ul className="divide-y divide-zinc-100">{rows.map((r) => <li key={r.study.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm"><span><Link href={`/inteligencia/estudos/${r.study.id}`} className="font-medium hover:text-brand">{r.property.name}</Link> · {r.study.name}<span className="block text-xs text-zinc-500">{r.nature}</span></span><LinkButton href={`/inteligencia/estudos/${r.study.id}/pdf`} size="sm" variant="dark" prefetch={false} target="_blank">PDF</LinkButton></li>)}</ul>
        )}
      </Card>
      <Card>
        <CardHeader title="Relatórios gerados" description="Registro de emissão (auditoria)." />
        {log.length === 0 ? <EmptyState title="Nenhum relatório emitido" /> : (
          <Table><thead><tr><Th>Data</Th><Th>Tipo</Th><Th>Estudo</Th><Th>Natureza</Th><Th>Emitido por</Th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{log.map((l) => <tr key={l.id}><Td>{formatDateTime(l.created_at)}</Td><Td>{l.kind} ({l.format})</Td><Td>{l.study_name ?? "—"}</Td><Td className="text-xs">{l.nature}</Td><Td>{l.user_name ?? "—"}</Td></tr>)}</tbody></Table>
        )}
      </Card>
    </div>
  );
}
