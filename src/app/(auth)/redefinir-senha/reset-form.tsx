"use client";
import { useActionState } from "react";
import { TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/action-state";
import { resetPasswordAction } from "../actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialActionState);
  return (
    <form action={action} className="mt-6 space-y-4">
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <input type="hidden" name="token" value={token} />
      <TextInput label="Nova senha" name="newPassword" type="password" autoComplete="new-password" required error={state.fieldErrors?.newPassword} hint="Mínimo de 10 caracteres, com letras e números." />
      <TextInput label="Confirmar nova senha" name="confirmPassword" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirmPassword} />
      <SubmitButton className="w-full">Salvar nova senha</SubmitButton>
    </form>
  );
}
