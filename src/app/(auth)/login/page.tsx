import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/misc";
import { getSessionUser } from "@/server/auth/dal";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redefinida?: string }> }) {
  if (await getSessionUser()) redirect("/");
  const sp = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Acessar o Tebras Intelligence</h1>
      <p className="mt-1 text-sm text-zinc-600">Entre com seu e-mail corporativo e senha.</p>
      {sp.redefinida && <Alert kind="success" className="mt-5">Senha redefinida. Entre com a nova senha.</Alert>}
      <LoginForm />
    </div>
  );
}
