import { Alert, Card, PageHeader } from "@/components/ui/misc";
import { requireUser } from "@/server/auth/dal";
import { PasswordForm } from "./password-form";

export const metadata = { title: "Alterar senha" };

export default async function ChangePasswordPage({ searchParams }: { searchParams: Promise<{ obrigatorio?: string }> }) {
  const user = await requireUser();
  const { obrigatorio } = await searchParams;
  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Alterar senha" description="As demais sessões abertas serão encerradas após a troca." />
      {(obrigatorio || user.mustChangePassword) && (
        <Alert kind="warning" className="mb-4" title="Troca de senha obrigatória">Você está usando uma senha provisória. Defina uma senha pessoal para continuar.</Alert>
      )}
      <Card className="p-5"><PasswordForm /></Card>
    </div>
  );
}
