/**
 * Validação e formatação de documentos brasileiros.
 *
 * CNPJ: suporta o formato numérico tradicional e o CNPJ alfanumérico (IN RFB nº 2.229/2024,
 * em vigor a partir de julho/2026). As 12 primeiras posições podem conter [0-9A-Z];
 * os 2 dígitos verificadores continuam numéricos. O valor de cada caractere é
 * (código ASCII − 48), o que mantém compatibilidade com o cálculo numérico antigo.
 */

/** Remove máscara e normaliza para maiúsculas. */
export function normalizeDocument(value: string): string {
  return value.replace(/[^0-9a-zA-Z]/g, "").toUpperCase();
}

function allSameChar(s: string) {
  return /^(.)\1+$/.test(s);
}

export function isValidCpf(input: string): boolean {
  const cpf = normalizeDocument(input);
  if (!/^\d{11}$/.test(cpf) || allSameChar(cpf)) return false;
  const digits = cpf.split("").map(Number);
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += digits[i] * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === digits[9] && calc(10) === digits[10];
}

export function isValidCnpj(input: string): boolean {
  const cnpj = normalizeDocument(input);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || allSameChar(cnpj)) return false;
  const values = cnpj.split("").map((c) => c.charCodeAt(0) - 48);
  const calc = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += values[i] * weights[i];
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === values[12] && calc(13) === values[13];
}

export function formatCpf(value: string): string {
  const v = normalizeDocument(value);
  return v.length === 11 ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}` : value;
}

export function formatCnpj(value: string): string {
  const v = normalizeDocument(value);
  return v.length === 14
    ? `${v.slice(0, 2)}.${v.slice(2, 5)}.${v.slice(5, 8)}/${v.slice(8, 12)}-${v.slice(12)}`
    : value;
}

export function formatDocument(value: string | null | undefined, kind: "PF" | "PJ" | string): string {
  if (!value) return "";
  return kind === "PF" ? formatCpf(value) : formatCnpj(value);
}

/** Máscara para quem não tem permissão de ver o documento completo (LGPD). */
export function maskDocument(value: string | null | undefined, kind: "PF" | "PJ" | string): string {
  if (!value) return "";
  const v = normalizeDocument(value);
  if (kind === "PF" && v.length === 11) return `***.${v.slice(3, 6)}.***-**`;
  if (v.length === 14) return `${v.slice(0, 2)}.***.***/${v.slice(8, 12)}-**`;
  return "***";
}

/** CEP: 8 dígitos. */
export function normalizeZip(value: string): string {
  return value.replace(/\D/g, "");
}
export function formatZip(value: string | null | undefined): string {
  if (!value) return "";
  const v = normalizeZip(value);
  return v.length === 8 ? `${v.slice(0, 5)}-${v.slice(5)}` : value;
}

/** Telefone brasileiro: mantém apenas dígitos; aceita 10 ou 11 dígitos (com DDD), opcionalmente com 55. */
export function normalizePhone(value: string): string {
  let v = value.replace(/\D/g, "");
  if (v.length > 11 && v.startsWith("55")) v = v.slice(2);
  return v;
}
export function isValidPhone(value: string): boolean {
  const v = normalizePhone(value);
  return /^[1-9]{2}9?\d{8}$/.test(v);
}
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  const v = normalizePhone(value);
  if (v.length === 11) return `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
  if (v.length === 10) return `(${v.slice(0, 2)}) ${v.slice(2, 6)}-${v.slice(6)}`;
  return value;
}

export const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
