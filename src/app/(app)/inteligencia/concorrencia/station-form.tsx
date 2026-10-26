"use client";
import { useActionState } from "react";
import { Checkbox, SelectInput, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";

type V = Partial<Record<"name" | "address" | "operator" | "lat" | "lng" | "maxPowerKw" | "connectors" | "currentType" | "connectorStandard" | "pricePerKwh" | "openingHours" | "operationalStatus" | "verificationStatus" | "verifiedAt", string>>;

export function StationForm({ action, initial, isNew }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; initial?: V; isNew?: boolean }) {
  const [state, formAction] = useActionState(action, initialActionState);
  const g = (k: keyof V) => (state.ok ? undefined : (state.values?.[k] as string)) ?? initial?.[k] ?? "";
  const e = state.fieldErrors ?? {};
  return (
    <form key={state.ts ?? 0} action={formAction} className="grid gap-3 sm:grid-cols-4" aria-label="Carregador">
      {state.message && <Alert kind={state.ok ? "success" : "error"} className="sm:col-span-4">{state.message}</Alert>}
      <TextInput label="Nome do estabelecimento" name="name" defaultValue={g("name")} error={e.name} className="sm:col-span-2" />
      <TextInput label="Operador" name="operator" defaultValue={g("operator")} />
      <TextInput label="Endereço" name="address" defaultValue={g("address")} />
      <TextInput label="Latitude" name="lat" defaultValue={g("lat")} error={e.lat} />
      <TextInput label="Longitude" name="lng" defaultValue={g("lng")} />
      <TextInput label="Potência máxima (kW)" name="maxPowerKw" defaultValue={g("maxPowerKw")} error={e.maxPowerKw} hint="Vazio = desconhecida" />
      <TextInput label="Conectores" name="connectors" defaultValue={g("connectors")} />
      <SelectInput label="Tipo" name="currentType" defaultValue={g("currentType")} placeholder="Desconhecido" options={{ AC: "AC", DC: "DC", AC_DC: "AC e DC" }} />
      <TextInput label="Padrão de conexão" name="connectorStandard" defaultValue={g("connectorStandard")} placeholder="CCS2, Tipo 2…" />
      <TextInput label="Preço (R$/kWh)" name="pricePerKwh" defaultValue={g("pricePerKwh")} />
      <TextInput label="Horário" name="openingHours" defaultValue={g("openingHours")} />
      <SelectInput label="Situação operacional" name="operationalStatus" defaultValue={g("operationalStatus") || "desconhecido"} options={{ operando: "Operando", fora_de_operacao: "Fora de operação", em_implantacao: "Em implantação", desconhecido: "Desconhecida" }} />
      <SelectInput label="Verificação" name="verificationStatus" defaultValue={g("verificationStatus") || "nao_verificado"} options={{ confirmado: "Confirmado e atualizado", nao_verificado: "Não verificado", historico: "Histórico", insuficiente: "Informação insuficiente" }} />
      <TextInput label="Data de verificação" name="verifiedAt" type="date" defaultValue={g("verifiedAt")} error={e.verifiedAt} />
      <TextInput label="Motivo / evidência da alteração" name="reason" error={e.reason} className="sm:col-span-3" placeholder="Ex.: visita ao local em 20/10, foto no drive" />
      {isNew && <div className="sm:col-span-4"><Checkbox label="Registro privado da organização (não compartilhado com outras franquias)" name="private" /></div>}
      <div className="sm:col-span-4"><SubmitButton>Salvar</SubmitButton></div>
    </form>
  );
}
