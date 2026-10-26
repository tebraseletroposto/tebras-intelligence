import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@/components/ui/misc";
import { can } from "@/server/authz";
import { requirePagePermission } from "@/server/auth/dal";
import { listPermissionCatalog, listRoles } from "@/server/services/roles";
import { updateRoleAction } from "../../actions";
import { RoleForm } from "../../role-form";

export const metadata = { title: "Perfil" };

export default async function RolePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ salvo?: string }> }) {
  const ctx = await requirePagePermission("admin.roles", "admin.users");
  const { id } = await params;
  const role = (await listRoles(ctx)).find((r) => r.id === id);
  if (!role) notFound();
  const catalog = await listPermissionCatalog();
  return (
    <div>
      <PageHeader breadcrumb={<Link href="/admin/perfis" className="hover:text-brand">Perfis</Link>} title={role.name} description={`${role.userCount} usuário(s) com este perfil.`} />
      {(await searchParams).salvo && <Alert kind="success" className="mb-4">Perfil criado.</Alert>}
      <RoleForm action={updateRoleAction.bind(null, id)} role={role} catalog={catalog} readOnly={!can(ctx, "admin.roles")} />
    </div>
  );
}
