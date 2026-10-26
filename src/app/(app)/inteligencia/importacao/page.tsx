import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { IMPORT_TARGETS } from "@/lib/intel/importer";
import { formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { INDICATOR_DEFS } from "@/server/intel/analysis";
import { GEOJSON_TARGETS, listImports } from "@/server/intel/imports";
import { listProperties } from "@/server/intel/properties";
import { listSources } from "@/server/intel/sources";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Importação de dados" };

export default async function ImportPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const allowed = can(ctx, "inteligencia.import") || can(ctx, "inteligencia.admin");
  const [imports, sources, props] = await Promise.all([listImports(ctx), listSources(ctx), allowed ? listProperties(ctx, { status: "implantado" }) : null]);
  const targets = { ...Object.fromEntries(Object.entries(IMPORT_TARGETS).map(([k, v]) => [k, { label: v.label, fields: v.fields.map((f) => ({ key: f.key, label: f.label, required: "required" in f ? f.required : undefined, unit: "unit" in f ? f.unit : undefined })) }])), ...Object.fromEntries(Object.entries(GEOJSON_TARGETS).map(([k, v]) => [k, { label: `${v} — GeoJSON`, fields: [] }])) };
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Importação de dados</h1><p className="text-sm text-zinc-600">Identificação de colunas, mapeamento, validação de tipos e unidades, duplicidades, coordenadas inválidas, datas ausentes, prévia e cancelamento antes da gravação. O arquivo original é preservado.</p></div>
      {allowed ? <ImportWizard targets={targets} sources={sources.map((s) => [s.key, s.name])} properties={(props?.rows ?? []).map((r) => [r.p.id, r.p.name])} indicators={Object.keys(INDICATOR_DEFS)} isAdmin={can(ctx, "inteligencia.admin")} />
        : <Card><div className="p-5 text-sm text-zinc-600">Seu perfil não permite importar dados.</div></Card>}
      <Card>
        <CardHeader title="Histórico de importações" description="Cada importação registra fonte, arquivo (hash SHA-256), mapeamento, responsável e resultado." />
        {imports.length === 0 ? <EmptyState title="Nenhuma importação" /> : (
          <Table>
            <thead><tr><Th>Data</Th><Th>Arquivo</Th><Th>Destino</Th><Th>Fonte</Th><Th className="text-right">Linhas</Th><Th className="text-right">Gravados</Th><Th>Situação</Th><Th>Responsável</Th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{imports.map(({ i, source, user }) => (
              <tr key={i.id}><Td>{formatDateTime(i.createdAt)}</Td><Td><Link href={`/inteligencia/importacao/${i.id}/arquivo`} prefetch={false} className="hover:text-brand">{i.fileName}</Link><p className="text-[11px] text-zinc-500">{i.organizationId ? "privado" : "público"}{i.usageConditions ? ` · ${i.usageConditions}` : ""}</p></Td><Td>{i.target}</Td><Td>{source}</Td>
                <Td className="tabular text-right">{i.totalRows}</Td><Td className="tabular text-right">{i.insertedRows}</Td><Td><Badge tone={i.status === "concluida" ? "success" : i.status === "falhou" ? "danger" : "warning"}>{i.status}</Badge></Td><Td>{user ?? "—"}</Td></tr>))}</tbody>
          </Table>
        )}
      </Card>
      <Card><CardHeader title="Formatos" /><ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm text-zinc-700"><li>CSV (vírgula, ponto e vírgula ou tabulação; UTF-8), XLSX (primeira aba), GeoJSON (FeatureCollection).</li><li>GeoPackage: converta para GeoJSON (<code>ogr2ogr -f GeoJSON saida.geojson entrada.gpkg</code>).</li><li>EVIE: o mapeamento é configurável porque a estrutura dos arquivos pode variar; colunas não mapeadas são preservadas no arquivo original.</li></ul></Card>
    </div>
  );
}
