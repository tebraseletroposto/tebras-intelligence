import { parseBbox } from "@/lib/intel/geo";
import { json, requireApiUser } from "@/server/http";
import { HEAT_LAYERS, heatLayer, pointLayers, type HeatLayer } from "@/server/intel/layers";

/** Camadas do mapa para a área visível. Áreas maiores que 12° são recusadas (sem consultas nacionais por interação). */
export async function GET(req: Request) {
  const ctx = await requireApiUser();
  if (!ctx) return json({ error: "Não autenticado" }, 401);
  const sp = new URL(req.url).searchParams;
  const bbox = parseBbox(sp.get("bbox"));
  if (!bbox) return json({ error: "Aproxime o mapa: área visível grande demais ou inválida." }, 400);
  try {
    const heat = sp.get("calor");
    const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(sp.get(k) ?? "") ? (sp.get(k) as string) : undefined);
    const [points, heatmap] = await Promise.all([
      pointLayers(ctx, bbox),
      heat && heat in HEAT_LAYERS ? heatLayer(ctx, heat as HeatLayer, bbox, { from: date("de"), to: date("ate") }) : Promise.resolve(null),
    ]);
    return json({ ...points, heat: heatmap });
  } catch (e) {
    console.error("[camadas]", e);
    return json({ error: "Não foi possível carregar as camadas." }, 403);
  }
}
