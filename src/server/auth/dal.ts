import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Permission } from "@/lib/permissions";
import { logEvent } from "../audit";
import type { AuthContext } from "../authz";
import { SESSION_COOKIE } from "./cookies";
import { validateSession, type RequestMeta, type SessionUser } from "./service";

/**
 * Data Access Layer de autenticação.
 * Toda página e Server Action protegida passa por aqui. O proxy.ts faz apenas uma
 * verificação otimista (presença do cookie); a validação real acontece neste módulo.
 */

export const getRequestMeta = cache(async (): Promise<RequestMeta> => {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: fwd || h.get("x-real-ip") || null, userAgent: h.get("user-agent") };
});

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return validateSession(token);
});

/** Retorna o contexto autenticado ou redireciona para o login. */
export const requireUser = cache(async (): Promise<AuthContext & { mustChangePassword: boolean; sessionId: string }> => {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const meta = await getRequestMeta();
  return { ...user, ...meta };
});

/** Para páginas: exige a permissão; caso contrário registra e redireciona para "acesso negado". */
export async function requirePagePermission(...anyOf: Permission[]) {
  const ctx = await requireUser();
  if (ctx.mustChangePassword) redirect("/perfil/senha?obrigatorio=1");
  if (!anyOf.some((p) => ctx.permissions.has(p))) {
    await logEvent({ userId: ctx.userId, action: "access.denied", summary: `Permissão exigida: ${anyOf.join(" | ")}`, ip: ctx.ip, userAgent: ctx.userAgent });
    redirect("/acesso-negado");
  }
  return ctx;
}
