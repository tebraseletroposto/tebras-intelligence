"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";

type Layers = Record<string, { label: string; legend: string; nature: string }>;
type Meta = { label: string; legend: string; nature: string; cells: number; max: number; cellDeg: number };

/** Círculo geodésico aproximado (raio em km) como polígono GeoJSON. */
function circle(lat: number, lng: number, km: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + (km / (111.32 * Math.cos((lat * Math.PI) / 180))) * Math.cos(a), lat + (km / 110.57) * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: { km }, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

/**
 * Mapa de calor do entorno de um terreno: raios de 1, 3 e 5 km, carregadores conhecidos, terrenos da organização
 * e a camada de calor escolhida (agregada no servidor). Indicadores indiretos não são "demanda real".
 */
export function LocalHeatMap({ lat, lng, tileUrl, attribution, layers, initialLayer = "carregadores" }: { lat: number; lng: number; tileUrl: string; attribution: string; layers: Layers; initialLayer?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [layer, setLayer] = useState(initialLayer);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [counts, setCounts] = useState<{ s: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: { base: { type: "raster", tiles: [tileUrl], tileSize: 256, attribution, maxzoom: 19 } }, layers: [{ id: "base", type: "raster", source: "base" }] },
      center: [lng, lat], zoom: 12.3,
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    m.on("load", () => {
      m.addSource("heat", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addSource("stations", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      m.addSource("rings", { type: "geojson", data: { type: "FeatureCollection", features: [5, 3, 1].map((k) => circle(lat, lng, k)) } });
      m.addLayer({ id: "heat", type: "fill", source: "heat", paint: { "fill-color": ["interpolate", ["linear"], ["get", "n"], 0, "#fff1f1", 0.5, "#fb010c", 1, "#5c0004"], "fill-opacity": 0.55 } });
      m.addLayer({ id: "rings", type: "line", source: "rings", paint: { "line-color": "#0c0b0e", "line-width": 1.5, "line-dasharray": [3, 2] } });
      m.addLayer({ id: "ring-labels", type: "symbol", source: "rings", layout: { "text-field": ["concat", ["to-string", ["get", "km"]], " km"], "text-size": 11, "symbol-placement": "line" }, paint: { "text-color": "#0c0b0e", "text-halo-color": "#fff", "text-halo-width": 1.5 } });
      m.addLayer({ id: "stations", type: "circle", source: "stations", paint: { "circle-radius": 5, "circle-color": ["match", ["get", "status"], "confirmado", "#0c0b0e", "#71717a"], "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 } });
      new maplibregl.Marker({ color: "#fb010c" }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup().setText("Terreno analisado")).addTo(m);
      m.on("click", "stations", (e) => {
        const p = e.features?.[0]?.properties ?? {};
        new maplibregl.Popup().setLngLat(e.lngLat).setText(`${p.name} · ${p.operator} · ${p.power ? `${p.power} kW` : "potência ?"} · ${p.status}`).addTo(m);
      });
      setLoaded(true);
    });
    return () => { m.remove(); map.current = null; };
  }, [lat, lng, tileUrl, attribution]);

  useEffect(() => {
    if (!loaded) return;
    // Área fixa ~ 7 km ao redor do terreno (células de ~500 m)
    const bbox = [lng - 0.08, lat - 0.065, lng + 0.08, lat + 0.065].map((x) => x.toFixed(5)).join(",");
    fetch(`/api/inteligencia/camadas?bbox=${bbox}&calor=${layer}`).then(async (r) => {
      const j = await r.json();
      if (!r.ok) { setError(j.error); return; }
      (map.current?.getSource("heat") as GeoJSONSource | undefined)?.setData(j.heat);
      (map.current?.getSource("stations") as GeoJSONSource | undefined)?.setData(j.stations);
      setMeta(j.heat?.meta ?? null);
      setCounts({ s: j.stations.features.length });
      setError(null);
    }).catch(() => setError("Falha ao carregar o mapa de calor."));
  }, [loaded, layer, lat, lng]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div ref={el} className="h-[420px] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100" role="region" aria-label="Mapa de calor do entorno do terreno" />
      <div className="space-y-3 text-sm">
        <label className="block text-xs text-zinc-600">Camada de calor
          <select value={layer} onChange={(e) => setLayer(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm">
            {Object.entries(layers).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {error && <p className="text-xs text-red-700">{error}</p>}
        {meta && (
          <div className="rounded-md border border-zinc-200 bg-white p-3">
            <div className="h-2 rounded bg-gradient-to-r from-[#fff1f1] via-brand to-[#5c0004]" />
            <div className="flex justify-between text-[11px] text-zinc-500"><span>baixo</span><span>alto ({meta.max.toLocaleString("pt-BR", { maximumFractionDigits: 2 })})</span></div>
            <p className="mt-2 text-xs text-zinc-700">{meta.legend}</p>
            <p className="mt-1 text-[11px] text-zinc-500">Natureza: {meta.nature} · {meta.cells} célula(s) com dados nesta área.</p>
            {meta.cells === 0 && <p className="mt-1 text-[11px] font-medium text-amber-800">Sem dados desta camada no entorno — carregue as fontes (Catálogo de fontes / Importação). Ausência de dado não é ausência de demanda.</p>}
          </div>
        )}
        <ul className="space-y-1 text-xs text-zinc-600">
          <li><span className="mr-1 inline-block size-3 rounded-full bg-brand align-middle" /> Terreno analisado</li>
          <li><span className="mr-1 inline-block size-3 rounded-full bg-ink align-middle" /> Carregador confirmado</li>
          <li><span className="mr-1 inline-block size-3 rounded-full bg-zinc-500 align-middle" /> Carregador não verificado</li>
          <li>Linhas tracejadas: raios de 1, 3 e 5 km</li>
          {counts && <li>{counts.s} carregador(es) conhecido(s) na área do mapa</li>}
        </ul>
      </div>
    </div>
  );
}
