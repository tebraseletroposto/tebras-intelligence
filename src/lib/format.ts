/** Formatação pt-BR: moeda BRL, datas DD/MM/AAAA e números no padrão brasileiro. */

export const APP_TIMEZONE = process.env.APP_TIMEZONE || "America/Sao_Paulo";

const dateFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const dateTimeFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIMEZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  // Data sem hora (coluna "date", AAAA-MM-DD): é uma data de calendário, não um instante.
  // Convertê-la em Date a interpretaria como meia-noite UTC (dia anterior no Brasil).
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  return dateFmt.format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  return dateTimeFmt.format(typeof d === "string" ? new Date(d) : d).replace(",", "");
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return brl.format(value);
}

export function formatNumber(value: number | null | undefined, fractionDigits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

/**
 * Converte texto no padrão brasileiro ("1.234,56") em número.
 * Retorna null para vazio ou inválido — nunca converte desconhecido em zero.
 */
export function parseBrazilianNumber(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/^R\$\s*/, "");
  if (s === "") return null;
  if (!/^-?[\d.]*(,\d+)?$/.test(s)) return null;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
