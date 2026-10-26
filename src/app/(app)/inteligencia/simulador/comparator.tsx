"use client";
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { forecastDemand, type DemandAssumptions } from "@/lib/intel/demand";
import { CHARGER_CATEGORIES, simulateInfrastructure, type ChargerLine, type SiteElectrical } from "@/lib/intel/infrastructure";
import { assessLowVoltage, LV_CLASSES } from "@/lib/intel/low-voltage";

type Alt = { name: string; qty: Record<string, number> };
const PRESETS: Alt[] = [
  { name: "1×60 kW DC + 2×7 kW AC", qty: { dc60: 1, ac7: 2 } },
  { name: "1×60 kW DC + 1×22 kW AC", qty: { dc60: 1, ac22: 1 } },
  { name: "2×60 kW DC", qty: { dc60: 2 } },
  { name: "2×22 kW AC + 4×7 kW AC", qty: { ac22: 2, ac7: 4 } },
];
const fmt = (n: number | null, d = 0) => (n === null ? "—" : n.toLocaleString("pt-BR", { maximumFractionDigits: d, minimumFractionDigits: d }));
const brl = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function ConfigComparator({ initial, source }: { initial: { assumptions: DemandAssumptions; site: SiteElectrical; costs: Record<string, { unit: number | null; install: number | null }>; energyCost: number | null; fixedMonthly: number | null; pctCosts: number }; source: string }) {
  const [alts, setAlts] = useState<Alt[]>(PRESETS);
  const [a, setA] = useState({ bev: fmt(initial.assumptions.bevFleet ?? null), comp: String(initial.assumptions.competitors ?? 0), price: String(initial.assumptions.pricePerKwh), kwh: String(initial.assumptions.kwhPerSession), avail: initial.site.availableKw === null ? "" : String(initial.site.availableKw), dlm: initial.site.dynamicLoadManagement, energyCost: initial.energyCost === null ? "" : String(initial.energyCost), fixed: initial.fixedMonthly === null ? "" : String(initial.fixedMonthly), pct: String(Math.round(initial.pctCosts * 1000) / 10) });
  const [costs, setCosts] = useState(Object.fromEntries(CHARGER_CATEGORIES.map((c) => [c.key, { unit: initial.costs[c.key]?.unit == null ? "" : String(initial.costs[c.key].unit), install: initial.costs[c.key]?.install == null ? "" : String(initial.costs[c.key].install) }])));

  const results = useMemo(() => {
    const site: SiteElectrical = { ...initial.site, availableKw: num(a.avail), dynamicLoadManagement: a.dlm };
    const assumptions: DemandAssumptions = { ...initial.assumptions, bevFleet: num(a.bev.replace(/\./g, "")), competitors: num(a.comp), pricePerKwh: num(a.price) ?? 0, kwhPerSession: num(a.kwh) ?? 25 };
    return alts.map((alt) => {
      const lines: ChargerLine[] = CHARGER_CATEGORIES.filter((c) => (alt.qty[c.key] ?? 0) > 0).map((c) => ({ label: c.label, powerKw: c.powerKw, current: c.current, quantity: alt.qty[c.key], unitCost: num(costs[c.key].unit), installCost: num(costs[c.key].install), efficiency: null }));
      const infra = simulateInfrastructure(lines, site);
      const fc = forecastDemand(assumptions, lines, site);
      const ec = num(a.energyCost);
      const fixed = num(a.fixed);
      const pctCosts = (num(a.pct) ?? 0) / 100;
      const op = fc.energyPerMonthKwh === null || ec === null || fixed === null ? null : fc.energyPerMonthKwh * assumptions.pricePerKwh * (1 - pctCosts) - fc.energyPerMonthKwh * ec - fixed;
      const lv = assessLowVoltage({ supplyVoltageV: null, phases: null, availableKw: site.availableKw, existingLoadKw: null, projectedSimultaneousKw: infra.simultaneousKw, distanceToSupplyM: null, hasTransformer: null, utilityStatement: null, engineerOpinion: null, dynamicLoadManagement: site.dynamicLoadManagement });
      const violates = infra.powerShortfallKw !== null && infra.powerShortfallKw > 0 && !site.dynamicLoadManagement;
      const confidence = fc.path === "sem_dados" ? "insuficiente" : infra.capex.total === null || site.availableKw === null ? "baixa" : "média";
      return { alt, infra, fc, op, lv, violates, confidence };
    });
  }, [alts, a, costs, initial]);
  const feasible = results.filter((r) => !r.violates && r.op !== null);
  const best = feasible.length ? feasible.reduce((x, y) => ((y.op ?? -Infinity) - (y.infra.capex.total ?? 0) / 120 > (x.op ?? -Infinity) - (x.infra.capex.total ?? 0) / 120 ? y : x)) : null;
  const inp = "h-9 w-full rounded-md border border-zinc-300 px-2 text-sm tabular";

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold">Premissas comuns <span className="font-normal text-zinc-500">— origem: {source}</span></p>
        <div className="mt-2 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <label className="text-xs text-zinc-600">Frota BEV<input className={inp} value={a.bev} onChange={(e) => setA({ ...a, bev: e.target.value })} placeholder="sem dados" /></label>
          <label className="text-xs text-zinc-600">Concorrentes<input className={inp} value={a.comp} onChange={(e) => setA({ ...a, comp: e.target.value })} /></label>
          <label className="text-xs text-zinc-600">Preço (R$/kWh)<input className={inp} value={a.price} onChange={(e) => setA({ ...a, price: e.target.value })} /></label>
          <label className="text-xs text-zinc-600">kWh por sessão<input className={inp} value={a.kwh} onChange={(e) => setA({ ...a, kwh: e.target.value })} /></label>
          <label className="text-xs text-zinc-600">Potência disponível (kW)<input className={inp} value={a.avail} onChange={(e) => setA({ ...a, avail: e.target.value })} placeholder="desconhecida" /></label>
          <label className="text-xs text-zinc-600">Tarifa de energia (R$/kWh)<input className={inp} value={a.energyCost} onChange={(e) => setA({ ...a, energyCost: e.target.value })} placeholder="não informada" /></label>
          <label className="text-xs text-zinc-600">Custos fixos/mês (R$)<input className={inp} value={a.fixed} onChange={(e) => setA({ ...a, fixed: e.target.value })} placeholder="não informados" /></label>
          <label className="text-xs text-zinc-600">Tributos+taxas (% receita)<input className={inp} value={a.pct} onChange={(e) => setA({ ...a, pct: e.target.value })} /></label>
          <label className="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={a.dlm} onChange={(e) => setA({ ...a, dlm: e.target.checked })} /> Gerenciamento de carga</label>
        </div>
        <details className="mt-3"><summary className="cursor-pointer text-sm font-medium">Custos por categoria (cotações)</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">{CHARGER_CATEGORIES.map((c) => <div key={c.key} className="grid grid-cols-[5rem_1fr_1fr] items-center gap-2 text-xs"><span>{c.label}</span><input aria-label={`Custo ${c.label}`} className={inp} placeholder="equip. R$" value={costs[c.key].unit} onChange={(e) => setCosts({ ...costs, [c.key]: { ...costs[c.key], unit: e.target.value } })} /><input aria-label={`Instalação ${c.label}`} className={inp} placeholder="instal. R$" value={costs[c.key].install} onChange={(e) => setCosts({ ...costs, [c.key]: { ...costs[c.key], install: e.target.value } })} /></div>)}</div>
        </details>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase text-zinc-600"><tr><th className="p-3">Alternativa</th><th className="p-3 text-right">Instalada</th><th className="p-3 text-right">Simultânea</th><th className="p-3 text-right">Investimento</th><th className="p-3 text-right">Energia máx. teórica/mês</th><th className="p-3 text-right">Energia projetada/mês</th><th className="p-3 text-right">Receita/mês</th><th className="p-3 text-right">Margem operacional/mês</th><th className="p-3">Dependências elétricas</th><th className="p-3">Confiança</th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{results.map((r, i) => (
            <tr key={i} className={cn(best === r && "bg-brand-50")}>
              <td className="p-3"><input aria-label="Nome da alternativa" className="w-48 rounded border border-transparent px-1 font-medium hover:border-zinc-300" value={r.alt.name} onChange={(e) => setAlts((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                <div className="mt-1 flex flex-wrap gap-1">{CHARGER_CATEGORIES.map((c) => <label key={c.key} className="flex items-center gap-1 text-[11px] text-zinc-600">{c.label.replace(" ", "")}<input type="number" min={0} max={50} aria-label={`Quantidade ${c.label}`} className="w-11 rounded border border-zinc-300 px-1" value={r.alt.qty[c.key] ?? 0} onChange={(e) => setAlts((x) => x.map((y, j) => (j === i ? { ...y, qty: { ...y.qty, [c.key]: Number(e.target.value) } } : y)))} /></label>)}</div>
                {best === r && <p className="mt-1 text-xs font-bold text-brand">Melhor resultado dentro das restrições</p>}
                {r.violates && <p className="mt-1 text-xs font-semibold text-red-700">Excede a potência disponível sem gerenciamento de carga</p>}
                <button type="button" className="mt-1 text-[11px] text-zinc-500 hover:text-red-700" onClick={() => setAlts((x) => x.filter((_, j) => j !== i))}>remover</button></td>
              <td className="p-3 text-right tabular">{fmt(r.infra.installedKw)} kW</td>
              <td className="p-3 text-right tabular">{fmt(r.infra.simultaneousKw, 1)} kW</td>
              <td className="p-3 text-right tabular">{r.infra.capex.total === null ? <span className="text-amber-700">não cotado</span> : brl(r.infra.capex.total)}</td>
              <td className="p-3 text-right tabular">{fmt(r.infra.maxMonthlyEnergyKwh)} kWh</td>
              <td className="p-3 text-right tabular">{r.fc.energyPerMonthKwh === null ? "sem dados" : `${fmt(r.fc.energyPerMonthKwh)} kWh`}{r.fc.capacityLimited && <span className="block text-[11px] text-amber-700">limitada pela capacidade</span>}</td>
              <td className="p-3 text-right tabular">{brl(r.fc.grossRevenueMonth)}</td>
              <td className={cn("p-3 text-right tabular", r.op !== null && r.op < 0 && "text-red-700")}>{r.op === null ? <span className="text-zinc-500">informe tarifa e custos</span> : brl(r.op)}</td>
              <td className="p-3 text-xs">{LV_CLASSES[r.lv.classification].label}{r.infra.limitations.slice(0, 1).map((l) => <span key={l} className="block text-zinc-500">{l}</span>)}</td>
              <td className="p-3 text-xs">{r.confidence}</td>
            </tr>))}</tbody>
        </table>
      </div>
      <button type="button" onClick={() => setAlts((x) => [...x, { name: `Alternativa ${x.length + 1}`, qty: { dc30: 1 } }])} className="rounded-md border border-dashed border-zinc-400 px-3 py-1.5 text-sm hover:border-brand hover:text-brand">+ Adicionar combinação personalizada</button>
      <p className="text-xs text-zinc-500">Critério: maior margem operacional mensal menos o investimento amortizado em 120 meses, excluindo alternativas que excedem a potência disponível sem gerenciamento de carga. Não é necessariamente a de maior potência. Resultados preliminares; a margem aqui é simplificada — use o estudo completo para fluxo de caixa, financiamento e impostos.</p>
    </div>
  );
}
