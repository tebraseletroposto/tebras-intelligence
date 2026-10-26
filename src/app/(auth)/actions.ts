"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { runAction } from "@/server/actions";
import { SESSION_COOKIE, sessionCookieOptions } from "@/server/auth/cookies";
import { getRequestMeta } from "@/server/auth/dal";
import { LOCKOUT_MINUTES, login, logout, resetPasswordWithToken } from "@/server/auth/service";

const loginSchema = z.object({
  email: z.string().trim().min(1, { error: "Informe o e-mail." }).max(254),
  password: z.string().min(1, { error: "Informe a senha." }).max(128),
});

export async function loginAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const raw = { email: fd.get("email"), password: fd.get("password") };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: "Informe e-mail e senha.", values: { email: raw.email } };

  const meta = await getRequestMeta();
  const result = await login(parsed.data.email, parsed.data.password, meta);
  if (!result.ok) {
    const message =
      result.reason === "locked"
        ? `Acesso temporariamente bloqueado por excesso de tentativas. Tente novamente em ${LOCKOUT_MINUTES} minutos ou procure o administrador.`
        : "E-mail ou senha inválidos.";
    return { ok: false, message, values: { email: parsed.data.email } };
  }
  (await cookies()).set(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresAt));
  redirect(result.mustChangePassword ? "/perfil/senha?obrigatorio=1" : "/");
}

export async function logoutAction() {
  const jar = await cookies();
  await logout(jar.get(SESSION_COOKIE)?.value, await getRequestMeta());
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

export async function resetPasswordAction(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const token = String(fd.get("token") ?? "");
  const pw = String(fd.get("newPassword") ?? "");
  if (pw !== String(fd.get("confirmPassword") ?? ""))
    return { ok: false, fieldErrors: { confirmPassword: "As senhas não conferem." } };
  const res = await runAction(async () => {
    await resetPasswordWithToken(token, pw, await getRequestMeta());
  });
  if (res.ok) redirect("/login?redefinida=1");
  return res;
}
