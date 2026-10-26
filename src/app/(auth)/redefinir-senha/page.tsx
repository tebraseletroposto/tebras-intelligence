import type { Metadata } from "next";
import { Alert } from "@/components/ui/misc";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = { title: "Redefinir senha" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Definir nova senha</h1>
      {token ? <ResetForm token={token} /> : <Alert kind="error" className="mt-5">Link inválido. Solicite um novo ao administrador.</Alert>}
    </div>
  );
}
