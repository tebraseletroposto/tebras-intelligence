import { parseCoordinates } from "./geo";

/**
 * Importação manual de dados (seção 5.3). Parser de CSV próprio (RFC 4180 + ";" brasileiro),
 * mapeamento de colunas configurável, validação de tipos/unidades, duplicidades e prévia.
 * O arquivo original é preservado no banco (imported_datasets) para rastreabilidade.
 */

export const MAX_IMPORT_BYTES = 15 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;

export function detectDelimiter(text: string): "," | ";" | "\t" {
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const count = (c: string) => first.split(c).length - 1;
  const c = { ",": count(","), ";": count(";"), "\t": count("\t") };
  return (Object.entries(c).sort((a, b) => b[1] - a[1])[0][0] as "," | ";" | "\t");
}

export function parseCsv(text: string, delimiter?: string): string[][] {
  const d = delimiter ?? detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQ = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === d) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && s[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/**
 * Converte número em formato brasileiro ou internacional ("1.234,5" | "1234.5" | "1,5").
 * Ambiguidade "12.000": em valores comuns é milhar brasileiro (12000); em coordenadas (`decimalPoint`)
 * o ponto é sempre decimal (-23.561).
 */
export function parseNumberBR(v: unknown, opts: { decimalPoint?: boolean } = {}): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let t = v.trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  if (opts.decimalPoint) t = t.replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) t = t.replace(",", ".");
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Datas DD/MM/AAAA, AAAA-MM-DD ou AAAA-MM → ISO (AAAA-MM-DD). */
export function parseDateBR(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v !== "string") return null;
  const t = v.trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t);
  if (m) return valid(`${m[3]}-${m[2]}-${m[1]}`);
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return valid(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{4})-(\d{2})$/.exec(t);
  if (m) return valid(`${m[1]}-${m[2]}-01`);
  m = /^(\d{2})\/(\d{4})$/.exec(t);
  if (m) return valid(`${m[2]}-${m[1]}-01`);
  return null;
}
function valid(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export type FieldType = "text" | "number" | "date" | "lat" | "lng" | "integer" | "boolean";
export type TargetField = { key: string; label: string; type: FieldType; required?: boolean; unit?: string; aliases: string[] };

/** Destinos de importação suportados. Cada um declara os campos internos. */
export const IMPORT_TARGETS = {
  charging_stations: {
    label: "Carregadores existentes",
    fields: [
      { key: "name", label: "Nome do estabelecimento", type: "text", aliases: ["nome", "name", "estabelecimento", "local"] },
      { key: "address", label: "Endereço", type: "text", aliases: ["endereco", "endereço", "address", "logradouro"] },
      { key: "lat", label: "Latitude", type: "lat", required: true, aliases: ["lat", "latitude", "y"] },
      { key: "lng", label: "Longitude", type: "lng", required: true, aliases: ["lng", "lon", "long", "longitude", "x"] },
      { key: "operator", label: "Operador", type: "text", aliases: ["operador", "operator", "rede", "empresa"] },
      { key: "maxPowerKw", label: "Potência máxima", type: "number", unit: "kW", aliases: ["potencia", "potência", "power", "kw", "potencia_kw"] },
      { key: "connectors", label: "Conectores", type: "integer", aliases: ["conectores", "connectors", "pontos", "qtd_conectores"] },
      { key: "currentType", label: "Tipo (AC/DC)", type: "text", aliases: ["tipo", "corrente", "ac_dc", "current"] },
      { key: "connectorStandard", label: "Padrão de conexão", type: "text", aliases: ["padrao", "padrão", "plug", "conector"] },
      { key: "pricePerKwh", label: "Preço", type: "number", unit: "R$/kWh", aliases: ["preco", "preço", "price", "preco_kwh"] },
      { key: "openingHours", label: "Horário", type: "text", aliases: ["horario", "horário", "hours", "funcionamento"] },
      { key: "verifiedAt", label: "Data de verificação", type: "date", aliases: ["verificado_em", "data_verificacao", "data", "atualizado_em"] },
      { key: "externalId", label: "Identificador na fonte", type: "text", aliases: ["id", "codigo", "código", "external_id"] },
    ],
  },
  properties: {
    label: "Imóveis/terrenos",
    fields: [
      { key: "name", label: "Nome/identificação", type: "text", required: true, aliases: ["nome", "name", "imovel", "imóvel", "terreno"] },
      { key: "address", label: "Endereço", type: "text", aliases: ["endereco", "endereço", "address"] },
      { key: "city", label: "Município", type: "text", aliases: ["municipio", "município", "cidade", "city"] },
      { key: "state", label: "UF", type: "text", aliases: ["uf", "estado", "state"] },
      { key: "zip", label: "CEP", type: "text", aliases: ["cep", "zip"] },
      { key: "lat", label: "Latitude", type: "lat", aliases: ["lat", "latitude"] },
      { key: "lng", label: "Longitude", type: "lng", aliases: ["lng", "lon", "longitude"] },
      { key: "areaM2", label: "Área", type: "number", unit: "m²", aliases: ["area", "área", "area_m2"] },
      { key: "monthlyRent", label: "Aluguel mensal", type: "number", unit: "R$", aliases: ["aluguel", "rent", "aluguel_mensal"] },
      { key: "salePrice", label: "Valor de venda", type: "number", unit: "R$", aliases: ["venda", "valor_venda", "preco_venda"] },
    ],
  },
  municipal_indicators: {
    label: "Indicadores municipais (frota SENATRAN/DETRAN, IBGE etc.)",
    fields: [
      { key: "ibgeCode", label: "Código IBGE do município", type: "integer", aliases: ["cod_ibge", "codigo_ibge", "ibge", "cod_municipio", "código ibge"] },
      { key: "municipality", label: "Nome do município (se não houver código IBGE)", type: "text", aliases: ["municipio", "município", "cidade", "nome_municipio"] },
      { key: "uf", label: "UF", type: "text", aliases: ["uf", "estado", "sigla_uf"] },
      { key: "indicator", label: "Indicador", type: "text", aliases: ["indicador", "variavel", "variável"] },
      { key: "value", label: "Valor", type: "number", required: true, aliases: ["valor", "value", "quantidade", "total"] },
      { key: "referenceDate", label: "Data de referência", type: "date", required: true, aliases: ["data", "referencia", "referência", "mes", "mês", "periodo"] },
    ],
  },
  hub_operations: {
    label: "Operação dos hubs próprios (sessões e energia diárias)",
    fields: [
      { key: "date", label: "Data", type: "date", required: true, aliases: ["data", "date", "dia"] },
      { key: "sessions", label: "Sessões", type: "integer", required: true, aliases: ["sessoes", "sessões", "sessions"] },
      { key: "energyKwh", label: "Energia", type: "number", required: true, unit: "kWh", aliases: ["energia", "kwh", "energy", "energia_kwh"] },
    ],
  },
  evie: {
    label: "Arquivo autorizado do EVIE (Uber) — mapeamento configurável",
    fields: [
      { key: "areaId", label: "Identificador da área/célula", type: "text", aliases: ["h3", "hex_id", "cell_id", "area_id", "zona"] },
      { key: "lat", label: "Latitude do centróide", type: "lat", aliases: ["lat", "latitude", "centroid_lat"] },
      { key: "lng", label: "Longitude do centróide", type: "lng", aliases: ["lng", "lon", "longitude", "centroid_lng"] },
      { key: "demandKwhDay", label: "Demanda estimada", type: "number", unit: "kWh/dia", aliases: ["demand_kwh_day", "kwh_dia", "demanda_kwh"] },
      { key: "sessionsDay", label: "Sessões estimadas", type: "number", unit: "sessões/dia", aliases: ["sessions_day", "sessoes_dia"] },
      { key: "score", label: "Indicador relativo (0–1 ou 0–100)", type: "number", aliases: ["score", "indice", "índice", "potential"] },
      { key: "periodStart", label: "Início do período", type: "date", aliases: ["period_start", "inicio", "start_date"] },
      { key: "periodEnd", label: "Fim do período", type: "date", aliases: ["period_end", "fim", "end_date"] },
    ],
  },
} as const satisfies Record<string, { label: string; fields: TargetField[] }>;
export type ImportTarget = keyof typeof IMPORT_TARGETS;

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[\s-]+/g, "_");

/** Sugere o mapeamento coluna→campo por nomes conhecidos. Colunas não reconhecidas ficam sem mapeamento (nunca inventadas). */
export function suggestMapping(headers: string[], target: ImportTarget): Record<string, string | null> {
  const fields = IMPORT_TARGETS[target].fields as readonly TargetField[];
  const out: Record<string, string | null> = {};
  for (const f of fields) {
    const idx = headers.findIndex((h) => norm(h) === norm(f.key) || f.aliases.some((a) => norm(a) === norm(h)));
    out[f.key] = idx >= 0 ? headers[idx] : null;
  }
  return out;
}

export type RowIssue = { row: number; field?: string; message: string; severity: "erro" | "aviso" };
export type ValidatedRow = { row: number; values: Record<string, string | number | boolean | null>; ok: boolean };

export type ImportPreview = {
  target: ImportTarget;
  headers: string[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  issues: RowIssue[];
  rows: ValidatedRow[];
  unmappedRequired: string[];
};

const coerce = (type: FieldType, raw: unknown): { v: string | number | boolean | null; err?: string } => {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return { v: null };
  switch (type) {
    case "number": case "lat": case "lng": {
      const n = parseNumberBR(raw, { decimalPoint: type !== "number" });
      return n === null ? { v: null, err: "número inválido" } : { v: n };
    }
    case "integer": {
      const n = parseNumberBR(raw);
      return n === null || !Number.isInteger(n) ? { v: null, err: "inteiro inválido" } : { v: n };
    }
    case "date": {
      const d = parseDateBR(raw);
      return d === null ? { v: null, err: "data inválida" } : { v: d };
    }
    case "boolean": {
      const t = String(raw).trim().toLowerCase();
      if (["sim", "s", "true", "1", "yes"].includes(t)) return { v: true };
      if (["nao", "não", "n", "false", "0", "no"].includes(t)) return { v: false };
      return { v: null, err: "valor sim/não inválido" };
    }
    default: return { v: String(raw).trim().slice(0, 1000) };
  }
};

/** Valida as linhas mapeadas. Registros com erro são excluídos da gravação; avisos não bloqueiam. */
export function validateImport(target: ImportTarget, headers: string[], records: unknown[][], mapping: Record<string, string | null>): ImportPreview {
  const fields = IMPORT_TARGETS[target].fields as readonly TargetField[];
  const issues: RowIssue[] = [];
  const unmappedRequired = fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
  const colIdx = Object.fromEntries(fields.map((f) => [f.key, mapping[f.key] ? headers.indexOf(mapping[f.key] as string) : -1]));
  const seen = new Map<string, number>();
  let duplicates = 0;
  const rows: ValidatedRow[] = records.slice(0, MAX_IMPORT_ROWS).map((rec, i) => {
    const rowNo = i + 2; // linha 1 = cabeçalho
    const values: ValidatedRow["values"] = {};
    let ok = unmappedRequired.length === 0;
    for (const f of fields) {
      const idx = colIdx[f.key];
      const { v, err } = coerce(f.type, idx >= 0 ? rec[idx] : null);
      values[f.key] = v;
      if (err) { issues.push({ row: rowNo, field: f.label, message: err, severity: "erro" }); ok = false; }
      else if (f.required && v === null && idx >= 0) { issues.push({ row: rowNo, field: f.label, message: "campo obrigatório vazio", severity: "erro" }); ok = false; }
    }
    if ("lat" in values || "lng" in values) {
      if (values.lat !== null || values.lng !== null) {
        const c = parseCoordinates(values.lat, values.lng);
        if (!c.ok) { issues.push({ row: rowNo, field: "Coordenadas", message: c.error, severity: "erro" }); ok = false; }
        else if (c.outsideBrazil) issues.push({ row: rowNo, field: "Coordenadas", message: "fora do território brasileiro (verifique inversão lat/lng)", severity: "aviso" });
      }
    }
    if (target === "charging_stations" && typeof values.maxPowerKw === "number" && values.maxPowerKw > 1000) {
      issues.push({ row: rowNo, field: "Potência", message: "acima de 1000 kW — provável unidade em W", severity: "erro" }); ok = false;
    }
    if (target === "municipal_indicators" && values.ibgeCode === null && (values.municipality === null || values.uf === null)) {
      issues.push({ row: rowNo, field: "Município", message: "informe o código IBGE ou o nome do município com a UF", severity: "erro" }); ok = false;
    }
    if (target === "charging_stations" && values.verifiedAt === null) issues.push({ row: rowNo, field: "Data de verificação", message: "ausente — registro será marcado como não verificado", severity: "aviso" });
    if (target === "hub_operations" && typeof values.energyKwh === "number" && typeof values.sessions === "number" && values.sessions > 0 && values.energyKwh / values.sessions > 200) {
      issues.push({ row: rowNo, field: "Energia", message: "mais de 200 kWh por sessão — provável unidade em Wh", severity: "erro" }); ok = false;
    }
    const key = dedupKey(target, values);
    if (key) {
      if (seen.has(key)) { duplicates++; issues.push({ row: rowNo, message: `duplicado da linha ${seen.get(key)}`, severity: "aviso" }); ok = false; }
      else seen.set(key, rowNo);
    }
    return { row: rowNo, values, ok };
  });
  if (records.length > MAX_IMPORT_ROWS) issues.push({ row: 0, message: `Arquivo com ${records.length} linhas; apenas as primeiras ${MAX_IMPORT_ROWS} serão processadas.`, severity: "aviso" });
  const validRows = rows.filter((r) => r.ok).length;
  return { target, headers, totalRows: rows.length, validRows, invalidRows: rows.length - validRows, duplicates, issues, rows, unmappedRequired };
}

function dedupKey(target: ImportTarget, v: ValidatedRow["values"]): string | null {
  const r5 = (x: unknown) => (typeof x === "number" ? x.toFixed(5) : "");
  switch (target) {
    case "charging_stations": return v.externalId ? `id:${v.externalId}` : v.lat !== null ? `${r5(v.lat)},${r5(v.lng)},${String(v.name ?? "").toLowerCase()}` : null;
    case "properties": return `${String(v.name).toLowerCase()}|${String(v.address ?? "").toLowerCase()}`;
    case "municipal_indicators": return `${v.ibgeCode ?? `${String(v.municipality).toLowerCase()}/${v.uf}`}|${v.indicator}|${v.referenceDate}`;
    case "hub_operations": return String(v.date);
    case "evie": return v.areaId ? `a:${v.areaId}|${v.periodStart}` : v.lat !== null ? `${r5(v.lat)},${r5(v.lng)}|${v.periodStart}` : null;
  }
}

/** Resumo de cobertura de um arquivo EVIE (seção 7.3): período, extensão e variáveis disponíveis. */
export function summarizeEvie(p: ImportPreview) {
  const ok = p.rows.filter((r) => r.ok);
  const lats = ok.map((r) => r.values.lat).filter((x): x is number => typeof x === "number");
  const lngs = ok.map((r) => r.values.lng).filter((x): x is number => typeof x === "number");
  const starts = ok.map((r) => r.values.periodStart).filter((x): x is string => typeof x === "string").sort();
  const ends = ok.map((r) => r.values.periodEnd).filter((x): x is string => typeof x === "string").sort();
  const vars = ["demandKwhDay", "sessionsDay", "score"].filter((k) => ok.some((r) => r.values[k] !== null));
  return {
    records: ok.length,
    bbox: lats.length ? { minLat: Math.min(...lats), maxLat: Math.max(...lats), minLng: Math.min(...lngs), maxLng: Math.max(...lngs) } : null,
    period: starts.length ? { start: starts[0], end: ends.length ? ends[ends.length - 1] : null } : null,
    variables: vars,
    spatialResolution: ok.some((r) => r.values.areaId) ? "Áreas/células identificadas pela fonte" : lats.length ? "Pontos (centróides)" : "Desconhecida",
    limitations: [
      "Dados agregados por área: não representam trajetos nem localizações individuais.",
      ...(vars.length === 0 ? ["Nenhuma variável de demanda mapeada — o arquivo não pode alimentar o modelo."] : []),
      ...(lats.length === 0 ? ["Sem coordenadas: o vínculo geográfico depende da tabela de áreas da fonte."] : []),
    ],
  };
}
