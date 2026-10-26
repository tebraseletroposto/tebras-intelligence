import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center">
      <p className="text-6xl font-black text-brand">404</p>
      <h1 className="mt-2 text-xl font-bold">Página ou registro não encontrado</h1>
      <p className="mt-1 text-sm text-zinc-600">Verifique o endereço ou volte para o início.</p>
      <LinkButton href="/" variant="dark" className="mt-6">Ir para o início</LinkButton>
    </div>
  );
}
