import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/dal";
import { listPermissionCatalog } from "@/server/services/roles";
import { createRoleAction } from "../../actions";
import { RoleForm } from "../../role-form";

export const metadata = { title: "Novo perfil" };

export default async function NewRolePage() {
  await requirePagePermission("admin.roles");
  const catalog = await listPermissionCatalog();
  return (
    <div>
      <PageHeader breadcrumb={<Link href="/admin/perfis" className="hover:text-brand">Perfis</Link>} title="Novo perfil" />
      <RoleForm action={createRoleAction} catalog={catalog} />
    </div>
  );
}
