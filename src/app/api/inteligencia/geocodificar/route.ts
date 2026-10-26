import { json, requireApiUser } from "@/server/http";
import { geocode, SourceError } from "@/server/intel/adapters";
import { loadScope } from "@/server/intel/scope";

/** Pesquisa de endereços (proxy do servidor: aplica limite de uso, cache e User-Agent; nunca expõe credenciais). */
export async function GET(req: Request) {
  const ctx = await requireApiUser();
  if (!ctx) return json({ error: "Não autenticado" }, 401);
  try { await loadScope(ctx); } catch { return json({ error: "Acesso negado" }, 403); }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.trim().length < 3) return json({ results: [] });
  try {
    return json({ results: await geocode(q), attribution: "© colaboradores do OpenStreetMap (ODbL) — Nominatim" });
  } catch (e) {
    const msg = e instanceof SourceError ? e.message : "Falha inesperada";
    return json({ error: `Geocodificação indisponível: ${msg}. Informe as coordenadas manualmente ou selecione o ponto no mapa.` }, 502);
  }
}
