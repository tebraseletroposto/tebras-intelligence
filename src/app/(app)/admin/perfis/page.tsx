import Link from "next/link";
import { Plus } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Badge, Card, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { can } from "@/server/authz";
import { requirePagePermission } from "@/server/auth/dal";
import { listRoles } from "@/server/services/roles";

export const metadata = { title: "Perfis e permissões" };

export default async function RolesPage() {
  const ctx = await requirePagePermission("admin.roles", "admin.users");
  const roles = await listRoles(ctx);
  return (
    <div>
      <PageHeader title="Perfis e permissões" description="As permissões são verificadas no servidor em cada operação. Um usuário pode ter vários perfis."
        actions={can(ctx, "admin.roles") && <LinkButton href="/admin/perfis/novo"><Plus className="size-4" />Novo perfil</LinkButton>} />
      <Card>
        <Table>
          <thead><tr><Th>Perfil</Th><Th>Descrição</Th><Th>Permissões</Th><Th>Usuários</Th></tr></thead>
          <tbody className="divide-y divide-zinc-100">
            {roles.map((r) => (
              <tr key={r.id} className="hover:bg-zinc-50">
                <Td><Link href={`/admin/perfis/${r.id}`} className="font-medium hover:text-brand">{r.name}</Link>{r.isSystem && <Badge className="ml-2">Padrão</Badge>}</Td>
                <Td className="text-zinc-600">{r.description}</Td>
                <Td className="tabular">{r.permissions.length}</Td>
                <Td className="tabular">{r.userCount}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
