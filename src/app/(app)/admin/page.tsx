import { redirect } from "next/navigation";
import { can } from "@/server/authz";
import { requireUser } from "@/server/auth/dal";

export default async function AdminIndex() {
  const ctx = await requireUser();
  redirect(can(ctx, "admin.users") ? "/admin/usuarios" : can(ctx, "admin.settings") ? "/admin/empresa" : can(ctx, "admin.roles") ? "/admin/perfis" : "/admin/auditoria");
}
