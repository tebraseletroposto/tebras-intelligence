import { AppError } from "@/server/errors";
import { json, requireApiUser, sameOrigin } from "@/server/http";
import { commitImport, previewImport, type AnyTarget } from "@/server/intel/imports";

/** Importação em duas etapas: "previa" (nada é gravado) e "confirmar" (grava válidos + arquivo original). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Origem inválida" }, 403);
  const ctx = await requireApiUser();
  if (!ctx) return json({ error: "Não autenticado" }, 401);
  let fd: FormData;
  try { fd = await req.formData(); } catch { return json({ error: "Envio inválido." }, 400); }
  const file = fd.get("arquivo");
  if (!(file instanceof File)) return json({ error: "Selecione um arquivo." }, 400);
  const buf = Buffer.from(await file.arrayBuffer());
  let mapping: Record<string, string | null> = {};
  try { mapping = JSON.parse(String(fd.get("mapeamento") ?? "{}")); } catch { /* sem mapeamento → sugestão */ }
  const target = String(fd.get("destino") ?? "") as AnyTarget;
  try {
    if (fd.get("etapa") === "confirmar") {
      const r = await commitImport(ctx, { name: file.name, buf }, mapping, Object.fromEntries([...fd.entries()].filter(([, v]) => typeof v === "string").map(([k, v]) => [k === "destino" ? "target" : k === "fonte" ? "sourceKey" : k, v])));
      return json({ ok: true, result: r });
    }
    return json({ ok: true, preview: await previewImport(ctx, target, { name: file.name, buf }, Object.keys(mapping).length ? mapping : undefined) });
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message, fieldErrors: e.fieldErrors }, e.code === "forbidden" ? 403 : 400);
    console.error("[importacao]", e);
    return json({ error: "Falha ao processar o arquivo. Verifique o formato." }, 400);
  }
}
