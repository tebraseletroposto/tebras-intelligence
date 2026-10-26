import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { intelChargingStations, intelDataSources, intelGeographicIndicators, intelMemberships, intelMunicipalities, intelOrganizations, intelProperties, intelStudies } from "@/db/schema";
import { AppError } from "@/server/errors";
import { geocode, ibgeMunicipalities, ibgePopulation, osmPowerKw, parseOverpassStations, testSource, type Fetcher } from "@/server/intel/adapters";
import { commitImport, getImportFile, listImports, previewImport } from "@/server/intel/imports";
import { heatLayer, pointLayers } from "@/server/intel/layers";
import { saveIndexConfig, saveOrganization, setMembership } from "@/server/intel/orgs";
import { getProperty, listProperties, saveProperty } from "@/server/intel/properties";
import { importIbgeState, runSourceTest, saveStation } from "@/server/intel/sources";
import { addRevenue, createStudy, getStudy, rankingData, shareStudy, snapshotForecast, updateStudySection } from "@/server/intel/studies";
import { intelDashboard } from "@/server/intel/dashboard";
import { renderStudyPdf, renderRankingXlsx, rankingCsv } from "@/server/intel/reports";
import { DEFAULT_DEMAND, DEFAULT_FINANCE } from "@/lib/intel/study-schema";
import { makeUser } from "../support/factory";

afterAll(closeDb);
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof AppError ? e.code : String(e); } };

/** Respostas gravadas no formato documentado das APIs (testes sem rede). */
const fakeFetch = (routes: Record<string, unknown>, status = 200): Fetcher => (async (url: string | URL | Request) => {
  const u = String(url);
  const key = Object.keys(routes).find((k) => u.includes(k));
  if (!key) return new Response("not found", { status: 404 });
  return new Response(JSON.stringify(routes[key]), { status, headers: { "Content-Type": "application/json" } });
}) as Fetcher;

let orgA: string, orgB: string;
let admin: Awaited<ReturnType<typeof makeUser>>, analystA: Awaited<ReturnType<typeof makeUser>>, franchiseB: Awaited<ReturnType<typeof makeUser>>, viewerA: Awaited<ReturnType<typeof makeUser>>;

beforeAll(async () => {
  admin = await makeUser(["admin"]);
  analystA = await makeUser(["inteligencia"]);
  franchiseB = await makeUser(["franqueado"]);
  viewerA = await makeUser(["consulta"]);
  orgA = (await saveOrganization(admin.ctx, null, { name: `Franquia A ${Date.now()}`, kind: "franquia", regions: ["SP"] })).id;
  orgB = (await saveOrganization(admin.ctx, null, { name: `Franquia B ${Date.now()}`, kind: "franquia", regions: ["RJ"] })).id;
  await setMembership(admin.ctx, orgA, { email: analystA.user.email, role: "analista" });
  await setMembership(admin.ctx, orgB, { email: franchiseB.user.email, role: "franqueado" });
  await setMembership(admin.ctx, orgA, { email: viewerA.user.email, role: "consulta" });
  // Município de teste (São Paulo) com população/área e frota importadas
  await getDb().insert(intelMunicipalities).values({ ibgeCode: 3550308, name: "São Paulo", uf: "SP", population: 11451999, areaKm2: 1521.2, lat: -23.5505, lng: -46.6333, populationReference: "Censo 2022", sourceKey: "ibge_localidades" }).onConflictDoNothing();
});

describe("Tebras Intelligence — imóveis e isolamento entre organizações", () => {
  let propA: string;
  it("cadastra imóvel com coordenadas e polígono (área calculada) na organização ativa", async () => {
    const ring = [[-46.6560, -23.5615], [-46.6550, -23.5615], [-46.6550, -23.5608], [-46.6560, -23.5608], [-46.6560, -23.5615]];
    const r = await saveProperty(analystA.ctx, null, { name: "Terreno Paulista", address: "Av. Paulista, 1000", city: "São Paulo", uf: "SP", zip: "01310-100", lat: "-23,5612", lng: "-46,6555", polygon: JSON.stringify({ type: "Polygon", coordinates: [ring] }), monthlyRent: "12.000,00", parking: "sim", streetAccess: "sim", businessModel: "smart_hub", status: "prospeccao" });
    propA = r.id;
    expect(r.organizationId).toBe(orgA);
    const [p] = await getDb().select().from(intelProperties).where(eq(intelProperties.id, propA));
    expect(p.areaM2).toBeGreaterThan(7000);
    expect(p.municipalityCode).toBe(3550308);
    expect(Number(p.monthlyRent)).toBe(12000);
  });
  it("rejeita coordenadas inválidas ou fora do Brasil", async () => {
    expect(await code(saveProperty(analystA.ctx, null, { name: "X", lat: "0", lng: "0" }))).toBe("validation");
    expect(await code(saveProperty(analystA.ctx, null, { name: "X", lat: "40.7", lng: "-74" }))).toBe("validation");
  });
  it("franqueado de outra organização não vê nem edita o imóvel", async () => {
    expect(await code(getProperty(franchiseB.ctx, propA))).toBe("forbidden");
    expect(await code(saveProperty(franchiseB.ctx, propA, { name: "Invadido" }))).toBe("forbidden");
    const list = await listProperties(franchiseB.ctx);
    expect(list.rows.map((r) => r.p.id)).not.toContain(propA);
  });
  it("papel 'consulta' vê, mas não edita", async () => {
    expect((await getProperty(viewerA.ctx, propA)).p.name).toBe("Terreno Paulista");
    expect(await code(saveProperty(viewerA.ctx, propA, { name: "Alterado" }))).toBe("forbidden");
  });
  it("usuário sem vínculo não cadastra imóvel", async () => {
    const lone = await makeUser(["inteligencia"]);
    expect(await code(saveProperty(lone.ctx, null, { name: "Sem org" }))).toBe("forbidden");
  });
  it("RLS do banco: papel sem privilégios só enxerga linhas das organizações definidas na transação", async () => {
    const db = getDb();
    await db.execute(sql`do $$ begin if not exists (select 1 from pg_roles where rolname = 'intel_rls_probe') then create role intel_rls_probe nologin; end if; end $$`);
    await db.execute(sql`grant usage on schema public to intel_rls_probe`);
    await db.execute(sql`grant select on intel_properties, intel_studies, intel_study_shares to intel_rls_probe`);
    const count = (orgs: string) => db.transaction(async (tx) => {
      await tx.execute(sql`set local role intel_rls_probe`);
      await tx.execute(sql`select set_config('app.intel_orgs', ${orgs}, true), set_config('app.intel_global', 'off', true)`);
      return (await tx.execute<{ n: number }>(sql`select count(*)::int as n from intel_properties where id = ${propA}`)).rows[0].n;
    });
    expect(await count(orgA)).toBe(1);
    expect(await count(orgB)).toBe(0);
    expect(await count("")).toBe(0);
  });

  describe("análise, estudo, demanda e financeiro", () => {
    let studyId: string;
    beforeAll(async () => {
      await getDb().insert(intelChargingStations).values([
        { sourceKey: "manual", externalId: `t1-${Date.now()}`, name: "Concorrente 1", lat: -23.5600, lng: -46.6550, maxPowerKw: 60, verificationStatus: "confirmado", verifiedAt: "2026-09-01" },
        { sourceKey: "manual", externalId: `t2-${Date.now()}`, name: "Concorrente 2", lat: -23.5800, lng: -46.6550, maxPowerKw: 22 },
      ]);
      await getDb().insert(intelGeographicIndicators).values({ indicator: "frota_bev", municipalityCode: 3550308, value: 20000, unit: "veículos", nature: "observado", referenceDate: "2026-08-01", resolution: "município", quality: "media", sourceKey: "senatran_frota" });
    });
    it("cria estudo, usa frota importada (observada) e calcula 3 cenários", async () => {
      studyId = (await createStudy(analystA.ctx, propA, { name: "Estudo inicial" })).id;
      await updateStudySection(analystA.ctx, studyId, "finance", { ...DEFAULT_FINANCE, energyCostPerKwh: 0.9, revenueTaxRate: 0.12, capex: [{ label: "Obras", amount: 80000 }] });
      await updateStudySection(analystA.ctx, studyId, "chargers", [{ label: "60 kW DC", powerKw: 60, current: "DC", quantity: 2, unitCost: 120000, installCost: 20000, efficiency: 0.94 }]);
      const s = await getStudy(analystA.ctx, studyId);
      expect(s.inputsOrigin.bevFleet).toMatchObject({ value: 20000, nature: "observado" });
      expect(s.inputsOrigin.competitors.nature).toBe("observado");
      expect(s.location.competition!.radii.find((r) => r.radiusKm === 1)!.count).toBe(1);
      expect(s.location.index.score).not.toBeNull();
      const base = s.scenarios.base;
      expect(base.forecast.energyPerMonthKwh).toBeGreaterThan(0);
      expect(base.finance!.initialInvestment).toBeCloseTo((280000 + 80000) * 1.1);
      expect(s.scenarios.otimista.forecast.energyPerMonthKwh!).toBeGreaterThan(s.scenarios.conservador.forecast.energyPerMonthKwh!);
      // 2 × 60 kW × 0,8 = 96 kW > referência de 75 kW para BT
      expect(s.lv.classification).toBe("provavel_adequacao");
      expect(s.nature).toMatch(/Preliminar/);
    });
    it("sobrescrita manual vira premissa; receita hipotética não entra no resultado", async () => {
      await updateStudySection(analystA.ctx, studyId, "demand", { ...DEFAULT_DEMAND, bevFleetOverride: 1000 });
      await addRevenue(analystA.ctx, studyId, { category: "cafe", name: "Café", status: "hipotese", grossMonthly: "5000", costsMonthly: "0", commissionRate: "0", taxRate: "0", initialInvestment: "0", confidence: "baixa", commercialModel: "" });
      const s = await getStudy(analystA.ctx, studyId);
      expect(s.inputsOrigin.bevFleet.nature).toBe("premissa");
      expect(s.scenarios.base.finance!.excludedComplementary).toEqual(["Café (Hipótese)"]);
      expect(s.scenarios.base.finance!.monthly[0].complementaryNet).toBe(0);
    });
    it("dados privados de outra organização não entram na análise", async () => {
      const before = (await getStudy(analystA.ctx, studyId)).location.competition!.radii.find((r) => r.radiusKm === 1)!.count;
      await getDb().insert(intelChargingStations).values({ sourceKey: "manual", externalId: `privB-${Date.now()}`, name: "Privado B", lat: -23.5613, lng: -46.6556, organizationId: orgB });
      await getDb().insert(intelGeographicIndicators).values({ organizationId: orgB, indicator: "frota_phev", municipalityCode: 3550308, value: 99999, unit: "veículos", nature: "observado", referenceDate: "2026-09-01", resolution: "município", sourceKey: "senatran_frota" });
      const s = await getStudy(analystA.ctx, studyId);
      expect(s.location.competition!.radii.find((r) => r.radiusKm === 1)!.count).toBe(before);
      expect(s.location.indicators.frota_phev.value).toBeNull();
    });
    it("rejeita seções inválidas (unidade errada)", async () => {
      expect(await code(updateStudySection(analystA.ctx, studyId, "chargers", [{ label: "x", powerKw: 60000, current: "DC", quantity: 1, unitCost: null, installCost: null, efficiency: null }]))).toBe("validation");
    });
    it("isola estudos e permite compartilhamento explícito", async () => {
      expect(await code(getStudy(franchiseB.ctx, studyId))).toBe("forbidden");
      await shareStudy(analystA.ctx, studyId, orgB, true);
      expect((await getStudy(franchiseB.ctx, studyId)).canEdit).toBe(false);
      expect(await code(updateStudySection(franchiseB.ctx, studyId, "demand", DEFAULT_DEMAND))).toBe("forbidden");
      await shareStudy(analystA.ctx, studyId, orgB, false);
      expect(await code(getStudy(franchiseB.ctx, studyId))).toBe("forbidden");
    });
    it("registra previsão reprodutível com versão do modelo", async () => {
      await snapshotForecast(analystA.ctx, studyId);
      const s = await getStudy(analystA.ctx, studyId);
      expect(s.history.length).toBe(3);
      expect(s.history[0].modelVersion).toBe("regras-v1");
    });
    it("ranking, dashboard e relatórios (PDF/XLSX/CSV)", async () => {
      const r = await rankingData(analystA.ctx);
      expect(r.rows.some((x) => x.study.id === studyId)).toBe(true);
      const d = await intelDashboard(analystA.ctx);
      expect(d.counts.properties).toBeGreaterThan(0);
      const pdf = await renderStudyPdf(analystA.ctx, studyId);
      expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
      const xlsx = await renderRankingXlsx(analystA.ctx);
      expect(xlsx.subarray(0, 2).toString()).toBe("PK");
      const csv = await rankingCsv(analystA.ctx);
      expect(csv.split("\n")[0]).toMatch(/Posição/);
      expect(await code(renderStudyPdf(franchiseB.ctx, studyId))).toBe("forbidden");
    });
  });
});

describe("importação de dados", () => {
  const csv = "nome;latitude;longitude;potencia;operador;data\nPosto X;-23,55;-46,63;60;Rede Y;01/09/2026\nPosto X;-23,55;-46,63;60;Rede Y;01/09/2026\nRuim;abc;-46,6;7;;\nWatts;-23,6;-46,7;60000;;";
  it("prévia: mapeia colunas, aponta duplicados, coordenadas inválidas e erro de unidade", async () => {
    const r = await previewImport(analystA.ctx, "charging_stations", { name: "c.csv", buf: Buffer.from(csv) });
    if (r.kind !== "tabela") throw new Error("esperava tabela");
    expect(r.mapping.lat).toBe("latitude");
    expect(r.preview.validRows).toBe(1);
    expect(r.preview.duplicates).toBe(1);
    expect(r.preview.issues.map((i) => i.message).join("|")).toMatch(/número inválido/);
    expect(r.preview.issues.map((i) => i.message).join("|")).toMatch(/unidade em W/);
  });
  it("grava somente válidos, preserva o arquivo original e registra a importação", async () => {
    const r = await commitImport(analystA.ctx, { name: "c.csv", buf: Buffer.from(csv) }, { name: "nome", lat: "latitude", lng: "longitude", maxPowerKw: "potencia", operator: "operador", verifiedAt: "data" }, { target: "charging_stations", sourceKey: "importacao_csv", visibility: "organizacao" });
    expect(r.inserted).toBe(1);
    expect(r.status).toBe("concluida_com_erros");
    const f = await getImportFile(analystA.ctx, r.importId);
    expect(f.content.toString()).toBe(csv);
    expect((await listImports(analystA.ctx)).some((i) => i.i.id === r.importId)).toBe(true);
    expect(await code(getImportFile(franchiseB.ctx, r.importId))).toBe("forbidden");
  });
  it("somente admin publica dados globais; franqueado não importa", async () => {
    expect(await code(commitImport(analystA.ctx, { name: "c.csv", buf: Buffer.from(csv) }, {}, { target: "charging_stations", sourceKey: "importacao_csv", visibility: "publico" }))).toBe("forbidden");
    expect(await code(previewImport(franchiseB.ctx, "charging_stations", { name: "c.csv", buf: Buffer.from(csv) }))).toBe("forbidden");
  });
  it("valida arquivos: formato, vazio e GeoPackage", async () => {
    expect(await code(previewImport(analystA.ctx, "properties", { name: "a.exe", buf: Buffer.from("x") }))).toBe("validation");
    expect(await code(previewImport(analystA.ctx, "properties", { name: "a.csv", buf: Buffer.alloc(0) }))).toBe("validation");
    expect(await code(previewImport(analystA.ctx, "properties", { name: "a.xlsx", buf: Buffer.from("nao é zip") }))).toBe("validation");
    expect(await code(previewImport(analystA.ctx, "properties", { name: "a.gpkg", buf: Buffer.from("x") }))).toBe("validation");
  });
  it("EVIE: exige condições de uso e grava indicadores agregados com proveniência", async () => {
    const evie = "hex_id,centroid_lat,centroid_lng,demand_kwh_day,period_start,period_end\nabc,-23.561,-46.655,800,2026-01-01,2026-06-30\n";
    const map = { areaId: "hex_id", lat: "centroid_lat", lng: "centroid_lng", demandKwhDay: "demand_kwh_day", periodStart: "period_start", periodEnd: "period_end", sessionsDay: null, score: null };
    const pv = await previewImport(analystA.ctx, "evie", { name: "evie.csv", buf: Buffer.from(evie) });
    if (pv.kind !== "tabela") throw new Error();
    expect(pv.evie!.variables).toEqual(["demandKwhDay"]);
    expect(await code(commitImport(analystA.ctx, { name: "evie.csv", buf: Buffer.from(evie) }, map, { target: "evie", sourceKey: "evie_uber" }))).toBe("validation");
    const r = await commitImport(analystA.ctx, { name: "evie.csv", buf: Buffer.from(evie) }, map, { target: "evie", sourceKey: "evie_uber", usageConditions: "Uso interno, contrato X" });
    expect(r.inserted).toBe(1);
    const [ind] = await getDb().select().from(intelGeographicIndicators).where(eq(intelGeographicIndicators.importId, r.importId));
    expect(ind).toMatchObject({ indicator: "evie_demanda_kwh", value: 800, organizationId: orgA, nature: "observado" });
  });
  it("GeoJSON de malha viária alimenta a distância até via principal", async () => {
    const gj = { type: "FeatureCollection", features: [{ type: "Feature", properties: { highway: "primary", name: "Av. Teste", "@id": `way/${Date.now()}` }, geometry: { type: "LineString", coordinates: [[-46.66, -23.5612], [-46.65, -23.5612]] } }] };
    const r = await commitImport(admin.ctx, { name: "vias.geojson", buf: Buffer.from(JSON.stringify(gj)) }, {}, { target: "osm_roads", sourceKey: "osm_extrato" });
    expect(r.inserted).toBe(1);
  });
});

describe("mapa e camadas", () => {
  it("camadas por área visível e mapa de calor de carregadores", async () => {
    const b = { minLng: -46.8, minLat: -23.7, maxLng: -46.5, maxLat: -23.4 };
    const p = await pointLayers(analystA.ctx, b);
    expect(p.stations.features.length).toBeGreaterThan(0);
    expect(p.properties.features.length).toBeGreaterThan(0);
    const h = await heatLayer(analystA.ctx, "carregadores", b);
    expect(h.features.length).toBeGreaterThan(0);
    expect(h.meta.nature).toBe("observado");
    const pb = await pointLayers(franchiseB.ctx, b);
    expect(pb.properties.features.length).toBe(0);
  });
});

describe("fontes externas (respostas gravadas, sem rede)", () => {
  it("IBGE: municípios e população Censo 2022", async () => {
    const f = fakeFetch({
      "/localidades/estados/AC/municipios": [{ id: 1200013, nome: "Acrelândia" }, { id: 1200401, nome: "Rio Branco" }],
      "/agregados/4714": [
        { id: "93", resultados: [{ series: [{ localidade: { id: "1200013" }, serie: { "2022": "12241" } }, { localidade: { id: "1200401" }, serie: { "2022": "364756" } }] }] },
        { id: "6318", resultados: [{ series: [{ localidade: { id: "1200013" }, serie: { "2022": "1811.613" } }, { localidade: { id: "1200401" }, serie: { "2022": "-" } }] }] },
      ],
    });
    expect(await ibgeMunicipalities("AC", f)).toHaveLength(2);
    const pop = await ibgePopulation(12, f);
    expect(pop.get(1200401)).toEqual({ population: 364756, areaKm2: null, period: "2022" });
    const r = await importIbgeState(admin.ctx, "AC", f);
    expect(r).toMatchObject({ municipalities: 2, withPopulation: 2 });
    expect(await code(importIbgeState(franchiseB.ctx, "AC", f))).toBe("forbidden");
  });
  it("Overpass: converte tags OSM (potência, conectores, AC/DC)", () => {
    expect(osmPowerKw({ "socket:ccs:output": "50 kW", "socket:type2:output": "22kW" })).toBe(50);
    expect(osmPowerKw({ "socket:type2:output": "7400 W" })).toBeCloseTo(7.4);
    const s = parseOverpassStations({ elements: [{ type: "node", id: 1, lat: -23.5, lon: -46.6, tags: { amenity: "charging_station", "socket:ccs": "2", "socket:type2": "1", operator: "Op" } }, { type: "way", id: 2, center: { lat: -23.6, lon: -46.7 }, tags: {} }, { type: "node", id: 3 }] });
    expect(s).toHaveLength(2);
    expect(s[0]).toMatchObject({ externalId: "node/1", currentType: "AC_DC", connectors: 3, maxPowerKw: null, operator: "Op" });
  });
  it("Nominatim: respeita intervalo mínimo e usa cache", async () => {
    let calls = 0;
    const f = (async () => { calls++; return new Response(JSON.stringify([{ lat: "-23.56", lon: "-46.65", display_name: "Av. Paulista", address: { city: "São Paulo", "ISO3166-2-lvl4": "BR-SP", postcode: "01310-100" } }])); }) as unknown as Fetcher;
    const waits: number[] = [];
    let t = 1_000_000;
    const r = await geocode("Avenida Paulista 1000", f, { now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } });
    expect(r[0]).toMatchObject({ uf: "SP", city: "São Paulo", zip: "01310-100" });
    await geocode("Avenida Paulista 1000", f, { now: () => t });
    expect(calls).toBe(1);
  });
  it("teste de fonte indisponível NÃO marca como funcionando", async () => {
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as Fetcher;
    const r = await runSourceTest(admin.ctx, "ibge_localidades", down);
    expect(r.ok).toBe(false);
    const [src] = await getDb().select().from(intelDataSources).where(eq(intelDataSources.key, "ibge_localidades"));
    expect(src.status).toBe("indisponivel");
    expect((await testSource("open_charge_map", down)).ok).toBe(false);
    expect(await code(runSourceTest(analystA.ctx, "ibge_localidades", down))).toBe("forbidden");
  });
});

describe("administração", () => {
  it("correção de carregador registra histórico; confirmado exige data", async () => {
    expect(await code(saveStation(analystA.ctx, null, { name: "Novo", lat: "-23.5", lng: "-46.6", operationalStatus: "operando", verificationStatus: "confirmado", verifiedAt: "", reason: "Visita técnica" }))).toBe("validation");
    const s = await saveStation(analystA.ctx, null, { name: "Novo", lat: "-23.5", lng: "-46.6", operationalStatus: "operando", verificationStatus: "confirmado", verifiedAt: "2026-10-01", reason: "Visita técnica ao local" });
    const rev = await getDb().execute<{ n: number }>(sql`select count(*)::int as n from intel_station_revisions where station_id = ${(s as { id: string }).id}`);
    expect(rev.rows[0].n).toBe(1);
  });
  it("configuração do índice: só admin global; versões imutáveis com justificativa", async () => {
    const input = { w_mercado: "40", w_acessibilidade: "20", w_destinos: "10", w_concorrencia: "15", w_operacional: "10", w_qualidade: "5", s_bevFleetRef: "5000", s_phevWeight: "0.5", s_densityRef: "10000", s_roadDistanceZeroM: "2000", s_destinationsRef: "10", s_competitorsSaturation: "15", s_areaRefM2: "600", notes: "Teste de calibração" };
    expect(await code(saveIndexConfig(analystA.ctx, input))).toBe("forbidden");
    expect(await code(saveIndexConfig(admin.ctx, { ...input, notes: "" }))).toBe("validation");
    expect(await code(saveIndexConfig(admin.ctx, { ...input, w_mercado: "-1" }))).toBe("validation");
    await saveIndexConfig(admin.ctx, input);
    const n = await getDb().execute<{ n: number }>(sql`select count(*)::int as n from intel_model_versions where kind = 'potential_index' and active`);
    expect(n.rows[0].n).toBe(1);
  });
  it("organização de demonstração marca imóveis como DEMONSTRAÇÃO", async () => {
    const demo = (await saveOrganization(admin.ctx, null, { name: `Demo ${Date.now()}`, kind: "franquia", isDemo: "on" })).id;
    await getDb().insert(intelMemberships).values({ userId: analystA.user.id, organizationId: demo, role: "analista" });
    const { analystCtx } = { analystCtx: analystA.ctx };
    const r = await saveProperty(analystCtx, null, { name: "Fictício" }, demo);
    const [p] = await getDb().select().from(intelProperties).where(eq(intelProperties.id, r.id));
    expect(p.isDemo).toBe(true);
    const [o] = await getDb().select().from(intelOrganizations).where(eq(intelOrganizations.id, demo));
    expect(o.isDemo).toBe(true);
    void intelStudies;
  });
});
