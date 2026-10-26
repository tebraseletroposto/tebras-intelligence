import { redirect } from "next/navigation";
import { Header } from "@/components/shell/header";
import { Sidebar } from "@/components/shell/sidebar";
import { NAV_ITEMS } from "@/lib/nav";
import { canAny } from "@/server/authz";
import { requireUser } from "@/server/auth/dal";
import { loadNotices } from "@/server/services/notices";
import { headers } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  // Troca de senha obrigatória: só a página de senha é acessível
  const path = (await headers()).get("x-pathname") ?? "";
  if (user.mustChangePassword && !path.startsWith("/perfil/senha")) redirect("/perfil/senha?obrigatorio=1");

  const items = NAV_ITEMS.filter((i) => canAny(user, i.permissions));
  const notices = await loadNotices(user);
  return (
    <div className="min-h-screen">
      <Sidebar items={items} appEnv={process.env.APP_ENV ?? "development"} />
      <div className="lg:pl-72">
        <Header user={{ name: user.name, email: user.email, roles: user.roles.map(roleLabel) }} notices={notices} />
        <main id="conteudo" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

const ROLE_LABELS: Record<string, string> = { admin: "Administrador", inteligencia: "Analista de Inteligência", franqueado: "Franqueado", consulta: "Consulta" };
const roleLabel = (k: string) => ROLE_LABELS[k] ?? k;
