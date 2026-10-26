"use client";
import { useActionState } from "react";
import { Checkbox, SelectInput, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { UFS } from "@/lib/domain/documents";

type Act = (p: ActionState, fd: FormData) => Promise<ActionState>;

export function OrgForm({ action, initial }: { action: Act; initial?: { name: string; kind: string; document: string | null; isDemo: boolean; regions: string[] } }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form key={state.ts ?? 0} action={formAction} className="space-y-3" aria-label="Organização">
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <TextInput label="Nome" name="name" defaultValue={initial?.name} error={state.fieldErrors?.name} />
        <SelectInput label="Tipo" name="kind" defaultValue={initial?.kind ?? "franquia"} options={{ matriz: "Matriz", franquia: "Franquia", parceiro_b2b: "Parceiro B2B" }} />
        <TextInput label="CNPJ" name="document" defaultValue={initial?.document ?? ""} />
      </div>
      <fieldset><legend className="text-sm font-medium">Estados de atuação</legend><div className="mt-1 grid grid-cols-6 gap-1 sm:grid-cols-9">{UFS.map((u) => <label key={u} className="flex items-center gap-1 text-xs"><input type="checkbox" name="regions" value={u} defaultChecked={initial?.regions.includes(u)} className="accent-brand" />{u}</label>)}</div></fieldset>
      <Checkbox label="Organização de DEMONSTRAÇÃO (dados fictícios, identificados permanentemente)" name="isDemo" defaultChecked={initial?.isDemo} />
      <SubmitButton>Salvar organização</SubmitButton>
    </form>
  );
}

export function MemberForm({ action }: { action: Act }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form key={state.ts ?? 0} action={formAction} className="flex flex-wrap items-end gap-3" aria-label="Vincular usuário">
      <TextInput label="E-mail do usuário" name="email" error={state.fieldErrors?.email} className="min-w-64" />
      <SelectInput label="Papel" name="role" options={{ analista: "Analista", franqueado: "Franqueado", gestor_regional: "Gestor regional", consulta: "Consulta", admin_global: "Administrador global" }} />
      <SubmitButton>Vincular</SubmitButton>
      {state.message && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
    </form>
  );
}
