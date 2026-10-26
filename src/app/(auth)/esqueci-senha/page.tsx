import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Recuperar acesso" };

/**
 * Recuperação de acesso.
 * O envio automático de e-mail ainda NÃO está configurado (integração prevista na Fase 7).
 * Até lá, a redefinição é feita por link de uso único gerado pelo administrador.
 */
export default function ForgotPasswordPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">Recuperar acesso</h1>
      <Alert kind="info" className="mt-5" title="Solicite ao administrador do sistema">
        Por segurança, o administrador gera um link de redefinição de uso único, válido por 60 minutos, e o envia a você por um canal confiável.
        O envio automático por e-mail será habilitado quando a integração de e-mail for configurada.
      </Alert>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-zinc-600 underline-offset-4 hover:text-brand hover:underline">Voltar para o login</Link>
      </p>
    </div>
  );
}
