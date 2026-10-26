"use client";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/misc";
import { SelectInput, TextInput } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { ASSUMPTION_LABELS, SCENARIO_KEYS, SCENARIO_LABELS } from "@/lib/intel/demand";
import { CHARGER_CATEGORIES } from "@/lib/intel/infrastructure";
import type { StudyChargers, StudyDemand, StudyElectrical, StudyFinance, StudySite } from "@/lib/intel/study-schema";

type Act = (p: ActionState, fd: FormData) => Promise<ActionState>;
const cell = "h-9 w-full rounded-md border border-zinc-300 px-2 text-sm tabular disabled:bg-zinc-100";
/** Campo numérico que aceita vazio (= não informado) e vírgula decimal. */
const toNum = (s: string): number | null => {
  const t = s.trim();
  if (t === "") return null;
  // "1.234,56" e "12.000" (pt-BR, milhar) ou "0.94" (ponto decimal)
  if (t.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, "").replace(",", "."));
  return Number(t);
};
const fromNum = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const pct = (n: number) => String(Math.round(n * 10000) / 100).replace(".", ",");
const fromPct = (s: string) => (toNum(s) ?? 0) / 100;

function JsonForm({ action, value, children, disabled }: { action: Act; value: unknown; children: React.ReactNode; disabled?: boolean }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="json" value={JSON.stringify(value)} />
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}{state.fieldErrors && <ul className="mt-1 list-disc pl-5 text-xs">{Object.entries(state.fieldErrors).map(([k, v]) => <li key={k}>{k}: {v}</li>)}</ul>}</Alert>}
      <fieldset disabled={disabled} className="space-y-3">{children}</fieldset>
      {!disabled && <SubmitButton>Salvar e recalcular</SubmitButton>}
    </form>
  );
}

export function ChargersEditor({ action, initial, disabled }: { action: Act; initial: StudyChargers; disabled?: boolean }) {
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, _unit: fromNum(r.unitCost), _inst: fromNum(r.installCost), _eff: r.efficiency === null ? "" : pct(r.efficiency) })));
  const value = rows.map(({ _unit, _inst, _eff, ...r }) => ({ ...r, unitCost: toNum(_unit), installCost: toNum(_inst), efficiency: _eff.trim() === "" ? null : fromPct(_eff) }));
  const upd = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <JsonForm action={action} value={value} disabled={disabled}>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-xs text-zinc-500"><th className="p-1">Descrição</th><th className="p-1">Tipo</th><th className="p-1">Potência (kW)</th><th className="p-1">Qtd.</th><th className="p-1">Custo unitário (R$)</th><th className="p-1">Instalação/unid. (R$)</th><th className="p-1">Eficiência (%)</th><th /></tr></thead>
          <tbody>{rows.map((r, i) => (
            <tr key={i}>
              <td className="p-1"><input aria-label="Descrição" className={cell} value={r.label} onChange={(e) => upd(i, { label: e.target.value })} /></td>
              <td className="p-1"><select aria-label="Tipo" className={cell} value={r.current} onChange={(e) => upd(i, { current: e.target.value as "AC" | "DC" })}><option>AC</option><option>DC</option></select></td>
              <td className="p-1"><input aria-label="Potência" className={cell} value={fromNum(r.powerKw)} onChange={(e) => upd(i, { powerKw: toNum(e.target.value) ?? 0 })} /></td>
              <td className="p-1"><input aria-label="Quantidade" type="number" min={0} className={cell} value={r.quantity} onChange={(e) => upd(i, { quantity: Number(e.target.value) })} /></td>
              <td className="p-1"><input aria-label="Custo unitário" placeholder="não cotado" className={cell} value={r._unit} onChange={(e) => upd(i, { _unit: e.target.value })} /></td>
              <td className="p-1"><input aria-label="Custo de instalação" placeholder="não cotado" className={cell} value={r._inst} onChange={(e) => upd(i, { _inst: e.target.value })} /></td>
              <td className="p-1"><input aria-label="Eficiência" placeholder="desconhecida" className={cell} value={r._eff} onChange={(e) => upd(i, { _eff: e.target.value })} /></td>
              <td className="p-1"><button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="text-xs text-red-700 hover:underline">Remover</button></td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        {CHARGER_CATEGORIES.map((c) => <button key={c.key} type="button" onClick={() => setRows((rs) => [...rs, { label: c.label, powerKw: c.powerKw, current: c.current, quantity: 1, unitCost: null, installCost: null, efficiency: null, _unit: "", _inst: "", _eff: "" }])} className="rounded-md border border-dashed border-zinc-400 px-2 py-1 text-xs hover:border-brand hover:text-brand">+ {c.label}</button>)}
      </div>
      <p className="text-xs text-zinc-500">Categorias de simulação, não confirmação de disponibilidade ou compatibilidade. Custos vazios = não cotados (o investimento fica incompleto).</p>
    </JsonForm>
  );
}

export function SiteElectricalEditor({ siteAction, elecAction, site, elec, disabled }: { siteAction: Act; elecAction: Act; site: StudySite; elec: StudyElectrical; disabled?: boolean }) {
  const [s, setS] = useState({ availableKw: fromNum(site.availableKw), sf: pct(site.simultaneityFactor), dlm: site.dynamicLoadManagement, hours: fromNum(site.operatingHours), avail: pct(site.availability), aux: fromNum(site.auxiliaryKw) });
  const siteValue = { availableKw: toNum(s.availableKw), simultaneityFactor: fromPct(s.sf), dynamicLoadManagement: s.dlm, operatingHours: toNum(s.hours) ?? 24, availability: fromPct(s.avail), auxiliaryKw: toNum(s.aux) };
  const [e, setE] = useState({ ...elec, _v: fromNum(elec.supplyVoltageV), _load: fromNum(elec.existingLoadKw), _dem: fromNum(elec.contractedDemandKw), _dist: fromNum(elec.distanceToSupplyM), _cable: fromNum(elec.cableDistanceM), _ref: fromNum(elec.lvReferenceKw) });
  const elecValue = { supplyVoltageV: toNum(e._v), phases: e.phases, existingLoadKw: toNum(e._load), contractedDemandKw: toNum(e._dem), distanceToSupplyM: toNum(e._dist), cableDistanceM: toNum(e._cable), hasTransformer: e.hasTransformer, existingInfrastructure: e.existingInfrastructure, solar: e.solar, battery: e.battery, utilityStatement: e.utilityStatement, engineerOpinion: e.engineerOpinion, lvReferenceKw: toNum(e._ref) ?? 75 };
  const triSel = (v: boolean | null, set: (b: boolean | null) => void, label: string) => (
    <label className="text-xs text-zinc-600">{label}<select className={cell} value={v === null ? "" : v ? "sim" : "nao"} onChange={(ev) => set(ev.target.value === "" ? null : ev.target.value === "sim")}><option value="">Não informado</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
  );
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <JsonForm action={siteAction} value={siteValue} disabled={disabled}>
        <h3 className="font-semibold">Operação e potência do local</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-600">Potência disponível para recarga (kW)<input className={cell} placeholder="desconhecida" value={s.availableKw} onChange={(ev) => setS({ ...s, availableKw: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Fator de simultaneidade (%) — premissa<input className={cell} value={s.sf} onChange={(ev) => setS({ ...s, sf: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Horas de funcionamento/dia<input className={cell} value={s.hours} onChange={(ev) => setS({ ...s, hours: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Disponibilidade técnica (%)<input className={cell} value={s.avail} onChange={(ev) => setS({ ...s, avail: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Consumo auxiliar médio (kW)<input className={cell} placeholder="não estimado" value={s.aux} onChange={(ev) => setS({ ...s, aux: ev.target.value })} /></label>
          <label className="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={s.dlm} onChange={(ev) => setS({ ...s, dlm: ev.target.checked })} /> Gerenciamento dinâmico de carga</label>
        </div>
      </JsonForm>
      <JsonForm action={elecAction} value={elecValue} disabled={disabled}>
        <h3 className="font-semibold">Dados elétricos (avaliação de baixa tensão)</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-zinc-600">Tensão de alimentação (V)<input className={cell} placeholder="ex.: 380" value={e._v} onChange={(ev) => setE({ ...e, _v: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Fases<select className={cell} value={e.phases ?? ""} onChange={(ev) => setE({ ...e, phases: ev.target.value === "" ? null : (Number(ev.target.value) as 1 | 2 | 3) })}><option value="">Não informado</option><option value="1">Monofásico</option><option value="2">Bifásico</option><option value="3">Trifásico</option></select></label>
          <label className="text-xs text-zinc-600">Carga existente (kW)<input className={cell} value={e._load} onChange={(ev) => setE({ ...e, _load: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Demanda contratada (kW)<input className={cell} value={e._dem} onChange={(ev) => setE({ ...e, _dem: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Distância até o quadro/alimentação (m)<input className={cell} value={e._dist} onChange={(ev) => setE({ ...e, _dist: ev.target.value })} /></label>
          <label className="text-xs text-zinc-600">Extensão de cabos (m)<input className={cell} value={e._cable} onChange={(ev) => setE({ ...e, _cable: ev.target.value })} /></label>
          {triSel(e.hasTransformer, (b) => setE({ ...e, hasTransformer: b }), "Transformador próprio")}
          {triSel(e.solar, (b) => setE({ ...e, solar: b }), "Geração solar")}
          {triSel(e.battery, (b) => setE({ ...e, battery: b }), "Armazenamento em baterias")}
          <label className="text-xs text-zinc-600">Parecer da distribuidora<select className={cell} value={e.utilityStatement ?? ""} onChange={(ev) => setE({ ...e, utilityStatement: (ev.target.value || null) as StudyElectrical["utilityStatement"] })}><option value="">Não informado</option><option value="nenhuma">Não consultada</option><option value="favoravel">Favorável</option><option value="com_restricoes">Com restrições</option><option value="desfavoravel">Desfavorável</option></select></label>
          <label className="text-xs text-zinc-600">Parecer de profissional habilitado<select className={cell} value={e.engineerOpinion ?? ""} onChange={(ev) => setE({ ...e, engineerOpinion: (ev.target.value || null) as StudyElectrical["engineerOpinion"] })}><option value="">Não informado</option><option value="nenhum">Não emitido</option><option value="favoravel">Favorável</option><option value="com_ressalvas">Com ressalvas</option><option value="desfavoravel">Desfavorável</option></select></label>
          <label className="text-xs text-zinc-600">Referência de carga para BT (kW)<input className={cell} value={e._ref} onChange={(ev) => setE({ ...e, _ref: ev.target.value })} /><span className="text-[11px]">Conforme norma da distribuidora local.</span></label>
          <label className="text-xs text-zinc-600 sm:col-span-2">Infraestrutura existente<input className={cell} value={e.existingInfrastructure ?? ""} onChange={(ev) => setE({ ...e, existingInfrastructure: ev.target.value || null })} /></label>
        </div>
      </JsonForm>
    </div>
  );
}

const SCN_FIELDS = ["pricePerKwh", "kwhPerSession", "publicChargingShare", "publicSessionsPerWeek", "catchmentShare", "captureShare", "competitionSensitivity", "phevFactor", "annualFleetGrowth", "weekendFactor"] as const;

export function DemandEditor({ action, initial, disabled }: { action: Act; initial: StudyDemand; disabled?: boolean }) {
  const [d, setD] = useState(initial);
  const [txt, setTxt] = useState(() => Object.fromEntries(SCENARIO_KEYS.flatMap((k) => SCN_FIELDS.map((f) => [`${k}.${f}`, ASSUMPTION_LABELS[f].fraction ? pct(initial.scenarios[k][f]) : fromNum(initial.scenarios[k][f])]))) as Record<string, string>);
  const [ov, setOv] = useState({ bev: fromNum(initial.bevFleetOverride), phev: fromNum(initial.phevFleetOverride), comp: fromNum(initial.competitorsOverride), ext: fromNum(initial.externalDailyKwhOverride), radius: fromNum(initial.catchmentRadiusKm), turn: fromNum(initial.turnoverMin) });
  const value: StudyDemand = {
    ...d, bevFleetOverride: toNum(ov.bev), phevFleetOverride: toNum(ov.phev), competitorsOverride: toNum(ov.comp), externalDailyKwhOverride: toNum(ov.ext), catchmentRadiusKm: toNum(ov.radius) ?? 3, turnoverMin: toNum(ov.turn) ?? 10,
    scenarios: Object.fromEntries(SCENARIO_KEYS.map((k) => [k, Object.fromEntries(SCN_FIELDS.map((f) => [f, ASSUMPTION_LABELS[f].fraction ? fromPct(txt[`${k}.${f}`]) : toNum(txt[`${k}.${f}`]) ?? 0]))])) as StudyDemand["scenarios"],
  };
  void setD;
  return (
    <JsonForm action={action} value={value} disabled={disabled}>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-zinc-600">Frota BEV (sobrescrever)<input className={cell} placeholder="usar dado importado" value={ov.bev} onChange={(e) => setOv({ ...ov, bev: e.target.value })} /></label>
        <label className="text-xs text-zinc-600">Frota PHEV (sobrescrever)<input className={cell} placeholder="usar dado importado" value={ov.phev} onChange={(e) => setOv({ ...ov, phev: e.target.value })} /></label>
        <label className="text-xs text-zinc-600">Concorrentes (sobrescrever)<input className={cell} placeholder="usar base de carregadores" value={ov.comp} onChange={(e) => setOv({ ...ov, comp: e.target.value })} /></label>
        <label className="text-xs text-zinc-600">Demanda agregada externa (kWh/dia)<input className={cell} placeholder="usar EVIE importado" value={ov.ext} onChange={(e) => setOv({ ...ov, ext: e.target.value })} /></label>
        <label className="text-xs text-zinc-600">Raio da área de influência (km)<input className={cell} value={ov.radius} onChange={(e) => setOv({ ...ov, radius: e.target.value })} /></label>
        <label className="text-xs text-zinc-600">Tempo entre veículos (min)<input className={cell} value={ov.turn} onChange={(e) => setOv({ ...ov, turn: e.target.value })} /></label>
      </div>
      <p className="text-xs text-zinc-500">Sobrescritas viram PREMISSAS (substituem dados importados). Deixe em branco para usar os dados observados.</p>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead><tr className="text-left text-xs text-zinc-500"><th className="p-1">Premissa</th>{SCENARIO_KEYS.map((k) => <th key={k} className="p-1">{SCENARIO_LABELS[k]}</th>)}</tr></thead>
          <tbody>{SCN_FIELDS.map((f) => (
            <tr key={f}><td className="p-1 text-sm">{ASSUMPTION_LABELS[f].label} <span className="text-xs text-zinc-500">({ASSUMPTION_LABELS[f].unit})</span></td>
              {SCENARIO_KEYS.map((k) => <td key={k} className="p-1"><input aria-label={`${ASSUMPTION_LABELS[f].label} — ${SCENARIO_LABELS[k]}`} className={cell} value={txt[`${k}.${f}`]} onChange={(e) => setTxt((t) => ({ ...t, [`${k}.${f}`]: e.target.value }))} /></td>)}</tr>))}</tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">Os valores iniciais são pontos de partida de modelagem, não observações. Substitua por dados próprios sempre que possível.</p>
    </JsonForm>
  );
}

export function FinanceEditor({ action, initial, disabled }: { action: Act; initial: StudyFinance; disabled?: boolean }) {
  const [f, setF] = useState(initial);
  const [t, setT] = useState(() => ({
    energyCostPerKwh: fromNum(initial.energyCostPerKwh), demandChargeMonthly: fromNum(initial.demandChargeMonthly), chargerEfficiency: pct(initial.chargerEfficiency), averageDiscount: pct(initial.averageDiscount),
    revenueTaxRate: pct(initial.revenueTaxRate), paymentFeeRate: pct(initial.paymentFeeRate), platformFeeRate: pct(initial.platformFeeRate), partnerCommissionRate: pct(initial.partnerCommissionRate),
    contingencyRate: pct(initial.contingencyRate), workingCapital: fromNum(initial.workingCapital), inflationYear: pct(initial.inflationYear), discountRateYear: initial.discountRateYear === null ? "" : pct(initial.discountRateYear),
    incomeTaxRate: pct(initial.incomeTaxRate), depreciationYears: fromNum(initial.depreciationYears), horizonMonths: String(initial.horizonMonths),
    finP: fromNum(initial.financing?.principal), finR: initial.financing ? pct(initial.financing.annualRate) : "", finN: initial.financing ? String(initial.financing.months) : "", finG: initial.financing ? String(initial.financing.graceMonths) : "0",
  }));
  const [fixed, setFixed] = useState(initial.fixedCosts.map((c) => ({ label: c.label, v: fromNum(c.monthly) })));
  const [capex, setCapex] = useState(initial.capex.map((c) => ({ label: c.label, v: fromNum(c.amount) })));
  const value: StudyFinance = {
    ...f, horizonMonths: Number(t.horizonMonths) || 120, energyCostPerKwh: toNum(t.energyCostPerKwh) ?? 0, demandChargeMonthly: toNum(t.demandChargeMonthly) ?? 0, chargerEfficiency: fromPct(t.chargerEfficiency),
    averageDiscount: fromPct(t.averageDiscount), revenueTaxRate: fromPct(t.revenueTaxRate), paymentFeeRate: fromPct(t.paymentFeeRate), platformFeeRate: fromPct(t.platformFeeRate), partnerCommissionRate: fromPct(t.partnerCommissionRate),
    contingencyRate: fromPct(t.contingencyRate), workingCapital: toNum(t.workingCapital) ?? 0, inflationYear: fromPct(t.inflationYear), discountRateYear: t.discountRateYear.trim() === "" ? null : fromPct(t.discountRateYear),
    incomeTaxRate: fromPct(t.incomeTaxRate), depreciationYears: toNum(t.depreciationYears) ?? 10,
    fixedCosts: fixed.filter((c) => c.label.trim()).map((c) => ({ label: c.label, monthly: toNum(c.v) })), capex: capex.filter((c) => c.label.trim()).map((c) => ({ label: c.label, amount: toNum(c.v) })),
    financing: toNum(t.finP) ? { principal: toNum(t.finP)!, annualRate: fromPct(t.finR), months: Number(t.finN) || 1, graceMonths: Number(t.finG) || 0 } : null,
  };
  const field = (k: keyof typeof t, label: string, hint?: string) => <label className="text-xs text-zinc-600">{label}<input className={cell} value={t[k]} onChange={(e) => setT({ ...t, [k]: e.target.value })} />{hint && <span className="text-[11px]">{hint}</span>}</label>;
  const statuses = { hipotese: "Hipótese", negociando: "Negociando", contratado: "Contratado", realizado: "Realizado" } as const;
  return (
    <JsonForm action={action} value={value} disabled={disabled}>
      <div className="grid gap-3 sm:grid-cols-4">
        {field("energyCostPerKwh", "Tarifa de compra de energia (R$/kWh)", "Da distribuidora/comercializadora local")}
        {field("demandChargeMonthly", "Demanda contratada (R$/mês)")}
        {field("chargerEfficiency", "Eficiência rede→veículo (%)")}
        {field("averageDiscount", "Desconto médio (%)")}
        {field("revenueTaxRate", "Tributos sobre receita (%)", "Confirmar com contador")}
        {field("paymentFeeRate", "Taxas de pagamento (%)")}
        {field("platformFeeRate", "Taxa da plataforma de recarga (%)")}
        {field("partnerCommissionRate", "Comissões de parceiros (%)")}
        {field("contingencyRate", "Contingência sobre investimento (%)")}
        {field("workingCapital", "Capital de giro inicial (R$)")}
        {field("horizonMonths", "Horizonte (meses)")}
        {field("inflationYear", "Inflação anual (%)")}
        {field("discountRateYear", "Taxa de desconto anual (%)", "Vazio = sem VPL")}
        {field("incomeTaxRate", "IR/CSLL sobre resultado (%)")}
        {field("depreciationYears", "Depreciação (anos)")}
        <label className="mt-5 flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={f.useChargerCapex} onChange={(e) => setF({ ...f, useChargerCapex: e.target.checked })} /> Incluir custos dos carregadores do simulador</label>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">Custos fixos mensais (R$)</p>
          {fixed.map((c, i) => <div key={i} className="mt-1 flex gap-2"><input aria-label="Descrição do custo" className={cell} value={c.label} onChange={(e) => setFixed((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /><input aria-label={`Valor ${c.label}`} placeholder="não informado" className={`${cell} max-w-36`} value={c.v} onChange={(e) => setFixed((x) => x.map((y, j) => (j === i ? { ...y, v: e.target.value } : y)))} /></div>)}
          <button type="button" className="mt-2 text-xs text-brand" onClick={() => setFixed((x) => [...x, { label: "Outro custo", v: "" }])}>+ adicionar custo</button>
        </div>
        <div>
          <p className="text-sm font-semibold">Investimentos (R$)</p>
          {capex.map((c, i) => <div key={i} className="mt-1 flex gap-2"><input aria-label="Descrição do investimento" className={cell} value={c.label} onChange={(e) => setCapex((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} /><input aria-label={`Valor ${c.label}`} placeholder="não informado" className={`${cell} max-w-36`} value={c.v} onChange={(e) => setCapex((x) => x.map((y, j) => (j === i ? { ...y, v: e.target.value } : y)))} /></div>)}
          <button type="button" className="mt-2 text-xs text-brand" onClick={() => setCapex((x) => [...x, { label: "Outro investimento", v: "" }])}>+ adicionar investimento</button>
        </div>
      </div>
      <div>
        <p className="text-sm font-semibold">Financiamento (opcional)</p>
        <div className="mt-1 grid gap-3 sm:grid-cols-4">{field("finP", "Valor financiado (R$)")}{field("finR", "Juros anuais (%)")}{field("finN", "Prazo (meses)")}{field("finG", "Carência (meses)")}</div>
      </div>
      <div>
        <p className="text-sm font-semibold">Receitas complementares incluídas no resultado</p>
        <div className="mt-1 flex flex-wrap gap-4">{Object.entries(statuses).map(([k, v]) => <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand" checked={f.includeStatuses.includes(k as never)} onChange={(e) => setF({ ...f, includeStatuses: e.target.checked ? [...f.includeStatuses, k as never] : f.includeStatuses.filter((x) => x !== k) })} />{v}</label>)}</div>
        <p className="text-xs text-zinc-500">Padrão: apenas contratadas e realizadas. Hipóteses incluídas aparecem como tal no relatório.</p>
      </div>
    </JsonForm>
  );
}

export function RevenueForm({ action, categories }: { action: Act; categories: Record<string, string> }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const e = state.fieldErrors ?? {};
  return (
    <form key={state.ts ?? 0} action={formAction} className="grid gap-3 sm:grid-cols-4" aria-label="Receita complementar">
      {state.message && <Alert kind={state.ok ? "success" : "error"} className="sm:col-span-4">{state.message}</Alert>}
      <SelectInput label="Categoria" name="category" options={categories} />
      <TextInput label="Descrição" name="name" error={e.name} />
      <TextInput label="Modelo comercial" name="commercialModel" placeholder="ex.: % sobre vendas" />
      <SelectInput label="Situação comercial" name="status" options={{ hipotese: "Hipótese", negociando: "Negociando", contratado: "Contratado", realizado: "Realizado" }} />
      <TextInput label="Receita bruta mensal (R$)" name="grossMonthly" defaultValue="0" error={e.grossMonthly} />
      <TextInput label="Custos associados/mês (R$)" name="costsMonthly" defaultValue="0" />
      <TextInput label="Comissões (%)" name="commissionRate" defaultValue="0" />
      <TextInput label="Impostos (%)" name="taxRate" defaultValue="0" />
      <TextInput label="Investimento inicial (R$)" name="initialInvestment" defaultValue="0" />
      <SelectInput label="Grau de confiança" name="confidence" options={{ baixa: "Baixa", media: "Média", alta: "Alta" }} />
      <div className="flex items-end"><SubmitButton>Adicionar receita</SubmitButton></div>
    </form>
  );
}

export function MetaForm({ action, name, status, selected }: { action: Act; name: string; status: string; selected: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3" aria-label="Dados do estudo">
      <TextInput label="Nome" name="name" defaultValue={name} className="min-w-56" />
      <SelectInput label="Situação" name="status" defaultValue={status} options={{ em_andamento: "Em andamento", concluido: "Concluído", arquivado: "Arquivado" }} />
      <SelectInput label="Cenário principal" name="selectedScenario" defaultValue={selected} options={SCENARIO_LABELS} />
      <SubmitButton variant="dark">Salvar</SubmitButton>
      {state.message && <span className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</span>}
    </form>
  );
}
