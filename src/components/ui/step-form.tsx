"use client";
import { useActionState } from "react";
import { initialActionState, type ActionState } from "@/lib/action-state";
import type { ButtonVariant } from "./button";
import { TextInput } from "./field";
import { Alert } from "./misc";
import { SubmitButton } from "./submit-button";

/** Botão de etapa de fluxo (com motivo opcional), com mensagem de erro do servidor. */
export function StepForm({ action, label, variant = "dark", reasonLabel }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; label: string; variant?: ButtonVariant; reasonLabel?: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const v = (state.ok ? undefined : (state.values?.reason as string)) ?? "";
  return (
    <form key={state.ts ?? 0} action={formAction} className="space-y-2" noValidate>
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      {reasonLabel && <TextInput label={reasonLabel} name="reason" defaultValue={v} error={state.fieldErrors?.reason} />}
      <SubmitButton variant={variant}>{label}</SubmitButton>
    </form>
  );
}
