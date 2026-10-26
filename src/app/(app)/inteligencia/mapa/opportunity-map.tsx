"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MlMap } from "maplibre-gl";
import { parseCoordinates, polygonAreaM2 } from "@/lib/intel/geo";

type HeatMeta = { layer: string; label: string; nature: string; legend: string; cellDeg: number; cells: number; max: number };
type Layers = { label: string; legend: string; nature: string };

const EMPTY = { type: "FeatureCollection" as const, features: [] };
const STATUS_COLORS: Record<string, string> = { confirmado: "#0c0b0e", nao_verificado: "#71717a", historico: "#a1a1aa", insuficiente: "#d4d4d8" };

export function OpportunityMap({ tileUrl, attribution, heatLayers, initial, canEdit }: { tileUrl: string; attribution: string; heatLayers: Record<string, Layers>; initial: { lat: number; lng: number; z: number }; canEdit: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [mode, setMode] = useState<"navegar" | "ponto" | "poligono">("navegar");
  const modeRef = useRef(mode);
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [ring, setRing] = useState<[number, number][]>([]);
  const ringRef = useRef<[number, number][]>([]);
  const [heat, setHeat] = useState<string>("");
  const [period, setPeriod] = useState({ de: "", ate: "" });
  const [show, setShow] = useState({ stations: true, properties: true });
  const [status, setStatus] = useState<{ msg: string | null; heat: HeatMeta | null; counts: { s: number; p: number }; truncated?: boolean }>({ msg: null, heat: null, counts: { s: 0, p: 0 } });
  const [search, setSearch] = useState({ q: "", lat: "", lng: "", error: "" });
  const pointMarker = useRef<maplibregl.Marker | null>(null);

  useEffect(() => { modeRef.current = mode; }, [mode]);

  const refresh = useCallback(async () => {
    const m = map.current;
    if (!m) return;
    const b = m.getBounds();
    if (m.getZoom() < 5) { setStatus((s) => ({ ...s, msg: "Aproxime o mapa (zoom ≥ 5) para carregar carregadores, imóveis e camadas. Consultas nacionais completas não são feitas a cada interação.", heat: null })); return; }
    const qs = new URLSearchParams({ bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()].map((x) => x.toFixed(5)).join(",") });
    if (heat) qs.set("calor", heat);
    if (period.de) qs.set("de", period.de);
    if (period.ate) qs.set("ate", period.ate);
    try {
      const r = await fetch(`/api/inteligencia/camadas?${qs}`);
      const j = await r.json();
      if (!r.ok) { setStatus((s) => ({ ...s, msg: j.error })); return; }
      (m.getSource("stations") as GeoJSONSource | undefined)?.setData(j.stations);
      (m.getSource("properties") as GeoJSONSource | undefined)?.setData(j.properties);
      (m.getSource("polygons") as GeoJSONSource | undefined)?.setData(j.polygons);
      (m.getSource("heat") as GeoJSONSource | undefined)?.setData(j.heat ?? EMPTY);
      setStatus({ msg: null, heat: j.heat?.meta ?? null, counts: { s: j.stations.features.length, p: j.properties.features.length }, truncated: j.truncated });
    } catch { setStatus((s) => ({ ...s, msg: "Falha ao carregar camadas." })); }
  }, [heat, period]);
  const refreshRef = useRef(refresh);
  useEffect(() => { refreshRef.current = refresh; refresh(); }, [refresh]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: { base: { type: "raster", tiles: [tileUrl], tileSize: 256, attribution, maxzoom: 19 } }, layers: [{ id: "base", type: "raster", source: "base" }] },
      center: [initial.lng, initial.lat], zoom: initial.z, maxBounds: [[-90, -40], [-20, 12]],
    });
    map.current = m;
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    m.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");
    m.on("load", () => {
      for (const id of ["heat", "polygons", "stations", "properties", "draft"]) m.addSource(id, { type: "geojson", data: EMPTY });
      m.addLayer({ id: "heat-fill", type: "fill", source: "heat", paint: { "fill-color": ["interpolate", ["linear"], ["get", "n"], 0, "#fff1f1", 0.5, "#fb010c", 1, "#5c0004"], "fill-opacity": 0.55, "fill-outline-color": "rgba(12,11,14,0.15)" } });
      m.addLayer({ id: "poly-fill", type: "fill", source: "polygons", paint: { "fill-color": "#fb010c", "fill-opacity": 0.2 } });
      m.addLayer({ id: "poly-line", type: "line", source: "polygons", paint: { "line-color": "#fb010c", "line-width": 2 } });
      m.addLayer({ id: "stations", type: "circle", source: "stations", paint: { "circle-radius": ["interpolate", ["linear"], ["coalesce", ["get", "power"], 7], 7, 4, 150, 9], "circle-color": ["match", ["get", "status"], "confirmado", STATUS_COLORS.confirmado, "nao_verificado", STATUS_COLORS.nao_verificado, "historico", STATUS_COLORS.historico, STATUS_COLORS.insuficiente], "circle-stroke-color": "#ffffff", "circle-stroke-width": 1.5 } });
      m.addLayer({ id: "properties", type: "circle", source: "properties", paint: { "circle-radius": 8, "circle-color": "#fb010c", "circle-stroke-color": "#ffffff", "circle-stroke-width": 2.5 } });
      m.addLayer({ id: "draft-line", type: "line", source: "draft", paint: { "line-color": "#0c0b0e", "line-width": 2, "line-dasharray": [2, 1] } });
      m.addLayer({ id: "draft-pts", type: "circle", source: "draft", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": "#0c0b0e" } });
      refreshRef.current();
    });
    let t: ReturnType<typeof setTimeout>;
    m.on("moveend", () => { clearTimeout(t); t = setTimeout(() => refreshRef.current(), 300); });
    const popup = (e: maplibregl.MapLayerMouseEvent, html: string) => new maplibregl.Popup({ closeButton: true }).setLngLat(e.lngLat).setHTML(html).addTo(m);
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    m.on("click", "stations", (e) => {
      if (modeRef.current !== "navegar") return;
      const p = e.features?.[0]?.properties ?? {};
      popup(e, `<strong>${esc(p.name)}</strong><br/>${esc(p.operator)}<br/>${p.power ? `${esc(p.power)} kW` : "Potência não informada"}<br/>Situação: ${esc(p.status)}<br/>Fonte: ${esc(p.source)}${p.demo === true || p.demo === "true" ? "<br/><b>DEMONSTRAÇÃO</b>" : ""}<br/><a href="/inteligencia/concorrencia/${esc(p.id)}">Detalhes</a>`);
    });
    m.on("click", "properties", (e) => {
      if (modeRef.current !== "navegar") return;
      const p = e.features?.[0]?.properties ?? {};
      popup(e, `<strong>${esc(p.name)}</strong><br/>Situação: ${esc(p.status)}${p.demo === true || p.demo === "true" ? "<br/><b>DEMONSTRAÇÃO</b>" : ""}<br/><a href="/inteligencia/imoveis/${esc(p.id)}">Abrir análise</a>`);
    });
    m.on("click", "heat-fill", (e) => {
      if (modeRef.current !== "navegar") return;
      const p = e.features?.[0]?.properties ?? {};
      popup(e, `Valor da célula: <strong>${Number(p.v).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</strong>`);
    });
    for (const l of ["stations", "properties"]) { m.on("mouseenter", l, () => { m.getCanvas().style.cursor = "pointer"; }); m.on("mouseleave", l, () => { m.getCanvas().style.cursor = ""; }); }
    m.on("click", (e) => {
      const { lng, lat } = e.lngLat;
      if (modeRef.current === "ponto") setPoint({ lat, lng });
      if (modeRef.current === "poligono") { ringRef.current = [...ringRef.current, [lng, lat]]; setRing(ringRef.current); }
    });
    return () => { m.remove(); map.current = null; };
  }, [tileUrl, attribution, initial.lat, initial.lng, initial.z]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    pointMarker.current?.remove();
    if (point) pointMarker.current = new maplibregl.Marker({ color: "#fb010c" }).setLngLat([point.lng, point.lat]).addTo(m);
  }, [point]);

  useEffect(() => {
    const src = map.current?.getSource("draft") as GeoJSONSource | undefined;
    if (!src) return;
    const closed = ring.length >= 3 ? [...ring, ring[0]] : ring;
    src.setData({ type: "FeatureCollection", features: [...(ring.length >= 2 ? [{ type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: closed } }] : []), ...ring.map((c) => ({ type: "Feature" as const, properties: {}, geometry: { type: "Point" as const, coordinates: c } }))] });
  }, [ring]);

  useEffect(() => {
    const m = map.current;
    if (!m || !m.isStyleLoaded()) return;
    m.setLayoutProperty("stations", "visibility", show.stations ? "visible" : "none");
    m.setLayoutProperty("properties", "visibility", show.properties ? "visible" : "none");
    m.setLayoutProperty("poly-fill", "visibility", show.properties ? "visible" : "none");
    m.setLayoutProperty("poly-line", "visibility", show.properties ? "visible" : "none");
  }, [show]);

  async function geocodeSearch() {
    setSearch((s) => ({ ...s, error: "" }));
    const r = await fetch(`/api/inteligencia/geocodificar?q=${encodeURIComponent(search.q)}`).catch(() => null);
    const j = r ? await r.json() : { error: "Serviço indisponível." };
    if (!r?.ok || !j.results?.length) { setSearch((s) => ({ ...s, error: j.error ?? "Nenhum resultado." })); return; }
    map.current?.flyTo({ center: [j.results[0].lng, j.results[0].lat], zoom: 16 });
  }
  function goToCoords() {
    const c = parseCoordinates(search.lat, search.lng);
    if (!c.ok) { setSearch((s) => ({ ...s, error: c.error })); return; }
    setSearch((s) => ({ ...s, error: c.outsideBrazil ? "Atenção: coordenada fora do Brasil." : "" }));
    map.current?.flyTo({ center: [c.value.lng, c.value.lat], zoom: 16 });
    setPoint(c.value);
  }

  const area = ring.length >= 3 ? polygonAreaM2(ring) : 0;
  const centroid = ring.length >= 3 ? { lng: ring.reduce((s, p) => s + p[0], 0) / ring.length, lat: ring.reduce((s, p) => s + p[1], 0) / ring.length } : null;
  const polygonParam = ring.length >= 3 ? JSON.stringify({ type: "Polygon", coordinates: [[...ring.map(([x, y]) => [Number(x.toFixed(7)), Number(y.toFixed(7))]), [Number(ring[0][0].toFixed(7)), Number(ring[0][1].toFixed(7))]]] }) : "";
  const btn = (active: boolean) => `h-9 rounded-md px-3 text-sm font-medium ${active ? "bg-brand text-white" : "border border-zinc-300 bg-white text-ink hover:bg-zinc-50"}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="space-y-4 text-sm">
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold">Pesquisar</h2>
          <div className="mt-2 flex gap-2"><input aria-label="Endereço" value={search.q} onChange={(e) => setSearch((s) => ({ ...s, q: e.target.value }))} onKeyDown={(e) => e.key === "Enter" && geocodeSearch()} placeholder="Endereço, bairro, cidade" className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-2" /><button onClick={geocodeSearch} className="h-9 rounded-md bg-ink px-3 text-white">Ir</button></div>
          <div className="mt-2 flex gap-2"><input aria-label="Latitude" value={search.lat} onChange={(e) => setSearch((s) => ({ ...s, lat: e.target.value }))} placeholder="Latitude" className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-2" /><input aria-label="Longitude" value={search.lng} onChange={(e) => setSearch((s) => ({ ...s, lng: e.target.value }))} placeholder="Longitude" className="h-9 min-w-0 flex-1 rounded-md border border-zinc-300 px-2" /><button onClick={goToCoords} className="h-9 rounded-md border border-zinc-300 px-2">OK</button></div>
          {search.error && <p className="mt-2 text-xs text-red-700">{search.error}</p>}
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold">Ferramentas</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={btn(mode === "navegar")} onClick={() => setMode("navegar")}>Navegar</button>
            <button className={btn(mode === "ponto")} onClick={() => setMode("ponto")}>Selecionar ponto</button>
            <button className={btn(mode === "poligono")} onClick={() => { setMode("poligono"); ringRef.current = []; setRing([]); }}>Desenhar terreno</button>
          </div>
          {mode === "ponto" && <p className="mt-2 text-xs text-zinc-600">Clique no mapa para marcar o ponto.</p>}
          {point && mode !== "poligono" && (
            <div className="mt-3 rounded-md bg-zinc-50 p-3">
              <p className="tabular">{point.lat.toFixed(6)}, {point.lng.toFixed(6)}</p>
              {canEdit && <Link href={`/inteligencia/imoveis/novo?lat=${point.lat.toFixed(7)}&lng=${point.lng.toFixed(7)}`} className="mt-2 inline-block rounded-md bg-brand px-3 py-1.5 text-white">Cadastrar imóvel aqui</Link>}
            </div>
          )}
          {mode === "poligono" && (
            <div className="mt-3 space-y-2 rounded-md bg-zinc-50 p-3">
              <p className="text-xs text-zinc-600">Clique nos vértices do terreno. {ring.length} vértice(s).</p>
              {area > 0 && <p>Área aproximada: <strong className="tabular">{Math.round(area).toLocaleString("pt-BR")} m²</strong></p>}
              <div className="flex gap-2">
                <button className="rounded-md border border-zinc-300 px-2 py-1" onClick={() => { ringRef.current = ringRef.current.slice(0, -1); setRing(ringRef.current); }} disabled={!ring.length}>Desfazer</button>
                <button className="rounded-md border border-zinc-300 px-2 py-1" onClick={() => { ringRef.current = []; setRing([]); }}>Limpar</button>
              </div>
              {canEdit && centroid && <Link href={`/inteligencia/imoveis/novo?lat=${centroid.lat.toFixed(7)}&lng=${centroid.lng.toFixed(7)}&polygon=${encodeURIComponent(polygonParam)}`} className="inline-block rounded-md bg-brand px-3 py-1.5 text-white">Cadastrar terreno com este polígono</Link>}
            </div>
          )}
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4">
          <h2 className="font-semibold">Camadas</h2>
          <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={show.stations} onChange={(e) => setShow((s) => ({ ...s, stations: e.target.checked }))} className="accent-brand" /> Carregadores conhecidos ({status.counts.s})</label>
          <label className="mt-1 flex items-center gap-2"><input type="checkbox" checked={show.properties} onChange={(e) => setShow((s) => ({ ...s, properties: e.target.checked }))} className="accent-brand" /> Imóveis da organização ({status.counts.p})</label>
          <label className="mt-3 block text-xs text-zinc-600">Mapa de calor
            <select value={heat} onChange={(e) => setHeat(e.target.value)} className="mt-1 h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm"><option value="">Nenhum</option>{Object.entries(heatLayers).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          </label>
          {heat && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-zinc-600">
              <label>De<input type="date" value={period.de} onChange={(e) => setPeriod((p) => ({ ...p, de: e.target.value }))} className="mt-1 h-8 w-full rounded-md border border-zinc-300 px-1" /></label>
              <label>Até<input type="date" value={period.ate} onChange={(e) => setPeriod((p) => ({ ...p, ate: e.target.value }))} className="mt-1 h-8 w-full rounded-md border border-zinc-300 px-1" /></label>
              <p className="col-span-2">Filtro temporal aplica-se a camadas com séries históricas (indicadores importados).</p>
            </div>
          )}
        </section>
        <section className="rounded-lg border border-zinc-200 bg-white p-4" aria-live="polite">
          <h2 className="font-semibold">Legenda</h2>
          <ul className="mt-2 space-y-1 text-xs">
            <li><span className="mr-2 inline-block size-3 rounded-full border-2 border-white bg-brand align-middle ring-1 ring-brand" />Imóvel cadastrado (Tebras)</li>
            {Object.entries({ confirmado: "Carregador confirmado", nao_verificado: "Não verificado (fonte pública)", historico: "Histórico", insuficiente: "Informação insuficiente" }).map(([k, v]) => <li key={k}><span className="mr-2 inline-block size-3 rounded-full align-middle" style={{ background: STATUS_COLORS[k] }} />{v}</li>)}
          </ul>
          {status.heat && (
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="font-medium">{status.heat.label}</p>
              <div className="mt-1 h-2 rounded bg-gradient-to-r from-[#fff1f1] via-brand to-[#5c0004]" />
              <div className="flex justify-between text-[11px] text-zinc-500"><span>0</span><span>{status.heat.max.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</span></div>
              <p className="mt-1 text-xs text-zinc-600">{status.heat.legend}</p>
              <p className="mt-1 text-[11px] text-zinc-500">Natureza: {status.heat.nature} · células de {status.heat.cellDeg.toFixed(3)}° · {status.heat.cells} com dados.{status.heat.cells === 0 && " Nenhum dado importado para esta camada nesta área."}</p>
            </div>
          )}
        </section>
      </aside>
      <div className="relative">
        <div ref={el} className="h-[70vh] min-h-[420px] w-full overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100" role="region" aria-label="Mapa interativo" />
        {status.msg && <p className="absolute left-3 top-3 max-w-md rounded-md bg-ink/90 px-3 py-2 text-xs text-white">{status.msg}</p>}
        {status.truncated && <p className="absolute bottom-10 left-3 rounded-md bg-amber-100 px-3 py-1 text-xs text-amber-900">Muitos pontos: aproxime para ver todos.</p>}
      </div>
    </div>
  );
}
