import { z } from "zod";
import { isValidPhone, normalizePhone, normalizeZip, UFS } from "../domain/documents";

/** Converte "" em undefined (campos opcionais de formulário). */
export const optionalText = (max = 500) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim() : v),
    z.string().max(max, { error: `Máximo de ${max} caracteres.` }).optional(),
  );

export const requiredText = (label: string, min = 1, max = 300) =>
  z
    .string({ error: `${label} é obrigatório.` })
    .trim()
    .min(min, { error: min > 1 ? `${label} deve ter pelo menos ${min} caracteres.` : `${label} é obrigatório.` })
    .max(max, { error: `Máximo de ${max} caracteres.` });

export const optionalEmail = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : typeof v === "string" ? v.trim().toLowerCase() : v),
  z.email({ error: "E-mail inválido." }).max(254).optional(),
);

export const optionalPhone = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .refine(isValidPhone, { error: "Telefone inválido. Informe DDD + número." })
    .transform(normalizePhone)
    .optional(),
);

export const optionalZip = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .transform(normalizeZip)
    .refine((v) => /^\d{8}$/.test(v), { error: "CEP deve ter 8 dígitos." })
    .optional(),
);

export const uf = z.enum(UFS, { error: "Selecione a UF." });

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Converte FormData em objeto simples; chaves repetidas viram arrays. */
export function formDataToObject(fd: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    const value = typeof v === "string" ? v : v.name;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      (out[key] = (out[key] as unknown[] | undefined) ?? []);
      (out[key] as unknown[]).push(value);
    } else out[k] = value;
  }
  return out;
}

/** Erros do Zod → { campo: mensagem } (primeira mensagem de cada campo). */
export function zodFieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
