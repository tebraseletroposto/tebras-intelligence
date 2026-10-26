import { logEvent } from "@/server/audit";
import { requireApiUser } from "@/server/http";
import { listProperties } from "@/server/intel/properties";

/** Exporta os imóveis filtrados (até 50 por página da busca; usa os mesmos filtros) em CSV. */
export async function GET(req: Request) {
  const ctx = await requireApiUser();
  if (!ctx) return new Response("Não autenticado", { status: 401 });
  try {
    const sp = Object.fromEntries(new URL(req.url).searchParams);
    const all = [];
    for (let page = 1; page <= 200; page++) {
      const r = await listProperties(ctx, { ...sp, page: String(page) });
      all.push(...r.rows);
      if (r.rows.length < r.pageSize) break;
    }
    const cols = ["id", "nome", "endereco", "bairro", "municipio", "uf", "cep", "latitude", "longitude", "area_m2", "aluguel_mensal", "valor_venda", "tipo", "situacao", "carregadores_3km", "demonstracao"];
    const esc = (v: unknown) => (v === null || v === undefined ? "" : `"${String(v).replace(/"/g, '""')}"`);
    const lines = all.map(({ p, competitors3km }) => [p.id, p.name, p.address, p.district, p.city, p.uf, p.zip, p.lat, p.lng, p.areaM2, p.monthlyRent, p.salePrice, p.propertyType, p.status, competitors3km, p.isDemo ? "sim" : "nao"].map(esc).join(";"));
    await logEvent({ userId: ctx.userId, action: "export.csv", entityType: "intel_properties", summary: `${all.length} imóveis`, ip: ctx.ip, userAgent: ctx.userAgent });
    return new Response("﻿" + [cols.join(";"), ...lines].join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="tebras-imoveis.csv"', "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[export imoveis]", e);
    return new Response("Não foi possível exportar", { status: 403 });
  }
}
