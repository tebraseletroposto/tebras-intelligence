"use client";
import { useActionState } from "react";
import { TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/action-state";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, action] = useActionState(changePasswordAction, initialActionState);
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <TextInput label="Senha atual" name="currentPassword" type="password" autoComplete="current-password" required error={state.fieldErrors?.currentPassword} />
      <TextInput label="Nova senha" name="newPassword" type="password" autoComplete="new-password" required error={state.fieldErrors?.newPassword} hint="Mínimo de 10 caracteres, com letras e números." />
      <TextInput label="Confirmar nova senha" name="confirmPassword" type="password" autoComplete="new-password" required error={state.fieldErrors?.confirmPassword} />
      <SubmitButton>Alterar senha</SubmitButton>
    </form>
  );
}
