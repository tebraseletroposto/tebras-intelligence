import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardHeader, PageHeader } from "@/components/ui/misc";
import { STATION_STATUS, type StationStatus } from "@/lib/intel/competition";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { AppError } from "@/server/errors";
import { getStation } from "@/server/intel/sources";
import { saveStationAction } from "../../actions";
import { StationForm } from "../station-form";

export const metadata = { title: "Carregador" };
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function StationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feito?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const { id } = await params;
  const { station: st, revisions } = await getStation(ctx, id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const status = STATION_STATUS[st.verificationStatus as StationStatus];
  return (
    <div className="space-y-5">
      <PageHeader title={st.name ?? "Carregador sem nome"} breadcrumb={<Link href="/inteligencia/concorrencia" className="hover:text-brand">Concorrência</Link>} description={<>Fonte: {st.sourceKey}{st.externalId ? ` (${st.externalId})` : ""} · <Badge tone={status.tone}>{status.label}</Badge> · confiança {st.confidence}</>} />
      {(await searchParams).feito && <Alert kind="success">Alteração salva no histórico.</Alert>}
      {st.isDemo && <Alert kind="warning">Registro de DEMONSTRAÇÃO (fictício).</Alert>}
      {(can(ctx, "inteligencia.import") || can(ctx, "inteligencia.admin")) ? (
        <Card><CardHeader title="Corrigir informações" description="Toda correção exige motivo/evidência e fica registrada (antes/depois)." /><div className="p-5">
          <StationForm action={saveStationAction.bind(null, id)} initial={{ name: s(st.name), address: s(st.address), operator: s(st.operator), lat: s(st.lat), lng: s(st.lng), maxPowerKw: s(st.maxPowerKw), connectors: s(st.connectors), currentType: s(st.currentType), connectorStandard: s(st.connectorStandard), pricePerKwh: s(st.pricePerKwh), openingHours: s(st.openingHours), operationalStatus: st.operationalStatus, verificationStatus: st.verificationStatus, verifiedAt: s(st.verifiedAt) }} />
        </div></Card>
      ) : <Card><div className="p-5 text-sm">{st.address ?? `${st.lat}, ${st.lng}`} · {st.maxPowerKw ? `${st.maxPowerKw} kW` : "potência desconhecida"}</div></Card>}
      <Card>
        <CardHeader title="Histórico de alterações" />
        <ul className="divide-y divide-zinc-100 text-sm">{revisions.length === 0 && <li className="px-5 py-3 text-zinc-500">Sem correções manuais (dados como importados).</li>}{revisions.map((r) => (
          <li key={r.id} className="px-5 py-3"><p><strong>{r.user_name ?? "Sistema"}</strong> · {formatDateTime(r.created_at)} — {r.reason}</p>
            <details className="mt-1 text-xs text-zinc-600"><summary className="cursor-pointer">Ver antes/depois</summary><pre className="mt-1 overflow-x-auto rounded bg-zinc-50 p-2">{JSON.stringify({ antes: r.before, depois: r.after }, null, 2)}</pre></details></li>))}</ul>
      </Card>
    </div>
  );
}
