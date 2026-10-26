import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";

/** Verificação de saúde para monitoramento/hospedagem. Não expõe detalhes internos. */
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ status: "ok", db: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ status: "degraded", db: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
