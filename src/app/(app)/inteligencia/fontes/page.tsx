import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { formatDateTime, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { listSources, SOURCE_STATUS } from "@/server/intel/sources";
import { ibgeImportAction, ocmImportAction, osmImportAction, sourceTestAction } from "../actions";
import { BboxForm, IbgeForm, RadiusForm, TestButton } from "./forms";

export const metadata = { title: "Catálogo de fontes" };
const TESTABLE = new Set(["ibge_localidades", "ibge_populacao", "osm_nominatim", "osm_overpass", "open_charge_map", "osm_tiles"]);

export default async function SourcesPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const sources = await listSources(ctx);
  const admin = can(ctx, "inteligencia.admin");
  const importer = admin || can(ctx, "inteligencia.import");
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Catálogo de dados</h1><p className="text-sm text-zinc-600">Situação real de cada fonte. “Funcionando” só é atribuído após um teste ou importação bem-sucedidos.</p></div>
      {importer && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card><CardHeader title="IBGE — municípios e Censo 2022" description="Atualização incremental por UF." /><div className="p-4"><IbgeForm action={ibgeImportAction} /></div></Card>
          <Card><CardHeader title="OpenStreetMap — carregadores por área" description="Overpass público: área máx. 1,5°. Registros entram como não verificados." /><div className="p-4"><BboxForm action={osmImportAction} label="Importar do OSM" /></div></Card>
          <Card><CardHeader title="Open Charge Map" description="Exige OPEN_CHARGE_MAP_API_KEY no servidor." /><div className="p-4"><RadiusForm action={ocmImportAction} /></div></Card>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {sources.map((s) => { const st = SOURCE_STATUS[s.status as keyof typeof SOURCE_STATUS]; return (
          <Card key={s.key}>
            <CardHeader title={s.name} description={s.description} actions={<Badge tone={st.tone}>{st.label}</Badge>} />
            <dl className="grid gap-x-4 gap-y-2 px-5 py-4 text-sm sm:grid-cols-2">
              {([["Categoria", s.category], ["Tipo de acesso", s.accessType], ["Formatos", s.formats], ["Cobertura", s.coverage], ["Atualização", s.updateFrequency], ["Licença/condições", s.license], ["Qualidade", s.quality], ["Registros na base", formatNumber(s.liveCount)], ["Última importação", s.lastImportAt ? formatDateTime(s.lastImportAt) : "nunca"], ["Último teste", s.lastTestAt ? `${formatDateTime(s.lastTestAt)} — ${s.lastTestOk ? "OK" : "falhou"}` : "não testada"]] as [string, string | null][]).map(([k, v]) => <div key={k}><dt className="text-xs text-zinc-500">{k}</dt><dd>{v ?? "—"}</dd></div>)}
              {s.restrictions && <div className="sm:col-span-2"><dt className="text-xs text-zinc-500">Restrições conhecidas</dt><dd className="text-zinc-700">{s.restrictions}</dd></div>}
              {s.officialUrl && <div className="sm:col-span-2"><dt className="text-xs text-zinc-500">URL oficial</dt><dd><a href={s.officialUrl} target="_blank" rel="noreferrer" className="break-all text-brand hover:underline">{s.officialUrl}</a></dd></div>}
              {(s.lastError || s.recentImportErrors > 0) && <div className="sm:col-span-2"><dt className="text-xs text-zinc-500">Erros recentes</dt><dd className="text-red-700">{s.lastError}{s.recentImportErrors > 0 && ` · ${s.recentImportErrors} importação(ões) com erro em 30 dias`}</dd></div>}
            </dl>
            {admin && TESTABLE.has(s.key) && <div className="border-t border-zinc-100 px-5 py-3"><TestButton action={sourceTestAction.bind(null, s.key)} /></div>}
          </Card>); })}
      </div>
    </div>
  );
}
