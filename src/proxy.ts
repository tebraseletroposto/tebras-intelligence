import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/server/auth/cookies";

/**
 * Verificação OTIMISTA: só redireciona para /login quando não há cookie de sessão.
 * A validação real (sessão no banco, permissões) é feita no servidor em src/server/auth/dal.ts.
 */
const PUBLIC_PATHS = ["/login", "/esqueci-senha", "/redefinir-senha", "/api/health"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && !request.cookies.has(SESSION_COOKIE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  // Repassa o caminho para os layouts de servidor (ex.: troca de senha obrigatória)
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: reqHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|brand/|icons/|icon.png|apple-icon.png|favicon.ico|manifest.webmanifest|sw.js|offline.html).*)"],
};
