import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/dal";
import { listRoles } from "@/server/services/roles";
import { NewUserForm } from "../../user-forms";

export const metadata = { title: "Novo usuário" };

export default async function NewUserPage() {
  const ctx = await requirePagePermission("admin.users");
  const roles = await listRoles(ctx);
  return (
    <div>
      <PageHeader breadcrumb={<Link href="/admin/usuarios" className="hover:text-brand">Usuários</Link>} title="Novo usuário" />
      <NewUserForm roles={roles} />
    </div>
  );
}
