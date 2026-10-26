import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/** Token aleatório de 256 bits, codificado em base64url. */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// Argon2id com parâmetros recomendados pela OWASP (m=19 MiB, t=2, p=1).
const ARGON_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON_OPTS);
}

export async function verifyPassword(hashValue: string, password: string): Promise<boolean> {
  try {
    return await verify(hashValue, password);
  } catch {
    return false;
  }
}

/** Hash válido usado para equalizar o tempo de resposta quando o e-mail não existe. */
let dummyHash: Promise<string> | null = null;
export function getDummyHash() {
  dummyHash ??= hashPassword("dummy-password-for-timing");
  return dummyHash;
}

export const PASSWORD_MIN_LENGTH = 10;

/** Política de senha: mínimo 10 caracteres, com letras e números. */
export function checkPasswordPolicy(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (password.length > 128) return "A senha deve ter no máximo 128 caracteres.";
  if (!/[A-Za-zÀ-ÿ]/.test(password) || !/\d/.test(password)) return "A senha deve conter letras e números.";
  const local = email?.split("@")[0] ?? "";
  if (local.length >= 3 && password.toLowerCase().includes(local.toLowerCase()))
    return "A senha não pode conter o seu e-mail.";
  return null;
}
