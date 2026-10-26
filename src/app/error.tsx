"use client";
import { Button } from "@/components/ui/button";

/** Erro inesperado: mensagem genérica, sem detalhes técnicos (o servidor registra o erro). */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-bold">Algo deu errado</h1>
      <p className="mt-1 max-w-md text-sm text-zinc-600">
        Não foi possível carregar esta página. Tente novamente. Se o problema persistir, informe ao suporte o código{" "}
        <code className="rounded bg-zinc-100 px-1">{error.digest ?? "—"}</code>.
      </p>
      <Button variant="dark" className="mt-6" onClick={reset}>Tentar novamente</Button>
    </div>
  );
}
