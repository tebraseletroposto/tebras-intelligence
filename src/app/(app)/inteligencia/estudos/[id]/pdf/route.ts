import { AppError } from "@/server/errors";
import { requireApiUser } from "@/server/http";
import { renderStudyPdf } from "@/server/intel/reports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiUser();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  const { id } = await params;
  try {
    const pdf = await renderStudyPdf(ctx, id);
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="tebras-estudo-${id.slice(0, 8)}.pdf"`, "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof AppError && (e.code === "forbidden" || e.code === "not_found")) return new Response("Estudo não encontrado", { status: 404 });
    console.error("[estudo pdf]", e);
    return new Response("Erro ao gerar o relatório", { status: 500 });
  }
}
