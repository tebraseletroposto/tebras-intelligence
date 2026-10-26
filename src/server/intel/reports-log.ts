import "server-only";
import { sql } from "drizzle-orm";
import type { AuthContext } from "../authz";
import { loadScope, withIntel } from "./scope";

export async function listReports(ctx: AuthContext) {
  const scope = await loadScope(ctx);
  return withIntel(ctx, scope, async (tx) => (await tx.execute<{ id: string; kind: string; format: string; nature: string; created_at: string; study_name: string | null; user_name: string | null }>(sql`
    select r.id, r.kind, r.format, r.nature, r.created_at, s.name as study_name, u.name as user_name
      from intel_reports r left join intel_studies s on s.id = r.study_id left join users u on u.id = r.created_by
     where ${scope.currentOrgId ? sql`r.organization_id = ${scope.currentOrgId}` : sql`false`} order by r.created_at desc limit 50`)).rows);
}
