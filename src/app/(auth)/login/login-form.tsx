"use client";
import Link from "next/link";
import { useActionState } from "react";
import { TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/action-state";
import { loginAction } from "../actions";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, initialActionState);
  return (
    <form action={action} className="mt-6 space-y-4" noValidate>
      {state.message && <Alert kind="error">{state.message}</Alert>}
      <TextInput label="E-mail" name="email" type="email" autoComplete="username" required defaultValue={(state.values?.email as string) ?? ""} autoFocus />
      <TextInput label="Senha" name="password" type="password" autoComplete="current-password" required />
      <SubmitButton className="w-full" pendingText="Entrando…">Entrar</SubmitButton>
      <p className="text-center text-sm">
        <Link href="/esqueci-senha" className="text-zinc-600 underline-offset-4 hover:text-brand hover:underline">Esqueci minha senha</Link>
      </p>
    </form>
  );
}
