/** Erros de domínio com mensagens seguras para exibição ao usuário. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: "validation" | "forbidden" | "not_found" | "conflict" | "unauthenticated" | "rule",
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = (msg = "Você não tem permissão para realizar esta ação.") => new AppError(msg, "forbidden");
export const notFound = (msg = "Registro não encontrado.") => new AppError(msg, "not_found");
export const conflict = (msg: string, fieldErrors?: Record<string, string>) => new AppError(msg, "conflict", fieldErrors);
export const validation = (msg: string, fieldErrors?: Record<string, string>) => new AppError(msg, "validation", fieldErrors);
export const ruleViolation = (msg: string) => new AppError(msg, "rule");

export function isPgUniqueViolation(e: unknown, constraint?: string): boolean {
  const err = (e as { cause?: unknown })?.cause ?? e;
  const pg = err as { code?: string; constraint?: string };
  return pg?.code === "23505" && (!constraint || pg.constraint === constraint);
}
