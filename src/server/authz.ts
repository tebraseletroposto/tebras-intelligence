import type { Permission } from "@/lib/permissions";
import { forbidden } from "./errors";

/** Contexto do usuário autenticado, repassado a todos os serviços. */
export type AuthContext = {
  userId: string;
  name: string;
  email: string;
  roles: string[];
  permissions: ReadonlySet<Permission>;
  ip?: string | null;
  userAgent?: string | null;
};

export function can(ctx: Pick<AuthContext, "permissions">, p: Permission): boolean {
  return ctx.permissions.has(p);
}

export function canAny(ctx: Pick<AuthContext, "permissions">, ps: Permission[]): boolean {
  return ps.some((p) => ctx.permissions.has(p));
}

/** Verificação obrigatória no servidor. Lança erro "forbidden" se faltar a permissão. */
export function assertCan(ctx: Pick<AuthContext, "permissions">, p: Permission): void {
  if (!ctx.permissions.has(p)) throw forbidden();
}

export const auditMeta = (ctx: AuthContext) => ({ userId: ctx.userId, ip: ctx.ip, userAgent: ctx.userAgent });
