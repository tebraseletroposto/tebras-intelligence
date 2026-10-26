"use client";
import { useActionState, useState } from "react";
import { Copy } from "lucide-react";
import { Button, LinkButton } from "@/components/ui/button";
import { Checkbox, FormSection, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { formatDateTime } from "@/lib/format";
import { createUserAction, resetLinkAction, updateUserAction } from "./actions";

type RoleOpt = { id: string; name: string; description: string | null };

function RolesPicker({ roles, selected, error }: { roles: RoleOpt[]; selected: string[]; error?: string }) {
  return (
    <div className="sm:col-span-3">
      <p className="mb-2 text-sm font-medium">Perfis de acesso <span className="text-brand">*</span></p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => <Checkbox key={r.id} name="roleIds[]" value={r.id} label={r.name} hint={r.description ?? undefined} defaultChecked={selected.includes(r.id)} />)}
      </div>
      {error && <p className="mt-1 text-xs font-medium text-red-600" role="alert">{error}</p>}
    </div>
  );
}

export function NewUserForm({ roles }: { roles: RoleOpt[] }) {
  const [state, action] = useActionState(createUserAction, initialActionState);
  const v = (state.values ?? {}) as Record<string, string | string[]>;
  const e = state.fieldErrors ?? {};
  return (
    <form key={state.ts ?? 0} action={action} className="space-y-5" noValidate>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <FormSection title="Dados do usuário" description="O usuário deverá trocar a senha provisória no primeiro acesso.">
        <TextInput label="Nome" name="name" required defaultValue={(v.name as string) ?? ""} error={e.name} />
        <TextInput label="E-mail" name="email" type="email" required defaultValue={(v.email as string) ?? ""} error={e.email} />
        <TextInput label="Senha provisória" name="temporaryPassword" type="password" autoComplete="new-password" required error={e.temporaryPassword} hint="Mín. 10 caracteres, letras e números." />
        <RolesPicker roles={roles} selected={(v.roleIds as string[]) ?? []} error={e.roleIds} />
      </FormSection>
      <div className="flex justify-end gap-2"><LinkButton href="/admin/usuarios" variant="outline">Cancelar</LinkButton><SubmitButton>Criar usuário</SubmitButton></div>
    </form>
  );
}

export function EditUserForm({ user, roles }: { user: { id: string; name: string; email: string; active: boolean; roleIds: string[] }; roles: RoleOpt[] }) {
  const [state, action] = useActionState(updateUserAction.bind(null, user.id), initialActionState);
  const v = (state.ok ? {} : state.values ?? {}) as Record<string, string | string[]>;
  const e = state.fieldErrors ?? {};
  return (
    <form key={state.ts ?? 0} action={action} className="space-y-5" noValidate>
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <FormSection title="Dados do usuário">
        <TextInput label="Nome" name="name" required defaultValue={(v.name as string) ?? user.name} error={e.name} />
        <TextInput label="E-mail" name="email" type="email" required defaultValue={(v.email as string) ?? user.email} error={e.email} />
        <div className="flex items-end pb-2"><Checkbox name="active" label="Usuário ativo" defaultChecked={user.active} hint="Desativar encerra as sessões abertas." /></div>
        <RolesPicker roles={roles} selected={(v.roleIds as string[]) ?? user.roleIds} error={e.roleIds} />
      </FormSection>
      <div className="flex justify-end"><SubmitButton>Salvar</SubmitButton></div>
    </form>
  );
}

export function ResetLinkPanel({ userId }: { userId: string }) {
  const [state, action] = useActionState(resetLinkAction.bind(null, userId) as (p: ActionState) => Promise<ActionState>, initialActionState);
  const [copied, setCopied] = useState(false);
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm text-zinc-600">Gera um link de uso único, válido por 60 minutos. Links anteriores são invalidados. O envio automático por e-mail ainda não está configurado.</p>
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {state.data?.url && (
        <div className="space-y-1">
          <div className="flex gap-2">
            <input readOnly value={state.data.url} aria-label="Link de redefinição" className="h-10 flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(state.data!.url).then(() => setCopied(true))}><Copy className="size-4" />{copied ? "Copiado" : "Copiar"}</Button>
          </div>
          <p className="text-xs text-zinc-500">Expira em {formatDateTime(state.data.expiresAt)}.</p>
        </div>
      )}
      <SubmitButton variant="dark" pendingText="Gerando…">Gerar link de redefinição</SubmitButton>
    </form>
  );
}
