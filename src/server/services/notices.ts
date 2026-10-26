import { and, count, eq, gt } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import type { Notice } from "@/components/shell/header";
import { can, type AuthContext } from "../authz";
import { getCompanySettings, missingCompanyFields } from "./settings";

/**
 * Notificações derivadas de dados reais. Nenhuma notificação fictícia é exibida.
 * Novos módulos acrescentam aqui seus alertas (leads sem retorno, contas vencidas, etc.).
 */
export async function loadNotices(ctx: AuthContext): Promise<Notice[]> {
  const out: Notice[] = [];
  if (can(ctx, "admin.settings")) {
    const missing = missingCompanyFields(await getCompanySettings());
    if (missing.length)
      out.push({ id: "company", tone: "warning", title: "Dados da empresa incompletos", description: `Necessários para os relatórios: ${missing.join(", ")}.`, href: "/admin/empresa" });
  }
  if (can(ctx, "admin.users")) {
    const [{ n }] = await getDb().select({ n: count() }).from(users).where(and(eq(users.active, true), gt(users.lockedUntil, new Date())));
    if (n > 0) out.push({ id: "locked", tone: "danger", title: `${n} usuário(s) bloqueado(s) por tentativas de login`, href: "/admin/usuarios" });
  }
  return out;
}
