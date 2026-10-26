"use client";
import { useActionState, useState } from "react";
import { SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { UFS } from "@/lib/domain/documents";

export type PropertyFormValues = Partial<Record<"name" | "address" | "district" | "city" | "uf" | "zip" | "lat" | "lng" | "polygon" | "areaM2" | "monthlyRent" | "salePrice" | "propertyType" | "occupancy" | "parking" | "streetAccess" | "mainRoadDistanceM" | "destinationsWithin1km" | "objective" | "businessModel" | "status" | "geocodeSource" | "listingUrl" | "notes", string>>;

type Opts = { types: Record<string, string>; occupancy: Record<string, string>; objectives: Record<string, string>; statuses: Record<string, string> };

export function PropertyForm({ action, initial, opts }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; initial?: PropertyFormValues; opts: Opts }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [geo, setGeo] = useState<{ q: string; results: { lat: number; lng: number; displayName: string; city: string | null; uf: string | null; district: string | null; zip: string | null; road: string | null }[]; error?: string; loading?: boolean }>({ q: "", results: [] });
  const [vals, setVals] = useState<PropertyFormValues>(initial ?? {});
  const g = (k: keyof PropertyFormValues) => (state.ok ? undefined : (state.values?.[k] as string | undefined)) ?? vals[k] ?? "";
  const e = state.fieldErrors ?? {};
  const tri = { sim: "Sim", nao: "Não" };

  async function search() {
    setGeo((s) => ({ ...s, loading: true, error: undefined }));
    try {
      const r = await fetch(`/api/inteligencia/geocodificar?q=${encodeURIComponent(geo.q)}`);
      const j = await r.json();
      if (!r.ok) setGeo((s) => ({ ...s, loading: false, results: [], error: j.error ?? "Falha na pesquisa." }));
      else setGeo((s) => ({ ...s, loading: false, results: j.results }));
    } catch { setGeo((s) => ({ ...s, loading: false, error: "Serviço de geocodificação indisponível. Informe as coordenadas manualmente." })); }
  }
  const pick = (r: (typeof geo.results)[number]) => {
    setVals((v) => ({ ...v, lat: String(r.lat), lng: String(r.lng), city: r.city ?? v.city, uf: r.uf ?? v.uf, district: r.district ?? v.district, zip: r.zip ?? v.zip, address: v.address || r.displayName.split(",").slice(0, 2).join(","), geocodeSource: "Nominatim/OpenStreetMap" }));
    setGeo((s) => ({ ...s, results: [] }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-zinc-200 bg-white p-4">
        <p className="text-sm font-semibold">Pesquisar endereço</p>
        <p className="text-xs text-zinc-500">Geocodificação configurável (padrão: Nominatim/OpenStreetMap, com limite de 1 consulta por segundo). Os dados © colaboradores do OpenStreetMap (ODbL).</p>
        <div className="mt-2 flex gap-2">
          <input aria-label="Endereço para pesquisa" value={geo.q} onChange={(ev) => setGeo((s) => ({ ...s, q: ev.target.value }))} onKeyDown={(ev) => { if (ev.key === "Enter") { ev.preventDefault(); search(); } }} placeholder="Ex.: Av. Paulista, 1000, São Paulo" className="h-10 flex-1 rounded-md border border-zinc-300 px-3 text-sm" />
          <button type="button" onClick={search} disabled={geo.q.trim().length < 3 || geo.loading} className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-white disabled:opacity-50">{geo.loading ? "Pesquisando…" : "Pesquisar"}</button>
        </div>
        {geo.error && <p className="mt-2 text-sm text-red-700">{geo.error}</p>}
        {geo.results.length > 0 && <ul className="mt-2 divide-y divide-zinc-100 rounded-md border border-zinc-200">{geo.results.map((r, i) => <li key={i}><button type="button" onClick={() => pick(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50">{r.displayName}</button></li>)}</ul>}
      </div>
      <form key={`${state.ts ?? 0}-${vals.lat}-${vals.lng}`} action={formAction} className="space-y-4" noValidate aria-label="Imóvel">
        {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
        <div className="grid gap-3 sm:grid-cols-4">
          <TextInput label="Link do anúncio" name="listingUrl" type="url" defaultValue={g("listingUrl")} error={e.listingUrl} placeholder="https://…" className="sm:col-span-4" hint="Cole o link do portal/corretor. Os dados do anúncio são digitados abaixo (não há coleta automática de portais)." />
          <TextInput label="Identificação" name="name" required defaultValue={g("name")} error={e.name} className="sm:col-span-2" />
          <SelectInput label="Modelo de negócio" name="businessModel" defaultValue={g("businessModel") || "smart_hub"} options={{ smart_hub: "A — Tebras Smart Hub", b2b: "B — Tebras B2B" }} />
          <SelectInput label="Situação" name="status" defaultValue={g("status") || "prospeccao"} options={opts.statuses} />
          <TextInput label="Endereço" name="address" defaultValue={g("address")} className="sm:col-span-2" />
          <TextInput label="Bairro" name="district" defaultValue={g("district")} />
          <TextInput label="CEP" name="zip" defaultValue={g("zip")} error={e.zip} inputMode="numeric" />
          <TextInput label="Município" name="city" defaultValue={g("city")} />
          <SelectInput label="UF" name="uf" defaultValue={g("uf")} placeholder="—" options={UFS.map((u) => [u, u] as [string, string])} error={e.uf} />
          <TextInput label="Latitude" name="lat" defaultValue={g("lat")} error={e.lat} hint="Ex.: -23,5612" inputMode="decimal" />
          <TextInput label="Longitude" name="lng" defaultValue={g("lng")} error={e.lng} hint="Ex.: -46,6555" inputMode="decimal" />
          <input type="hidden" name="polygon" value={g("polygon")} />
          <input type="hidden" name="geocodeSource" value={g("geocodeSource")} />
          <TextInput label="Área do terreno (m²)" name="areaM2" defaultValue={g("areaM2")} error={e.areaM2} inputMode="decimal" hint={g("polygon") ? "Vazio = calculada pelo polígono" : "Vazio = não informada"} />
          <TextInput label="Aluguel mensal (R$)" name="monthlyRent" defaultValue={g("monthlyRent")} error={e.monthlyRent} inputMode="decimal" />
          <TextInput label="Valor de venda (R$)" name="salePrice" defaultValue={g("salePrice")} error={e.salePrice} inputMode="decimal" />
          <SelectInput label="Tipo de imóvel" name="propertyType" defaultValue={g("propertyType")} placeholder="—" options={opts.types} />
          <SelectInput label="Ocupação" name="occupancy" defaultValue={g("occupancy")} placeholder="—" options={opts.occupancy} />
          <SelectInput label="Estacionamento" name="parking" defaultValue={g("parking")} placeholder="Não informado" options={tri} />
          <SelectInput label="Acesso direto pela rua" name="streetAccess" defaultValue={g("streetAccess")} placeholder="Não informado" options={tri} />
          <SelectInput label="Objetivo" name="objective" defaultValue={g("objective")} placeholder="—" options={opts.objectives} />
          <TextInput label="Distância até via principal (m)" name="mainRoadDistanceM" defaultValue={g("mainRoadDistanceM")} error={e.mainRoadDistanceM} hint="Vazio = calcular pela malha OSM importada" />
          <TextInput label="Destinos relevantes em 1 km" name="destinationsWithin1km" defaultValue={g("destinationsWithin1km")} hint="Vazio = contar POIs importados" />
          <TextArea label="Observações" name="notes" rows={2} defaultValue={g("notes")} className="sm:col-span-4" />
        </div>
        {g("polygon") && <p className="text-xs text-zinc-500">Polígono do terreno desenhado no mapa será salvo.</p>}
        <SubmitButton>Salvar imóvel</SubmitButton>
      </form>
    </div>
  );
}
