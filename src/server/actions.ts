import "server-only";
import { randomUUID } from "node:crypto";
import { unstable_rethrow } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { logEvent } from "./audit";
import { AppError } from "./errors";

/**
 * Executa a lógica de uma Server Action com tratamento padronizado de erros:
 * - Erros de domínio (AppError) viram mensagens amigáveis + erros por campo.
 * - Erros inesperados são registrados no servidor com um código de referência e
 *   NUNCA têm detalhes técnicos expostos ao usuário.
 * - redirect()/notFound() do Next são repassados.
 */
export async function runAction(fn: () => Promise<ActionState | void>, values?: Record<string, unknown>): Promise<ActionState> {
  try {
    return { ...((await fn()) ?? { ok: true }), ts: Date.now() };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) {
      if (e.code === "forbidden") await logEvent({ action: "access.denied", summary: e.message }).catch(() => {});
      return { ok: false, message: e.message, fieldErrors: e.fieldErrors, values: sanitize(values), ts: Date.now() };
    }
    const ref = randomUUID().slice(0, 8);
    console.error(`[erro ${ref}]`, e);
    return { ok: false, message: `Ocorreu um erro inesperado. Tente novamente ou informe o código ${ref} ao suporte.`, values: sanitize(values), ts: Date.now() };
  }
}

/** Nunca devolve senhas ao cliente. */
function sanitize(values?: Record<string, unknown>) {
  if (!values) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) if (!/password|senha|token/i.test(k)) out[k] = v;
  return out;
}
