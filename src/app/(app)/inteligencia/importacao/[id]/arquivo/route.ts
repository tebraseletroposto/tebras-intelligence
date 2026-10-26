import { requireApiUser } from "@/server/http";
import { getImportFile } from "@/server/intel/imports";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireApiUser();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  try {
    const f = await getImportFile(ctx, (await params).id);
    return new Response(new Uint8Array(f.content), { headers: { "Content-Type": f.contentType, "Content-Disposition": `attachment; filename="${encodeURIComponent(f.name)}"`, "Cache-Control": "no-store" } });
  } catch { return new Response("Arquivo não encontrado", { status: 404 }); }
}
