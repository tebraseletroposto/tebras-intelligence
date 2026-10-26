import Image from "next/image";
import Link from "next/link";
import { Alert, Badge, Card, CardHeader, EmptyState } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { Stat } from "@/components/intel/brand";
import { formatCurrency, formatDateTime, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { intelDashboard } from "@/server/intel/dashboard";
import { SOURCE_STATUS } from "@/server/intel/sources";

export const metadata = { title: "Dashboard" };

export default async function IntelDashboardPage() {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const d = await intelDashboard(ctx);
  const working = d.sources.find((s) => s.status === "funcionando")?.n ?? 0;
  const manual = d.sources.find((s) => s.status === "importacao_manual")?.n ?? 0;
  const totalSources = d.sources.reduce((a, b) => a + b.n, 0);
  return (
    <div className="space-y-6">
      {!d.scope.currentOrgId && <Alert kind="warning" title="Sem organização">Você ainda não está vinculado a uma organização. Um administrador pode vincular você em Franquias.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Imóveis cadastrados" value={formatNumber(d.counts.properties)} hint={`${d.counts.located} com coordenadas`} />
        <Stat label="Estudos em andamento" value={formatNumber(d.counts.studies)} />
        <Stat label="Imóveis com informações insuficientes" value={formatNumber(d.counts.incomplete)} hint="Sem coordenadas, área ou aluguel" />
        <Stat label="Fontes funcionando" value={`${working} / ${totalSources}`} hint={`${manual} por importação manual — testadas no Catálogo`} tone="dark" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Projetos com maior potencial estimado" description="Índice de Potencial Tebras (0–100) com a confiança de cada nota." actions={<LinkButton href="/inteligencia/analise" variant="outline" size="sm">Ranking completo</LinkButton>} />
          {d.topPotential.length === 0 ? <EmptyState title="Nenhum estudo calculado" description="Cadastre um imóvel e crie um estudo para ver o índice." action={<LinkButton href="/inteligencia/imoveis/novo">Cadastrar imóvel</LinkButton>} /> : (
            <ul className="divide-y divide-zinc-100">
              {d.topPotential.map((r) => (
                <li key={r.study.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <Link href={`/inteligencia/estudos/${r.study.id}`} className="font-medium hover:text-brand">{r.property.name}</Link>
                    <p className="truncate text-xs text-zinc-500">{[r.property.city, r.property.uf].filter(Boolean).join("/") || "Local não informado"} · {r.study.name}</p>
                  </div>
                  <div className="flex items-center gap-2"><Badge tone="dark">{r.index.score}</Badge><Badge>{r.index.confidence}</Badge>{r.property.isDemo && <Badge tone="brand">DEMONSTRAÇÃO</Badge>}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="overflow-hidden">
          <div className="relative h-full min-h-64 bg-ink">
            <Image src="/brand/intelligence/mascote.webp" alt="Mascote Tebras segurando o raio" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover object-top opacity-90" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink via-ink/80 to-transparent p-5 text-white">
              <p className="text-sm font-semibold">Base de conhecimento</p>
              <p className="text-xs text-zinc-300">{formatNumber(d.knowledge.stations)} carregadores públicos · {formatNumber(d.knowledge.municipalities)} municípios · {formatNumber(d.knowledge.indicators)} indicadores · {formatNumber(d.knowledge.roads)} vias · {formatNumber(d.knowledge.pois)} POIs</p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Melhor resultado financeiro estimado" description="Resultado operacional do ano 1 no cenário selecionado de cada estudo (não é lucro líquido)." />
          {d.topFinance.length === 0 ? <EmptyState title="Sem projeções financeiras" description="Projeções exigem demanda estimável (frota importada ou premissa informada)." /> : (
            <ul className="divide-y divide-zinc-100">
              {d.topFinance.map((r) => (
                <li key={r.study.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <Link href={`/inteligencia/estudos/${r.study.id}`} className="font-medium hover:text-brand">{r.property.name}</Link>
                  <span className={`tabular font-semibold ${r.scenario.finance!.firstYear.operatingResult < 0 ? "text-red-700" : ""}`}>{formatCurrency(r.scenario.finance!.firstYear.operatingResult)}</span>
                </li>
              ))}
            </ul>
          )}
          {d.insufficient > 0 && <p className="border-t border-zinc-100 px-5 py-3 text-xs text-amber-800">{d.insufficient} estudo(s) com dados insuficientes para estimar demanda ou potencial.</p>}
        </Card>
        <Card>
          <CardHeader title="Oportunidades por região" description="Imóveis da organização ativa por município." />
          {d.byRegion.length === 0 ? <EmptyState title="Sem imóveis" /> : (
            <ul className="divide-y divide-zinc-100">{d.byRegion.map((r, i) => <li key={i} className="flex justify-between px-5 py-2.5 text-sm"><span>{r.city ?? "Município não informado"}{r.uf ? `/${r.uf}` : ""}</span><span className="tabular font-semibold">{r.n}</span></li>)}</ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Importações recentes" actions={<LinkButton href="/inteligencia/importacao" variant="outline" size="sm">Importar dados</LinkButton>} />
        {d.imports.length === 0 ? <EmptyState title="Nenhuma importação" description="Importe planilhas de carregadores, frota (SENATRAN), imóveis ou arquivos autorizados do EVIE." /> : (
          <ul className="divide-y divide-zinc-100">{d.imports.map((i) => <li key={i.id} className="flex flex-wrap justify-between gap-2 px-5 py-2.5 text-sm"><span className="font-medium">{i.file_name}</span><span className="text-zinc-500">{i.target} · {i.inserted_rows} registro(s) · {formatDateTime(i.created_at)} <Badge tone={i.status === "concluida" ? "success" : "warning"}>{i.status}</Badge></span></li>)}</ul>
        )}
      </Card>
      <p className="text-xs text-zinc-500">Situação das fontes: {d.sources.map((s) => `${SOURCE_STATUS[s.status as keyof typeof SOURCE_STATUS]?.label ?? s.status}: ${s.n}`).join(" · ")}.</p>
    </div>
  );
}
