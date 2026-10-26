"use client";
import { useActionState } from "react";
import { TextArea, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { DIMENSIONS, type IndexConfig } from "@/lib/intel/potential-index";

const SCALE_LABELS: Record<keyof IndexConfig["scales"], string> = {
  bevFleetRef: "Frota BEV de referência (nota máxima)", phevWeight: "Peso do PHEV vs BEV (0–1)", densityRef: "Densidade de referência (hab/km²)",
  roadDistanceZeroM: "Distância da via em que a nota zera (m)", destinationsRef: "Destinos em 1 km para nota máxima", competitorsSaturation: "Concorrentes em 3 km que zeram a nota", areaRefM2: "Área de referência (m²)",
};

export function IndexForm({ action, config }: { action: (p: ActionState, fd: FormData) => Promise<ActionState>; config: IndexConfig }) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form key={state.ts ?? 0} action={formAction} className="space-y-4" aria-label="Configuração do índice">
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <div><p className="text-sm font-semibold">Pesos das dimensões (hipóteses)</p><div className="mt-1 grid gap-3 sm:grid-cols-3">{(Object.keys(DIMENSIONS) as (keyof typeof DIMENSIONS)[]).map((k) => <TextInput key={k} label={DIMENSIONS[k].label} name={`w_${k}`} defaultValue={String(config.weights[k])} />)}</div></div>
      <div><p className="text-sm font-semibold">Escalas de normalização</p><div className="mt-1 grid gap-3 sm:grid-cols-3">{(Object.keys(SCALE_LABELS) as (keyof IndexConfig["scales"])[]).map((k) => <TextInput key={k} label={SCALE_LABELS[k]} name={`s_${k}`} defaultValue={String(config.scales[k])} />)}</div></div>
      <TextArea label="Justificativa da alteração (obrigatória)" name="notes" error={state.fieldErrors?.notes} />
      <SubmitButton>Criar nova versão e ativar</SubmitButton>
    </form>
  );
}
