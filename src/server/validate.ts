import type { ZodType } from "zod";
import { zodFieldErrors } from "@/lib/validation/common";
import { AppError } from "./errors";

/** Valida com Zod e lança erro de validação com mensagens por campo. */
export function formDataSafe<T>(schema: ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new AppError("Verifique os campos destacados.", "validation", zodFieldErrors(r.error));
  return r.data;
}
