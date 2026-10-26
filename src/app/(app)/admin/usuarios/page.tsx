import Link from "next/link";
import { Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { listUsers } from "@/server/services/users";

export const metadata = { title: "Usuários" };

export default async function UsersPage() {
  const ctx = await requirePagePermission("admin.users");
  const rows = await listUsers(ctx);
  const now = new Date();
  return (
    <div>
      <PageHeader title="Usuários" description="Usuários não são excluídos — são desativados, preservando o histórico." actions={<LinkButton href="/admin/usuarios/novo"><Plus className="size-4" />Novo usuário</LinkButton>} />
      <Card>
        <Table>
          <thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Perfis</Th><Th>Situação</Th><Th>Último acesso</Th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((u) => (
              <tr key={u.id} className="hover:bg-zinc-50">
                <Td><Link href={`/admin/usuarios/${u.id}`} className="font-medium hover:text-brand">{u.name}</Link></Td>
                <Td className="text-zinc-600">{u.email}</Td>
                <Td><div className="flex flex-wrap gap-1">{u.roles.map((r) => <Badge key={r}>{r}</Badge>)}</div></Td>
                <Td><div className="flex flex-wrap gap-1">
                  {u.active ? <Badge tone="success">Ativo</Badge> : <Badge tone="neutral">Inativo</Badge>}
                  {u.lockedUntil && u.lockedUntil > now && <Badge tone="danger">Bloqueado</Badge>}
                  {u.mustChangePassword && <Badge tone="warning">Senha provisória</Badge>}
                </div></Td>
                <Td className="tabular text-zinc-600">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "Nunca"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
