import { requirePagePermission } from "@/server/auth/dal";
import { can } from "@/server/authz";
import { HEAT_LAYERS } from "@/server/intel/layers";
import { OpportunityMap } from "./opportunity-map";

export const metadata = { title: "Mapa de oportunidades" };

export default async function MapPage({ searchParams }: { searchParams: Promise<{ lat?: string; lng?: string; z?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const sp = await searchParams;
  const lat = Number(sp.lat), lng = Number(sp.lng), z = Number(sp.z);
  const initial = Number.isFinite(lat) && Number.isFinite(lng) && sp.lat ? { lat, lng, z: Number.isFinite(z) && z > 0 ? z : 14 } : { lat: -15.8, lng: -50.5, z: 3.6 };
  // Provedor de mapa base configurável (produção: provedor contratado ou servidor próprio de tiles)
  const tileUrl = process.env.MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution = process.env.MAP_ATTRIBUTION || '© <a href="https://www.openstreetmap.org/copyright">colaboradores do OpenStreetMap</a>';
  const heatLayers = Object.fromEntries(Object.entries(HEAT_LAYERS).map(([k, v]) => [k, { label: v.label, legend: v.legend, nature: v.nature }]));
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold">Mapa de oportunidades</h1>
        <p className="text-sm text-zinc-600">Brasil inteiro, com dados carregados por área visível. Indicadores indiretos não são “demanda real”. Mapa base © OpenStreetMap (ODbL).</p>
      </div>
      <OpportunityMap tileUrl={tileUrl} attribution={attribution} heatLayers={heatLayers} initial={initial} canEdit={can(ctx, "inteligencia.edit") || can(ctx, "inteligencia.admin")} />
    </div>
  );
}
