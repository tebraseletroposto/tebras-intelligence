"use client";
import { useState } from "react";
import { Alert, Badge } from "@/components/ui/misc";

type Field = { key: string; label: string; required?: boolean; unit?: string };
type Preview = {
  kind: "tabela"; target: string; mapping: Record<string, string | null>;
  preview: { headers: string[]; totalRows: number; validRows: number; invalidRows: number; duplicates: number; unmappedRequired: string[]; issueCount: number; issues: { row: number; field?: string; message: string; severity: string }[]; rows: { row: number; ok: boolean; values: Record<string, unknown> }[] };
  evie: { records: number; period: { start: string; end: string | null } | null; variables: string[]; spatialResolution: string; limitations: string[]; bbox: unknown } | null;
} | { kind: "geojson"; target: string; total: number; usable: number; sample: { name: string | null; cls: string }[] };

export function ImportWizard({ targets, sources, properties, indicators, isAdmin }: { targets: Record<string, { label: string; fields: Field[] }>; sources: [string, string][]; properties: [string, string][]; indicators: string[]; isAdmin: boolean }) {
  const [target, setTarget] = useState("charging_stations");
  const [source, setSource] = useState("importacao_csv");
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [pv, setPv] = useState<Preview | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState({ referenceDate: "", usageConditions: "", notes: "", visibility: "organizacao", indicatorFixed: "", quality: "desconhecida", propertyId: "" });

  async function send(etapa: "previa" | "confirmar", map: Record<string, string | null>) {
    if (!file) return;
    setBusy(true); setMsg(null);
    const fd = new FormData();
    fd.set("arquivo", file); fd.set("destino", target); fd.set("fonte", source); fd.set("etapa", etapa); fd.set("mapeamento", JSON.stringify(map));
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    try {
      const r = await fetch("/api/inteligencia/importacao", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) { setMsg({ kind: "error", text: j.error + (j.fieldErrors ? ` (${Object.values(j.fieldErrors).join(", ")})` : "") }); return; }
      if (etapa === "previa") { setPv(j.preview); if (j.preview.kind === "tabela") setMapping(j.preview.mapping); }
      else { setMsg({ kind: "success", text: `Importação ${j.result.status === "concluida" ? "concluída" : "concluída com erros"}: ${j.result.inserted} registro(s) gravado(s) de ${j.result.total}. ${j.result.invalid} inválido(s), ${j.result.duplicates} duplicado(s).` }); setPv(null); setFile(null); }
    } catch { setMsg({ kind: "error", text: "Falha de comunicação." }); } finally { setBusy(false); }
  }

  const fields = targets[target]?.fields ?? [];
  const sel = "h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm";
  return (
    <div className="space-y-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <div className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-3">
        <label className="text-xs text-zinc-600">1. Tipo de dado<select className={sel} value={target} onChange={(e) => { setTarget(e.target.value); setPv(null); setMapping({}); if (e.target.value === "evie") setSource("evie_uber"); else if (e.target.value.startsWith("osm_")) setSource("osm_extrato"); else if (e.target.value === "hub_operations") setSource("operacao_hubs"); }}>{Object.entries(targets).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
        <label className="text-xs text-zinc-600">2. Fonte dos dados<select className={sel} value={source} onChange={(e) => setSource(e.target.value)}>{sources.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-xs text-zinc-600">3. Arquivo (CSV, XLSX ou GeoJSON — máx. 15 MB)<input type="file" accept=".csv,.txt,.xlsx,.geojson,.json,.gpkg" className="mt-1 block w-full text-sm" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPv(null); setMapping({}); }} /></label>
        <div className="sm:col-span-3"><button disabled={!file || busy} onClick={() => send("previa", {})} className="h-9 rounded-md bg-ink px-4 text-sm text-white disabled:opacity-50">{busy ? "Processando…" : "Ler arquivo e gerar prévia"}</button><span className="ml-3 text-xs text-zinc-500">Nada é gravado na prévia.</span></div>
      </div>

      {pv?.kind === "geojson" && (
        <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
          <p><strong>{pv.usable}</strong> de {pv.total} feições utilizáveis.</p>
          <ul className="mt-2 text-xs text-zinc-600">{pv.sample.map((s, i) => <li key={i}>{s.name ?? "(sem nome)"} — {s.cls}</li>)}</ul>
        </div>
      )}

      {pv?.kind === "tabela" && (
        <>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="font-semibold">4. Mapeamento de colunas</p>
            <p className="text-xs text-zinc-500">Sugerido pelos nomes das colunas. Campos sem coluna ficam vazios (nunca inventados).</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{fields.map((f) => (
              <label key={f.key} className="text-xs text-zinc-600">{f.label}{f.unit ? ` (${f.unit})` : ""}{f.required && <span className="text-brand"> *</span>}
                <select className={sel} value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || null }))}><option value="">— sem coluna —</option>{pv.preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>))}</div>
            <button disabled={busy} onClick={() => send("previa", mapping)} className="mt-3 h-9 rounded-md border border-zinc-300 px-3 text-sm">Revalidar com este mapeamento</button>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">
            <p className="font-semibold">5. Prévia e validação</p>
            <div className="mt-2 flex flex-wrap gap-2"><Badge>{pv.preview.totalRows} linhas</Badge><Badge tone="success">{pv.preview.validRows} válidas</Badge><Badge tone="danger">{pv.preview.invalidRows} com erro</Badge><Badge tone="warning">{pv.preview.duplicates} duplicadas</Badge></div>
            {pv.preview.unmappedRequired.length > 0 && <Alert kind="error" className="mt-2">Campos obrigatórios sem coluna: {pv.preview.unmappedRequired.join(", ")}</Alert>}
            {pv.evie && <Alert kind="info" className="mt-2" title="Cobertura do arquivo EVIE">Período: {pv.evie.period ? `${pv.evie.period.start} a ${pv.evie.period.end ?? "?"}` : "não identificado"} · Resolução: {pv.evie.spatialResolution} · Variáveis: {pv.evie.variables.join(", ") || "nenhuma"}<ul className="mt-1 list-disc pl-5 text-xs">{pv.evie.limitations.map((l) => <li key={l}>{l}</li>)}</ul></Alert>}
            {pv.preview.issues.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-sm">{pv.preview.issueCount} ocorrência(s)</summary><ul className="mt-1 max-h-48 overflow-y-auto text-xs">{pv.preview.issues.map((i, k) => <li key={k} className={i.severity === "erro" ? "text-red-700" : "text-amber-800"}>Linha {i.row}{i.field ? ` · ${i.field}` : ""}: {i.message}</li>)}</ul></details>}
            <div className="mt-3 overflow-x-auto"><table className="min-w-full text-xs"><thead><tr><th className="p-1 text-left">Linha</th>{fields.map((f) => <th key={f.key} className="p-1 text-left">{f.label}</th>)}</tr></thead><tbody>{pv.preview.rows.map((r) => <tr key={r.row} className={r.ok ? "" : "bg-red-50"}><td className="p-1">{r.row}</td>{fields.map((f) => <td key={f.key} className="p-1">{r.values[f.key] === null ? <span className="text-zinc-400">—</span> : String(r.values[f.key])}</td>)}</tr>)}</tbody></table></div>
          </div>
        </>
      )}

      {pv && (
        <div className="grid gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:grid-cols-3">
          <p className="font-semibold sm:col-span-3">6. Proveniência e confirmação</p>
          <label className="text-xs text-zinc-600">Data de referência dos dados<input type="date" className={sel} value={extra.referenceDate} onChange={(e) => setExtra({ ...extra, referenceDate: e.target.value })} /></label>
          <label className="text-xs text-zinc-600">Qualidade da fonte<select className={sel} value={extra.quality} onChange={(e) => setExtra({ ...extra, quality: e.target.value })}><option value="alta">Alta</option><option value="media">Média</option><option value="baixa">Baixa</option><option value="desconhecida">Desconhecida</option></select></label>
          <label className="text-xs text-zinc-600">Visibilidade<select className={sel} value={extra.visibility} onChange={(e) => setExtra({ ...extra, visibility: e.target.value })}><option value="organizacao">Somente minha organização</option>{isAdmin && <option value="publico">Pública para todas as organizações</option>}</select></label>
          {target === "municipal_indicators" && <label className="text-xs text-zinc-600">Indicador (se o arquivo não tiver coluna)<select className={sel} value={extra.indicatorFixed} onChange={(e) => setExtra({ ...extra, indicatorFixed: e.target.value })}><option value="">— da coluna —</option>{indicators.map((i) => <option key={i}>{i}</option>)}</select></label>}
          {target === "hub_operations" && <label className="text-xs text-zinc-600">Hub (imóvel)<select className={sel} value={extra.propertyId} onChange={(e) => setExtra({ ...extra, propertyId: e.target.value })}><option value="">Selecione…</option>{properties.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select></label>}
          <label className="text-xs text-zinc-600 sm:col-span-3">Condições de uso / licença {target === "evie" && <span className="text-brand">* obrigatório para EVIE</span>}<input className={sel} value={extra.usageConditions} onChange={(e) => setExtra({ ...extra, usageConditions: e.target.value })} placeholder="Ex.: ODbL com atribuição; uso interno autorizado pela Uber conforme contrato X" /></label>
          <label className="text-xs text-zinc-600 sm:col-span-3">Observações<input className={sel} value={extra.notes} onChange={(e) => setExtra({ ...extra, notes: e.target.value })} /></label>
          <div className="flex gap-2 sm:col-span-3">
            <button disabled={busy} onClick={() => send("confirmar", mapping)} className="h-10 rounded-md bg-brand px-4 text-sm font-semibold text-white disabled:opacity-50">Confirmar e gravar registros válidos</button>
            <button onClick={() => { setPv(null); setMsg({ kind: "success", text: "Importação cancelada. Nada foi gravado." }); }} className="h-10 rounded-md border border-zinc-300 px-4 text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}
