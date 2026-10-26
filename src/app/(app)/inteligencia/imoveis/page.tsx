import Link from "next/link";
import { Alert, Badge, Card, EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Pagination, SortableTh, Table, Td, Th, buildHref } from "@/components/ui/table";
import { UFS } from "@/lib/domain/documents";
import { formatCurrency, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { listProperties, OBJECTIVES, OCCUPANCY, PROPERTY_STATUS, PROPERTY_TYPES, type PropertyFilters } from "@/server/intel/properties";

export const metadata = { title: "Buscar imóveis" };

const sel = "h-9 rounded-md border border-zinc-300 bg-white px-2 text-sm";
const inp = "h-9 w-full rounded-md border border-zinc-300 px-2 text-sm";

export default async function PropertiesPage({ searchParams }: { searchParams: Promise<PropertyFilters & { feito?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const sp = await searchParams;
  const { rows, total, page, pageSize } = await listProperties(ctx, sp);
  const params = { ...sp, feito: undefined };
  const filterInputs: [keyof PropertyFilters, string, string?][] = [["q", "Nome ou endereço"], ["city", "Município"], ["district", "Bairro"], ["zip", "CEP"], ["minArea", "Área mín. (m²)"], ["maxArea", "Área máx. (m²)"], ["maxRent", "Aluguel máx. (R$)"], ["maxSale", "Venda máx. (R$)"], ["maxRoadM", "Dist. máx. via principal (m)"]];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Buscar imóveis</h1><p className="text-sm text-zinc-600">{total} imóvel(is) na organização ativa. Filtros por características e localização.</p></div>
        <div className="flex gap-2">
          <LinkButton href={buildHref("/inteligencia/imoveis/exportar", params)} variant="outline" prefetch={false}>Exportar CSV</LinkButton>
          <LinkButton href="/inteligencia/mapa" variant="outline">Ver no mapa</LinkButton>
          <LinkButton href="/inteligencia/imoveis/novo">Cadastrar imóvel</LinkButton>
        </div>
      </div>
      {sp.feito === "excluido" && <Alert kind="success">Imóvel excluído.</Alert>}
      <Card>
        <form method="get" className="grid gap-2 border-b border-zinc-100 p-4 sm:grid-cols-3 lg:grid-cols-6" aria-label="Filtros">
          {filterInputs.map(([k, l]) => <label key={k} className="text-xs text-zinc-600">{l}<input name={k} defaultValue={sp[k] ?? ""} className={inp} /></label>)}
          <label className="text-xs text-zinc-600">UF<select name="uf" defaultValue={sp.uf ?? ""} className={`${sel} w-full`}><option value="">Todas</option>{UFS.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="text-xs text-zinc-600">Tipo<select name="type" defaultValue={sp.type ?? ""} className={`${sel} w-full`}><option value="">Todos</option>{Object.entries(PROPERTY_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs text-zinc-600">Ocupação<select name="occupancy" defaultValue={sp.occupancy ?? ""} className={`${sel} w-full`}><option value="">Todas</option>{Object.entries(OCCUPANCY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs text-zinc-600">Situação<select name="status" defaultValue={sp.status ?? ""} className={`${sel} w-full`}><option value="">Todas</option>{Object.entries(PROPERTY_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></label>
          <label className="text-xs text-zinc-600">Estacionamento<select name="parking" defaultValue={sp.parking ?? ""} className={`${sel} w-full`}><option value="">Indiferente</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
          <label className="text-xs text-zinc-600">Acesso pela rua<select name="streetAccess" defaultValue={sp.streetAccess ?? ""} className={`${sel} w-full`}><option value="">Indiferente</option><option value="sim">Sim</option><option value="nao">Não</option></select></label>
          <label className="text-xs text-zinc-600">Objetivo<select name="objective" defaultValue={sp.objective ?? ""} className={`${sel} w-full`}><option value="">Todos</option>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label className="text-xs text-zinc-600">Modelo<select name="businessModel" defaultValue={sp.businessModel ?? ""} className={`${sel} w-full`}><option value="">Todos</option><option value="smart_hub">Smart Hub</option><option value="b2b">B2B</option></select></label>
          <div className="flex items-end gap-2"><button className="h-9 rounded-md bg-ink px-4 text-sm font-medium text-white">Filtrar</button><Link href="/inteligencia/imoveis" className="text-sm text-zinc-500 hover:text-brand">Limpar</Link></div>
        </form>
        <p className="border-b border-zinc-100 px-4 py-2 text-xs text-zinc-500">Proximidade de rodovias, aeroportos, terminais, shoppings, condomínios e empresas é avaliada na análise de cada imóvel a partir dos POIs/vias importados (OSM). Quantidade de carregadores próximos: coluna “Carregadores 3 km”.</p>
        {rows.length === 0 ? <EmptyState title="Nenhum imóvel encontrado" description="Ajuste os filtros ou cadastre um imóvel." action={<LinkButton href="/inteligencia/imoveis/novo">Cadastrar imóvel</LinkButton>} /> : (
          <Table>
            <thead><tr>
              <SortableTh label="Imóvel" field="name" base="/inteligencia/imoveis" params={params} />
              <SortableTh label="Município" field="city" base="/inteligencia/imoveis" params={params} />
              <SortableTh label="Área" field="area" base="/inteligencia/imoveis" params={params} className="text-right" />
              <SortableTh label="Aluguel" field="rent" base="/inteligencia/imoveis" params={params} className="text-right" />
              <Th className="text-right">Carregadores 3 km</Th><Th>Estudos</Th><Th>Situação</Th>
            </tr></thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map(({ p, studies, competitors3km }) => (
                <tr key={p.id} className="hover:bg-zinc-50">
                  <Td><Link href={`/inteligencia/imoveis/${p.id}`} className="font-medium hover:text-brand">{p.name}</Link>{p.isDemo && <Badge tone="brand" className="ml-2">DEMONSTRAÇÃO</Badge>}<p className="text-xs text-zinc-500">{p.address ?? "Endereço não informado"}{p.lat === null && " · sem coordenadas"}</p></Td>
                  <Td>{p.city ? `${p.city}/${p.uf ?? "?"}` : <span className="text-zinc-400">—</span>}</Td>
                  <Td className="tabular text-right">{p.areaM2 === null ? <span className="text-zinc-400">—</span> : `${formatNumber(p.areaM2, 0)} m²`}</Td>
                  <Td className="tabular text-right">{p.monthlyRent === null ? <span className="text-zinc-400">—</span> : formatCurrency(Number(p.monthlyRent))}</Td>
                  <Td className="tabular text-right">{competitors3km === null ? <span className="text-zinc-400" title="Sem coordenadas">—</span> : competitors3km}</Td>
                  <Td>{studies}</Td>
                  <Td><Badge tone={PROPERTY_STATUS[p.status as keyof typeof PROPERTY_STATUS].tone}>{PROPERTY_STATUS[p.status as keyof typeof PROPERTY_STATUS].label}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Pagination base="/inteligencia/imoveis" params={params} page={page} pageCount={Math.max(1, Math.ceil(total / pageSize))} total={total} />
      </Card>
    </div>
  );
}
