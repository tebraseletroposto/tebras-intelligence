import "server-only";
import { getRequestMeta, getSessionUser } from "./auth/dal";
import type { AuthContext } from "./authz";

/**
 * Proteção CSRF para Route Handlers que alteram dados: exige Origin do mesmo host.
 * (Server Actions já fazem essa verificação automaticamente.)
 */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try { return new URL(origin).host === host; } catch { return false; }
}

export async function requireApiUser(): Promise<AuthContext | null> {
  const user = await getSessionUser();
  if (!user || user.mustChangePassword) return null;
  return { ...user, ...(await getRequestMeta()) };
}

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
