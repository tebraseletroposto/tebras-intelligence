import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { Stat } from "@/components/intel/brand";
import { Table, Td, Th } from "@/components/ui/table";
import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { AppError } from "@/server/errors";
import { getOrganization, ORG_ROLE_LABELS } from "@/server/intel/orgs";
import { memberAction, removeMemberAction, saveOrgAction } from "../../actions";
import { MemberForm, OrgForm } from "../forms";

export const metadata = { title: "Organização" };

export default async function OrgPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const { id } = await params;
  const d = await getOrganization(ctx, id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const admin = can(ctx, "inteligencia.admin");
  return (
    <div className="space-y-4">
      <PageHeader title={d.org.name} breadcrumb={<Link href="/inteligencia/franquias" className="hover:text-brand">Franquias</Link>} description={d.regions.length ? `Atuação: ${d.regions.map((r) => r.uf).join(", ")}` : "Sem estados definidos"} />
      <div className="grid gap-4 sm:grid-cols-4"><Stat label="Imóveis" value={d.performance.properties} /><Stat label="Estudos" value={d.performance.studies} /><Stat label="Aprovados" value={d.performance.approved} /><Stat label="Implantados" value={d.performance.implanted} tone="dark" /></div>
      <Card>
        <CardHeader title="Usuários vinculados" />
        <Table><thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Papel</Th><Th /></tr></thead>
          <tbody className="divide-y divide-zinc-100">{d.members.map((m) => <tr key={m.userId}><Td>{m.name}</Td><Td>{m.email}</Td><Td>{ORG_ROLE_LABELS[m.role as keyof typeof ORG_ROLE_LABELS]}</Td><Td>{admin && <form action={removeMemberAction.bind(null, id, m.userId)}><button className="text-xs text-red-700 hover:underline">Remover</button></form>}</Td></tr>)}</tbody></Table>
        {admin && <div className="border-t border-zinc-100 p-5"><MemberForm action={memberAction.bind(null, id)} /><p className="mt-2 text-xs text-zinc-500">O usuário precisa existir (Administração → Usuários) e ter perfil com permissão do Tebras Intelligence (ex.: “Analista de Inteligência” ou “Franqueado”).</p></div>}
      </Card>
      {admin && <Card><CardHeader title="Dados da organização" /><div className="p-5"><OrgForm action={saveOrgAction.bind(null, id)} initial={{ name: d.org.name, kind: d.org.kind, document: d.org.document, isDemo: d.org.isDemo, regions: d.regions.map((r) => r.uf) }} /></div></Card>}
    </div>
  );
}
