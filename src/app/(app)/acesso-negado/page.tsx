import { ShieldX } from "lucide-react";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/misc";

export const metadata = { title: "Acesso negado" };

export default function AccessDenied() {
  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <ShieldX className="mx-auto size-12 text-brand" aria-hidden />
      <h1 className="mt-4 text-xl font-bold">Acesso negado</h1>
      <p className="mt-2 text-sm text-zinc-600">Seu perfil não tem permissão para acessar esta área. A tentativa foi registrada. Se precisar de acesso, solicite ao administrador.</p>
      <LinkButton href="/" variant="dark" className="mt-6">Voltar ao início</LinkButton>
    </Card>
  );
}
