import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Badge, Card, CardHeader, DescriptionList, EmptyState, PageHeader } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { ConfirmForm } from "@/components/ui/confirm-form";
import { Table, Td, Th } from "@/components/ui/table";
import { DemoBanner, NatureBadge, ScoreGauge } from "@/components/intel/brand";
import { POWER_BANDS, STATION_STATUS } from "@/lib/intel/competition";
import { DIMENSIONS } from "@/lib/intel/potential-index";
import { formatCurrency, formatDate, formatDateTime, formatNumber } from "@/lib/format";
import { requirePagePermission } from "@/server/auth/dal";
import { AppError } from "@/server/errors";
import { getPropertyAnalysis, OBJECTIVES, OCCUPANCY, PROPERTY_STATUS, PROPERTY_TYPES } from "@/server/intel/properties";
import { createStudyAction, deletePropertyAction } from "../../actions";
import { NewStudyForm } from "./new-study-form";

export const metadata = { title: "Análise do imóvel" };
const yn = (b: boolean | null) => (b === null ? null : b ? "Sim" : "Não");

export default async function PropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ feito?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const { id } = await params;
  const sp = await searchParams;
  const data = await getPropertyAnalysis(ctx, id).catch((e) => { if (e instanceof AppError && (e.code === "not_found" || e.code === "forbidden")) notFound(); throw e; });
  const { p, analysis: a, studies, canEdit } = data;
  const st = PROPERTY_STATUS[p.status as keyof typeof PROPERTY_STATUS];
  return (
    <div className="space-y-6">
      {p.isDemo && <DemoBanner>Imóvel fictício.</DemoBanner>}
      <PageHeader title={p.name} breadcrumb={<Link href="/inteligencia/imoveis" className="hover:text-brand">Imóveis</Link>}
        description={<>{[p.address, p.district, p.city && `${p.city}/${p.uf ?? ""}`].filter(Boolean).join(" · ") || "Endereço não informado"} · <Badge tone={st.tone}>{st.label}</Badge> · {data.org}</>}
        actions={canEdit ? <><LinkButton href={`/inteligencia/imoveis/${id}/editar`} variant="outline">Editar</LinkButton>{p.lat !== null && <LinkButton href={`/inteligencia/mapa?lat=${p.lat}&lng=${p.lng}&z=15`} variant="outline">Ver no mapa</LinkButton>}</> : undefined} />
      {sp.feito === "salvo" && <Alert kind="success">Imóvel salvo.</Alert>}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Dados do imóvel" description={`Coordenadas: ${p.lat !== null ? `${p.lat.toFixed(6)}, ${p.lng!.toFixed(6)}` : "não informadas"}${p.geocodeSource ? ` (origem: ${p.geocodeSource})` : ""}`} />
          <DescriptionList items={[
            ["Área", p.areaM2 === null ? null : `${formatNumber(p.areaM2, 0)} m²${data.polygon ? " (polígono)" : ""}`], ["Aluguel mensal", p.monthlyRent === null ? null : formatCurrency(Number(p.monthlyRent))], ["Valor de venda", p.salePrice === null ? null : formatCurrency(Number(p.salePrice))],
            ["Tipo", p.propertyType ? PROPERTY_TYPES[p.propertyType as keyof typeof PROPERTY_TYPES] : null], ["Ocupação", p.occupancy ? OCCUPANCY[p.occupancy as keyof typeof OCCUPANCY] : null], ["Objetivo", p.objective ? OBJECTIVES[p.objective as keyof typeof OBJECTIVES] : null],
            ["Estacionamento", yn(p.parking)], ["Acesso direto pela rua", yn(p.streetAccess)], ["CEP", p.zip], ["Modelo", p.businessModel === "b2b" ? "B — Tebras B2B" : "A — Tebras Smart Hub"], ["Código IBGE", p.municipalityCode ? String(p.municipalityCode) : null], ["Atualizado", formatDateTime(p.updatedAt)], ["Anúncio", p.listingUrl ? <a href={p.listingUrl} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-brand hover:underline">Abrir anúncio</a> : null],
          ]} />
        </Card>
        <Card>
          <CardHeader title="Potencial do terreno" description={`Configuração ${a.indexVersion}`} />
          <div className="space-y-3 p-5">
            <ScoreGauge score={a.index.score} confidence={a.index.confidence} />
            <p className="text-sm">Cobertura dos dados: <strong>{Math.round(a.index.coverage * 100)}%</strong></p>
            <p className="text-xs text-zinc-600">{a.index.justification}</p>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Composição do índice" description="Cada dimensão só entra na nota se houver dados. Sem dados ≠ zero." />
        <Table>
          <thead><tr><Th>Dimensão</Th><Th className="text-right">Peso (hipótese)</Th><Th className="text-right">Nota 0–100</Th><Th>Base</Th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{a.index.dimensions.map((d) => (
            <tr key={d.key}><Td><span className="font-medium">{d.label}</span><p className="text-xs text-zinc-500">{DIMENSIONS[d.key].description}</p></Td><Td className="tabular text-right">{d.weight}</Td>
              <Td className="tabular text-right">{d.score === null ? <NatureBadge nature="sem_dados" /> : Math.round(d.score * 100)}</Td><Td className="text-sm text-zinc-600">{d.note}</Td></tr>))}</tbody>
        </Table>
        <div className="grid gap-4 border-t border-zinc-100 p-5 md:grid-cols-3 text-sm">
          <div><p className="font-semibold text-emerald-700">Fatores positivos</p><ul className="mt-1 list-disc pl-5 text-zinc-700">{a.index.positives.length ? a.index.positives.map((x) => <li key={x}>{x}</li>) : <li>Nenhum destacado</li>}</ul></div>
          <div><p className="font-semibold text-red-700">Riscos</p><ul className="mt-1 list-disc pl-5 text-zinc-700">{a.index.risks.length ? a.index.risks.map((x) => <li key={x}>{x}</li>) : <li>Nenhum destacado</li>}</ul></div>
          <div><p className="font-semibold text-amber-700">Informações ausentes</p><ul className="mt-1 list-disc pl-5 text-zinc-700">{a.index.missing.length ? a.index.missing.map((x) => <li key={x}>{x}</li>) : <li>Nenhuma</li>}</ul></div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Indicadores de potencial de demanda" description="Valor, unidade, natureza, fonte, data de referência, resolução e limitações de cada indicador." />
        <Table>
          <thead><tr><Th>Indicador</Th><Th className="text-right">Valor</Th><Th>Natureza</Th><Th>Fonte / referência</Th><Th>Resolução</Th><Th>Limitações</Th></tr></thead>
          <tbody className="divide-y divide-zinc-100">{[...Object.values(a.indicators), a.density].map((i) => (
            <tr key={i.key}><Td>{i.label}</Td><Td className="tabular text-right">{i.value === null ? "—" : `${formatNumber(i.value, i.value < 10 ? 2 : 0)} ${i.unit}`}</Td><Td><NatureBadge nature={i.nature} /></Td>
              <Td className="text-sm">{i.source ?? "—"}{i.referenceDate && <span className="block text-xs text-zinc-500">{formatDate(i.referenceDate)}</span>}</Td><Td className="text-sm">{i.resolution ?? "—"}</Td><Td className="max-w-xs text-xs text-zinc-600">{i.limitations ?? "—"}</Td></tr>))}
            <tr><Td>Distância até via principal</Td><Td className="tabular text-right">{a.located && a.road ? `${formatNumber(a.road.d ?? 0, 0)} m` : "—"}</Td><Td><NatureBadge nature={a.located && a.road ? (a.road.informed ? "premissa" : "observado") : "sem_dados"} /></Td><Td className="text-sm">{a.located && a.road ? (a.road.informed ? "Informado no cadastro" : `Malha OSM importada${a.road.name ? ` (${a.road.name})` : ""}`) : a.coverage.roadsLoaded ? "Nenhuma via principal em 5 km na malha" : "Malha viária não importada"}</Td><Td className="text-sm">ponto</Td><Td className="text-xs text-zinc-600">Linha reta até a geometria da via.</Td></tr>
            <tr><Td>Destinos em 1 km (POIs)</Td><Td className="tabular text-right">{a.located && a.pois.length ? a.pois.reduce((s, x) => s + x.n, 0) : "—"}</Td><Td><NatureBadge nature={a.located && a.coverage.poisLoaded ? "observado" : "sem_dados"} /></Td><Td className="text-sm">{a.located && a.pois.length ? a.pois.map((x) => `${x.category} (${x.n})`).join(", ") : "OpenStreetMap (importar extrato)"}</Td><Td className="text-sm">ponto</Td><Td className="text-xs text-zinc-600">Cobertura colaborativa do OSM é irregular.</Td></tr>
          </tbody>
        </Table>
        <p className="px-5 py-3 text-xs text-zinc-500">Fluxo de veículos que passa pela região não é demanda de recarga: o modelo de demanda usa a frota elétrica e premissas explícitas.</p>
      </Card>

      {a.located && a.competition && (
        <Card>
          <CardHeader title="Concorrência conhecida por raio" description={`${a.coverage.stationsLoaded} carregador(es) na base. Distâncias em linha reta.`} actions={<LinkButton href={`/inteligencia/concorrencia?imovel=${id}`} variant="outline" size="sm">Detalhar</LinkButton>} />
          <Table>
            <thead><tr><Th>Raio</Th><Th className="text-right">Carregadores</Th><Th className="text-right">Confirmados</Th><Th className="text-right">Potência conhecida</Th>{POWER_BANDS.map((b) => <Th key={b.key} className="text-right">{b.label}</Th>)}<Th>Preços (R$/kWh)</Th></tr></thead>
            <tbody className="divide-y divide-zinc-100">{a.competition.radii.map((r) => (
              <tr key={r.radiusKm}><Td>{r.radiusKm} km</Td><Td className="tabular text-right">{r.count}</Td><Td className="tabular text-right">{r.confirmed}</Td><Td className="tabular text-right">{r.knownPowerKw === null ? "—" : `${formatNumber(r.knownPowerKw, 0)} kW`}</Td>
                {POWER_BANDS.map((b) => <Td key={b.key} className="tabular text-right">{r.byBand[b.key]}</Td>)}<Td className="text-sm">{r.pricesPerKwh ? `${formatNumber(r.pricesPerKwh.min, 2)}–${formatNumber(r.pricesPerKwh.max, 2)} (n=${r.pricesPerKwh.n})` : "—"}</Td></tr>))}</tbody>
          </Table>
          <div className="space-y-1 border-t border-zinc-100 px-5 py-3 text-sm">
            {a.competition.interpretation.map((x) => <p key={x} className="text-zinc-800">{x}</p>)}
            {a.competition.dataGaps.map((x) => <p key={x} className="text-xs text-amber-800">⚠ {x}</p>)}
          </div>
          {a.competition.nearest.length > 0 && <ul className="divide-y divide-zinc-100 border-t border-zinc-100 text-sm">{a.competition.nearest.slice(0, 5).map((s) => <li key={s.id} className="flex justify-between gap-3 px-5 py-2"><Link href={`/inteligencia/concorrencia/${s.id}`} className="hover:text-brand">{s.name ?? "Sem nome"} · {s.operator ?? "operador não informado"}</Link><span className="text-zinc-500">{formatNumber(s.distanceM / 1000, 2)} km · {s.maxPowerKw ? `${s.maxPowerKw} kW` : "potência ?"} · <Badge tone={STATION_STATUS[s.status].tone}>{STATION_STATUS[s.status].label}</Badge></span></li>)}</ul>}
        </Card>
      )}
      {!a.located && <Alert kind="warning" title="Imóvel sem coordenadas">Concorrência, distâncias e indicadores pontuais não podem ser calculados. Informe latitude/longitude ou selecione o ponto no mapa.</Alert>}

      <Card>
        <CardHeader title="Estudos de viabilidade" description="Infraestrutura, baixa tensão, demanda (3 cenários) e financeiro." />
        {studies.length === 0 ? <EmptyState title="Nenhum estudo" description="Crie um estudo para dimensionar carregadores e projetar demanda e resultado." /> : (
          <ul className="divide-y divide-zinc-100">{studies.map((s) => <li key={s.id} className="flex justify-between px-5 py-3 text-sm"><Link href={`/inteligencia/estudos/${s.id}`} className="font-medium hover:text-brand">{s.name}</Link><span className="text-zinc-500">{s.status} · {formatDateTime(s.updatedAt)}</span></li>)}</ul>
        )}
        {canEdit && <div className="border-t border-zinc-100 p-5"><NewStudyForm action={createStudyAction.bind(null, id)} /></div>}
      </Card>
      {canEdit && studies.length === 0 && (
        <div className="text-right"><ConfirmForm action={deletePropertyAction.bind(null, id)} title="Excluir imóvel" message="Excluir este imóvel? A exclusão fica registrada na auditoria." triggerLabel="Excluir imóvel" confirmLabel="Excluir" /></div>
      )}
    </div>
  );
}
