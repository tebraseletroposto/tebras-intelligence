"use client";
import { useActionState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { UFS } from "@/lib/domain/documents";

type Act = (p: ActionState, fd: FormData) => Promise<ActionState>;
const Msg = ({ s }: { s: ActionState }) => (s.message ? <p className={`text-xs ${s.ok ? "text-emerald-700" : "text-red-700"}`}>{s.message}</p> : null);

export function TestButton({ action }: { action: () => Promise<ActionState> }) {
  const [state, formAction] = useActionState(async () => action(), initialActionState);
  return <form action={formAction} className="space-y-1"><SubmitButton variant="outline" pendingText="Testando…">Testar conexão</SubmitButton><Msg s={state} /></form>;
}

export function IbgeForm({ action }: { action: Act }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-zinc-600">UF<select name="uf" defaultValue="SP" className="mt-1 block h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm">{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
      <SubmitButton pendingText="Importando…">Importar municípios e população</SubmitButton><Msg s={state} />
    </form>
  );
}

export function BboxForm({ action, label }: { action: Act; label: string }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const inp = "mt-1 block h-9 w-28 rounded-md border border-zinc-300 px-2 text-sm";
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-zinc-600">Lat. mín.<input name="minLat" defaultValue="-23.60" className={inp} /></label>
      <label className="text-xs text-zinc-600">Lng. mín.<input name="minLng" defaultValue="-46.70" className={inp} /></label>
      <label className="text-xs text-zinc-600">Lat. máx.<input name="maxLat" defaultValue="-23.52" className={inp} /></label>
      <label className="text-xs text-zinc-600">Lng. máx.<input name="maxLng" defaultValue="-46.60" className={inp} /></label>
      <SubmitButton pendingText="Consultando…">{label}</SubmitButton><Msg s={state} />
    </form>
  );
}

export function RadiusForm({ action }: { action: Act }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const inp = "mt-1 block h-9 w-28 rounded-md border border-zinc-300 px-2 text-sm";
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-xs text-zinc-600">Latitude<input name="lat" defaultValue="-23.56" className={inp} /></label>
      <label className="text-xs text-zinc-600">Longitude<input name="lng" defaultValue="-46.65" className={inp} /></label>
      <label className="text-xs text-zinc-600">Raio (km)<input name="radiusKm" defaultValue="10" className={inp} /></label>
      <SubmitButton pendingText="Consultando…">Importar do Open Charge Map</SubmitButton><Msg s={state} />
    </form>
  );
}
