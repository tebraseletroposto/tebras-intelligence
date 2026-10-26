import { Badge, Card, CardHeader } from "@/components/ui/misc";
import { Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { DEFAULT_INDEX_CONFIG, type IndexConfig } from "@/lib/intel/potential-index";
import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { indexVersions } from "@/server/intel/orgs";
import { activateIndexAction, saveIndexConfigAction } from "../actions";
import { IndexForm } from "./index-form";

export const metadata = { title: "Configurações" };

export default async function SettingsPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const versions = await indexVersions(ctx);
  const active = versions.find((v) => v.active);
  const admin = can(ctx, "inteligencia.admin");
  const env = (k: string) => (process.env[k] ? "configurado" : "padrão");
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold">Configurações</h1><p className="text-sm text-zinc-600">Índice de Potencial, provedores externos e políticas de dados.</p></div>
      <Card>
        <CardHeader title="Índice de Potencial Tebras" description={`Versão ativa: ${active?.version ?? "padrão (não salva)"}. Pesos NÃO são cientificamente comprovados: são hipóteses de modelagem até calibração com dados reais.`} />
        <div className="p-5">{admin ? <IndexForm action={saveIndexConfigAction} config={(active?.config as IndexConfig) ?? DEFAULT_INDEX_CONFIG} /> : <pre className="overflow-x-auto rounded bg-zinc-50 p-3 text-xs">{JSON.stringify(active?.config ?? DEFAULT_INDEX_CONFIG, null, 2)}</pre>}</div>
        <Table><thead><tr><Th>Versão</Th><Th>Criada em</Th><Th>Justificativa</Th><Th /></tr></thead>
          <tbody className="divide-y divide-zinc-100">{versions.map((v) => <tr key={v.id}><Td>{v.version}{v.active && <Badge tone="success" className="ml-2">ativa</Badge>}</Td><Td>{formatDateTime(v.createdAt)}</Td><Td className="text-sm">{v.notes}</Td><Td>{admin && !v.active && <form action={activateIndexAction.bind(null, v.id)}><button className="text-xs text-brand hover:underline">Reativar</button></form>}</Td></tr>)}</tbody></Table>
      </Card>
      <Card>
        <CardHeader title="Provedores externos (variáveis de ambiente)" description="Valores nunca são exibidos. Configure no servidor (.env.local / provedor de hospedagem)." />
        <Table><thead><tr><Th>Variável</Th><Th>Finalidade</Th><Th>Situação</Th></tr></thead><tbody className="divide-y divide-zinc-100">
          {[["MAP_TILE_URL", "Mapa base (tiles). Produção: provedor contratado ou servidor próprio"], ["NOMINATIM_URL", "Geocodificação (instância própria recomendada em produção)"], ["OVERPASS_URL", "Consultas OSM por área"], ["IBGE_API_URL", "API do IBGE"], ["OPEN_CHARGE_MAP_API_KEY", "Diretório Open Charge Map"], ["INTEL_USER_AGENT", "Identificação nas APIs públicas (com contato)"]].map(([k, d]) => <tr key={k}><Td className="font-mono text-xs">{k}</Td><Td className="text-sm">{d}</Td><Td>{env(k)}</Td></tr>)}
        </tbody></Table>
      </Card>
      <Card><CardHeader title="Privacidade, LGPD e retenção" /><ul className="list-disc space-y-1 py-3 pl-9 pr-5 text-sm text-zinc-700">
        <li>Dados de mobilidade: somente agregados e não identificáveis. O sistema não armazena trajetos individuais nem identificadores de motoristas.</li>
        <li>Arquivos importados são preservados para proveniência; exclusão autorizada pelo administrador do banco conforme docs/INTELLIGENCE.md (retenção padrão: enquanto vigente a autorização de uso da fonte).</li>
        <li>Toda alteração em imóveis, estudos, organizações, vínculos e versões do modelo é registrada na trilha de auditoria.</li></ul></Card>
    </div>
  );
}
