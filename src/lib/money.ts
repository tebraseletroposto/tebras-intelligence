/**
 * Valores monetários são manipulados em CENTAVOS inteiros para evitar erros de ponto flutuante.
 * No banco: numeric(14,2) (string). Quantidades: numeric(12,3).
 * Valor desconhecido é sempre `null` — nunca zero.
 */

/** "1234.56" | 1234.56 | null → 123456 | null */
export function toCents(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

/** 123456 → "1234.56" (formato aceito pelo PostgreSQL) */
export function centsToDb(c: number | null): string | null {
  if (c === null) return null;
  const sign = c < 0 ? "-" : "";
  const a = Math.abs(c);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

export const centsToNumber = (c: number | null) => (c === null ? null : c / 100);

/** Arredondamento half-up de qtd × preço unitário (centavos). */
export function lineTotalCents(quantity: number, unitCents: number): number {
  // multiplica com 3 casas da quantidade como inteiro para evitar erro binário
  const q = Math.round(quantity * 1000);
  return Math.round((q * unitCents) / 1000);
}

export type PricedItem = {
  quantity: string | number;
  unitPrice: string | number | null;
  unitCost?: string | number | null;
  billing: "unico" | "mensal" | string;
};

export type ProposalTotals = {
  /** Total de implantação (pagamento único); null se algum item único estiver sem preço */
  oneTimeCents: number | null;
  /** Total recorrente mensal; null se algum item mensal estiver sem preço */
  monthlyCents: number | null;
  /** Custo único conhecido; null se algum custo estiver pendente */
  oneTimeCostCents: number | null;
  monthlyCostCents: number | null;
  itemsWithoutPrice: number;
  itemsWithoutCost: number;
  /** Margem de contribuição sobre o preço (implantação), 0–1; null se preço ou custo indefinidos */
  oneTimeMarginRatio: number | null;
  monthlyMarginRatio: number | null;
};

export function computeTotals(items: PricedItem[]): ProposalTotals {
  const acc = { unico: { p: 0 as number | null, c: 0 as number | null }, mensal: { p: 0 as number | null, c: 0 as number | null } };
  let noPrice = 0;
  let noCost = 0;
  for (const it of items) {
    const b = it.billing === "mensal" ? acc.mensal : acc.unico;
    const q = Number(it.quantity);
    const up = toCents(it.unitPrice);
    const uc = toCents(it.unitCost ?? null);
    if (up === null) { noPrice++; b.p = null; } else if (b.p !== null) b.p += lineTotalCents(q, up);
    if (uc === null) { noCost++; b.c = null; } else if (b.c !== null) b.c += lineTotalCents(q, uc);
  }
  const hasMonthly = items.some((i) => i.billing === "mensal");
  const hasOne = items.some((i) => i.billing !== "mensal");
  const margin = (p: number | null, c: number | null) => (p === null || c === null || p === 0 ? null : (p - c) / p);
  return {
    oneTimeCents: hasOne ? acc.unico.p : 0,
    monthlyCents: hasMonthly ? acc.mensal.p : 0,
    oneTimeCostCents: hasOne ? acc.unico.c : 0,
    monthlyCostCents: hasMonthly ? acc.mensal.c : 0,
    itemsWithoutPrice: noPrice,
    itemsWithoutCost: noCost,
    oneTimeMarginRatio: hasOne ? margin(acc.unico.p, acc.unico.c) : null,
    monthlyMarginRatio: hasMonthly ? margin(acc.mensal.p, acc.mensal.c) : null,
  };
}

/** Valor total do contrato no prazo: implantação + mensal × meses. null se algo estiver indefinido. */
export function contractValueCents(oneTime: number | null, monthly: number | null, months: number | null): number | null {
  if (oneTime === null || monthly === null) return null;
  if (monthly === 0) return oneTime;
  if (!months) return null;
  return oneTime + monthly * months;
}

/** Converte entrada no padrão brasileiro ("1.234,56") para string do banco ("1234.56"); null se vazio/inválido. */
export function parseMoneyInput(input: unknown): string | null | "invalid" {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/^R\$\s*/, "");
  if (s === "") return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return "invalid";
  return centsToDb(Math.round(Number(normalized) * 100));
}

/** Quantidade no padrão brasileiro ("1,5") para string do banco ("1.5"). */
export function parseQuantityInput(input: unknown): string | null | "invalid" {
  if (input === null || input === undefined) return null;
  const s = String(input).trim();
  if (s === "") return null;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^\d+(\.\d{1,3})?$/.test(normalized) || Number(normalized) <= 0) return "invalid";
  return normalized;
}

/** "1234.5" → "1.234,50" (para preencher formulários) */
export function dbToInput(v: string | null | undefined, decimals = 2): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return new Intl.NumberFormat("pt-BR", { minimumFractionDigits: decimals === 2 ? 2 : 0, maximumFractionDigits: decimals, useGrouping: decimals === 2 }).format(n);
}
