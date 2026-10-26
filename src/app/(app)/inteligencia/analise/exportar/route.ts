import { requireApiUser } from "@/server/http";
import { rankingCsv, renderRankingPdf, renderRankingXlsx } from "@/server/intel/reports";

export async function GET(req: Request) {
  const ctx = await requireApiUser();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  const f = new URL(req.url).searchParams.get("formato");
  try {
    if (f === "xlsx") return new Response(new Uint8Array(await renderRankingXlsx(ctx)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="tebras-ranking.xlsx"', "Cache-Control": "no-store" } });
    if (f === "pdf") return new Response(new Uint8Array(await renderRankingPdf(ctx)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="tebras-ranking.pdf"', "Cache-Control": "no-store" } });
    return new Response(await rankingCsv(ctx), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="tebras-ranking.csv"', "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[ranking export]", e);
    return new Response("Não foi possível exportar", { status: 403 });
  }
}
