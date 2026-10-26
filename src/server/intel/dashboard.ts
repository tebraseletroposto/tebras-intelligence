import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { AuthContext } from "../authz";
import { rankingData } from "./studies";
import { loadScope, withIntel } from "./scope";

/** Indicadores do painel inicial — todos reais, da organização ativa. */
export async function intelDashboard(ctx: AuthContext, org?: string | null) {
  const scope = await loadScope(ctx, org);
  const cur = scope.currentOrgId;
  const base = await withIntel(ctx, scope, async (tx) => {
    const one = async <T,>(q: ReturnType<typeof sql>) => (await tx.execute<T & Record<string, unknown>>(q)).rows[0] as T;
    const counts = cur ? await one<{ properties: number; studies: number; located: number; incomplete: number }>(sql`select
        (select count(*)::int from intel_properties where organization_id = ${cur}) as properties,
        (select count(*)::int from intel_studies where organization_id = ${cur} and status = 'em_andamento') as studies,
        (select count(*)::int from intel_properties where organization_id = ${cur} and location is not null) as located,
        (select count(*)::int from intel_properties where organization_id = ${cur} and (location is null or area_m2 is null or monthly_rent is null)) as incomplete`) : { properties: 0, studies: 0, located: 0, incomplete: 0 };
    const byRegion = cur ? (await tx.execute<{ uf: string | null; city: string | null; n: number }>(sql`select uf, city, count(*)::int as n from intel_properties where organization_id = ${cur} group by 1, 2 order by n desc limit 8`)).rows : [];
    return { counts, byRegion };
  });
  const db = getDb();
  const sources = (await db.execute<{ status: string; n: number }>(sql`select status, count(*)::int as n from intel_data_sources group by 1`)).rows;
  const imports = (await db.execute<{ id: string; file_name: string; target: string; status: string; inserted_rows: number; created_at: string }>(sql`
    select id, file_name, target, status, inserted_rows, created_at from intel_data_imports
     where ${scope.global ? sql`true` : sql`(organization_id is null or organization_id = any(${`{${scope.orgIds.join(",")}}`}::uuid[]))`} order by created_at desc limit 5`)).rows;
  const knowledge = (await db.execute<{ stations: number; municipalities: number; indicators: number; roads: number; pois: number }>(sql`select
      (select count(*)::int from intel_charging_stations where organization_id is null) as stations,
      (select count(*)::int from intel_municipalities) as municipalities,
      (select count(*)::int from intel_geographic_indicators where organization_id is null) as indicators,
      (select count(*)::int from intel_roads) as roads, (select count(*)::int from intel_pois) as pois`)).rows[0];
  // Ranking calculado com o mesmo motor da tela de ranking (limitado aos estudos ativos)
  const ranking = cur ? await rankingData(ctx, { org: cur }) : { rows: [] };
  const topPotential = [...ranking.rows].filter((r) => r.index.score !== null).sort((a, b) => (b.index.score ?? 0) - (a.index.score ?? 0)).slice(0, 5);
  const topFinance = [...ranking.rows].filter((r) => r.scenario.finance).sort((a, b) => (b.scenario.finance!.firstYear.operatingResult) - (a.scenario.finance!.firstYear.operatingResult)).slice(0, 5);
  const insufficient = ranking.rows.filter((r) => r.index.confidence === "insuficiente" || r.scenario.forecast.path === "sem_dados").length;
  return { scope, ...base, sources, imports, knowledge, topPotential, topFinance, insufficient };
}
