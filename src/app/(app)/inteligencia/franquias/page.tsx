import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { listOrganizations, regionalPanel } from "@/server/intel/orgs";
import { saveOrgAction } from "../actions";
import { OrgForm } from "./forms";

export const metadata = { title: "Franquias" };
const KIND = { matriz: "Matriz", franquia: "Franquia", parceiro_b2b: "Parceiro B2B" } as const;

export default async function FranchisesPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const [orgs, panel] = await Promise.all([listOrganizations(ctx), regionalPanel(ctx)]);
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Franquias e organizações</h1><p className="text-sm text-zinc-600">Cada organização vê apenas seus imóveis e estudos (isolamento no servidor e políticas RLS no banco). Dados públicos normalizados são compartilhados.</p></div>
      <Card>
        {orgs.length === 0 ? <EmptyState title="Nenhuma organização visível" /> : (
          <Table><thead><tr><Th>Organização</Th><Th>Tipo</Th><Th>Estados</Th><Th className="text-right">Usuários</Th><Th /></tr></thead>
            <tbody className="divide-y divide-zinc-100">{orgs.map(({ o, members, regions }) => <tr key={o.id}><Td><Link href={`/inteligencia/franquias/${o.id}`} className="font-medium hover:text-brand">{o.name}</Link>{o.isDemo && <Badge tone="brand" className="ml-2">DEMONSTRAÇÃO</Badge>}</Td><Td>{KIND[o.kind as keyof typeof KIND]}</Td><Td>{regions ?? "—"}</Td><Td className="tabular text-right">{members}</Td><Td>{!o.active && <Badge>inativa</Badge>}</Td></tr>)}</tbody></Table>
        )}
      </Card>
      <Card>
        <CardHeader title="Painel regional" description="Imóveis e estudos por UF nas organizações visíveis." />
        {panel.length === 0 ? <EmptyState title="Sem dados" /> : <Table><thead><tr><Th>UF</Th><Th className="text-right">Imóveis</Th><Th className="text-right">Estudos</Th><Th className="text-right">Aprovados</Th></tr></thead><tbody className="divide-y divide-zinc-100">{panel.map((p, i) => <tr key={i}><Td>{p.uf ?? "Não informada"}</Td><Td className="tabular text-right">{p.properties}</Td><Td className="tabular text-right">{p.studies}</Td><Td className="tabular text-right">{p.approved}</Td></tr>)}</tbody></Table>}
      </Card>
      {can(ctx, "inteligencia.admin") && <Card><CardHeader title="Nova organização" /><div className="p-5"><OrgForm action={saveOrgAction.bind(null, null)} /></div></Card>}
    </div>
  );
}
