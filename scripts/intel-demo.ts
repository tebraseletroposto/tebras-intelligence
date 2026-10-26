import "./env";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "../src/db/client";
import { intelChargingStations, intelGeographicIndicators, intelMemberships, intelMunicipalities, intelOrganizations, intelProperties, intelStudies, users } from "../src/db/schema";
import { DEFAULT_CHARGERS, DEFAULT_DEMAND, DEFAULT_ELECTRICAL, DEFAULT_FINANCE, DEFAULT_STUDY_SITE } from "../src/lib/intel/study-schema";

/**
 * Cria a organização "Tebras — DEMONSTRAÇÃO" com dados FICTÍCIOS para treinamento e apresentação.
 * - Tudo fica isolado nesta organização (is_demo = true) e é exibido com a faixa "DEMONSTRAÇÃO".
 * - Nenhum dado aqui representa medições, frota ou faturamento reais.
 * - Bloqueado quando APP_ENV=production.
 * Uso: pnpm intel:demo [email-do-usuario-a-vincular]
 */
async function main() {
  if (process.env.APP_ENV === "production") throw new Error("Dados de demonstração não podem ser criados em produção.");
  const db = getDb();
  const name = "Tebras — DEMONSTRAÇÃO";
  let [org] = await db.select().from(intelOrganizations).where(eq(intelOrganizations.name, name));
  if (!org) [org] = await db.insert(intelOrganizations).values({ name, kind: "franquia", isDemo: true }).returning();
  const email = process.argv[2];
  if (email) {
    const [u] = await db.select().from(users).where(sql`lower(${users.email}) = ${email.toLowerCase()}`);
    if (!u) throw new Error(`Usuário ${email} não encontrado.`);
    await db.insert(intelMemberships).values({ userId: u.id, organizationId: org.id, role: "analista" }).onConflictDoNothing();
  }
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(intelProperties).where(eq(intelProperties.organizationId, org.id));
  if (n > 0) { console.log("Organização de demonstração já possui dados."); return; }

  // Município de referência para os exemplos (dados de população do IBGE são públicos, mas aqui servem só ao exemplo)
  await db.insert(intelMunicipalities).values({ ibgeCode: 3550308, name: "São Paulo", uf: "SP", lat: -23.5505, lng: -46.6333 }).onConflictDoNothing();
  // Indicador FICTÍCIO, privado da organização de demonstração
  await db.insert(intelGeographicIndicators).values({ organizationId: org.id, indicator: "frota_bev", municipalityCode: 3550308, value: 15000, unit: "veículos", nature: "simulacao", referenceDate: "2026-01-01", resolution: "município", quality: "baixa", method: "FICTÍCIO — demonstração", sourceKey: "manual" });

  const props = [
    { name: "[DEMO] Terreno Av. Exemplo, 100", lat: -23.5631, lng: -46.6544, areaM2: 800, monthlyRent: "15000.00", parking: true, streetAccess: true },
    { name: "[DEMO] Galpão Rua Fictícia, 200", lat: -23.5891, lng: -46.6812, areaM2: 1200, monthlyRent: "9000.00", parking: true, streetAccess: true },
    { name: "[DEMO] Estacionamento Modelo", lat: -23.5320, lng: -46.6250, areaM2: 450, monthlyRent: "7000.00", parking: true, streetAccess: false },
  ];
  for (const p of props) {
    const [row] = await db.insert(intelProperties).values({ ...p, organizationId: org.id, city: "São Paulo", uf: "SP", municipalityCode: 3550308, isDemo: true, geocodeSource: "FICTÍCIO", notes: "Registro de demonstração." }).returning();
    await db.insert(intelStudies).values({ organizationId: org.id, propertyId: row.id, name: "Estudo de demonstração", chargers: DEFAULT_CHARGERS.map((c) => ({ ...c, unitCost: c.current === "DC" ? 150000 : 8000, installCost: c.current === "DC" ? 30000 : 3000 })), site: { ...DEFAULT_STUDY_SITE, availableKw: 75 }, electrical: DEFAULT_ELECTRICAL, demand: DEFAULT_DEMAND,
      finance: { ...DEFAULT_FINANCE, energyCostPerKwh: 0.95, revenueTaxRate: 0.1125, paymentFeeRate: 0.03, fixedCosts: DEFAULT_FINANCE.fixedCosts.map((c) => ({ ...c, monthly: c.label === "Aluguel" ? Number(p.monthlyRent) : 500 })), capex: DEFAULT_FINANCE.capex.map((c) => ({ ...c, amount: 10000 })) }, isDemo: true });
  }
  const stations = [[-23.5600, -46.6580, 60, "confirmado"], [-23.5700, -46.6400, 22, "nao_verificado"], [-23.5450, -46.6450, 120, "nao_verificado"], [-23.5950, -46.6900, 7, "historico"]] as const;
  for (const [i, [lat, lng, kw, st]] of stations.entries())
    await db.insert(intelChargingStations).values({ organizationId: org.id, sourceKey: "manual", externalId: `demo-${i}`, name: `[DEMO] Eletroposto fictício ${i + 1}`, operator: "Operador fictício", lat, lng, maxPowerKw: kw, verificationStatus: st, verifiedAt: st === "confirmado" ? "2026-09-01" : null, isDemo: true }).onConflictDoNothing();
  console.log(`Demonstração criada na organização "${name}" (${props.length} imóveis, ${stations.length} carregadores fictícios).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closeDb);
