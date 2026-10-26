import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { AppError } from "@/server/errors";
import { listRoles } from "@/server/services/roles";
import { getUser } from "@/server/services/users";
import { unlockUserAction } from "../../actions";
import { EditUserForm, ResetLinkPanel } from "../../user-forms";

export const metadata = { title: "Usuário" };

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ criado?: string }> }) {
  const ctx = await requirePagePermission("admin.users");
  const { id } = await params;
  const sp = await searchParams;
  const user = await getUser(ctx, id).catch((e) => { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; });
  const roles = await listRoles(ctx);
  const locked = user.lockedUntil && user.lockedUntil > new Date();
  return (
    <div className="space-y-6">
      <PageHeader breadcrumb={<Link href="/admin/usuarios" className="hover:text-brand">Usuários</Link>} title={user.name}
        description={<span className="flex gap-2">{user.active ? <Badge tone="success">Ativo</Badge> : <Badge>Inativo</Badge>}{locked && <Badge tone="danger">Bloqueado até {formatDateTime(user.lockedUntil)}</Badge>}{user.mustChangePassword && <Badge tone="warning">Senha provisória</Badge>}</span>}
        actions={locked && <ConfirmForm action={unlockUserAction.bind(null, id)} title="Desbloquear usuário?" message="O contador de tentativas será zerado." triggerLabel="Desbloquear" triggerVariant="outline" confirmLabel="Desbloquear" />}
      />
      {sp.criado && <Alert kind="success">Usuário criado. Informe a senha provisória por um canal seguro; ela deverá ser trocada no primeiro acesso.</Alert>}
      <EditUserForm user={user} roles={roles} />
      <Card>
        <CardHeader title="Redefinição de senha" />
        <div className="p-5"><ResetLinkPanel userId={id} /></div>
      </Card>
      <p className="text-xs text-zinc-500">Último acesso: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nunca"}.</p>
    </div>
  );
}
