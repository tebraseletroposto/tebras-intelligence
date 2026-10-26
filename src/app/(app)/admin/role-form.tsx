"use client";
import { useActionState } from "react";
import { Checkbox, FormSection, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";

const MODULE_LABELS: Record<string, string> = { dashboard: "Painel", inteligencia: "Tebras Intelligence", admin: "Administração" };

export function RoleForm({ action, role, catalog, readOnly }: {
  action: (p: ActionState, fd: FormData) => Promise<ActionState>;
  role?: { name: string; description: string | null; permissions: string[]; key?: string };
  catalog: { key: string; module: string; description: string }[];
  readOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const e = state.fieldErrors ?? {};
  const modules = [...new Set(catalog.map((c) => c.module))];
  const isAdmin = role?.key === "admin";
  return (
    <form key={state.ts ?? 0} action={formAction} className="space-y-5" noValidate>
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <FormSection title="Perfil">
        <TextInput label="Nome" name="name" required defaultValue={role?.name ?? ""} error={e.name} disabled={readOnly} />
        <TextInput label="Descrição" name="description" defaultValue={role?.description ?? ""} error={e.description} className="sm:col-span-2" disabled={readOnly} />
      </FormSection>
      {isAdmin && <Alert kind="info">O perfil Administrador mantém todas as permissões para evitar que o sistema fique sem acesso administrativo.</Alert>}
      <div className="grid gap-4 md:grid-cols-2">
        {modules.map((m) => (
          <fieldset key={m} className="rounded-lg border border-zinc-200 bg-white p-4">
            <legend className="px-1 text-sm font-semibold">{MODULE_LABELS[m] ?? m}</legend>
            <div className="space-y-2">
              {catalog.filter((c) => c.module === m).map((c) => (
                <Checkbox key={c.key} name="permissions[]" value={c.key} label={c.description} hint={c.key} defaultChecked={role?.permissions.includes(c.key)} disabled={readOnly || isAdmin} />
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {isAdmin && catalog.map((c) => <input key={c.key} type="hidden" name="permissions[]" value={c.key} />)}
      {!readOnly && <div className="flex justify-end"><SubmitButton>Salvar perfil</SubmitButton></div>}
    </form>
  );
}
