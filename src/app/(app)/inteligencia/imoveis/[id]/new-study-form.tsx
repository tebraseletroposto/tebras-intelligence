"use client";
import { useActionState } from "react";
import { TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";

export function NewStudyForm({ action }: { action: (p: ActionState, fd: FormData) => Promise<ActionState> }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" aria-label="Novo estudo">
      {state.message && <Alert kind="error" className="w-full">{state.message}</Alert>}
      <TextInput label="Nome do novo estudo" name="name" defaultValue="Estudo preliminar" error={state.fieldErrors?.name} className="min-w-64 flex-1" />
      <SubmitButton pendingText="Criando…">Criar estudo</SubmitButton>
    </form>
  );
}
