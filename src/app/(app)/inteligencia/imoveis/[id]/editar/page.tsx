import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/dal";
import { AppError } from "@/server/errors";
import { getProperty } from "@/server/intel/properties";
import { savePropertyAction } from "../../../actions";
import { propertyFormOptions } from "../../options";
import { PropertyForm } from "../../property-form";

export const metadata = { title: "Editar imóvel" };
const tri = (b: boolean | null) => (b === null ? "" : b ? "sim" : "nao");
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export default async function EditPropertyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ lat?: string; lng?: string; polygon?: string }> }) {
  const ctx = await requirePagePermission("inteligencia.edit", "inteligencia.admin");
  const { id } = await params;
  const sp = await searchParams;
  const d = await getProperty(ctx, id).catch((e) => { if (e instanceof AppError) notFound(); throw e; });
  const p = d.p;
  const polygon = sp.polygon ?? (d.polygon ? JSON.stringify({ type: "Polygon", coordinates: (JSON.parse(d.polygon) as { coordinates: number[][][][] }).coordinates[0] }) : "");
  return (
    <div>
      <PageHeader title={`Editar: ${p.name}`} breadcrumb={<Link href={`/inteligencia/imoveis/${id}`} className="hover:text-brand">Voltar ao imóvel</Link>} />
      <PropertyForm action={savePropertyAction.bind(null, id)} opts={propertyFormOptions()} initial={{
        name: p.name, address: s(p.address), district: s(p.district), city: s(p.city), uf: s(p.uf), zip: s(p.zip), lat: sp.lat ?? s(p.lat), lng: sp.lng ?? s(p.lng), polygon,
        areaM2: s(p.areaM2), monthlyRent: s(p.monthlyRent).replace(".", ","), salePrice: s(p.salePrice).replace(".", ","), propertyType: s(p.propertyType), occupancy: s(p.occupancy),
        parking: tri(p.parking), streetAccess: tri(p.streetAccess), mainRoadDistanceM: s(p.mainRoadDistanceM), destinationsWithin1km: s(p.destinationsWithin1km), objective: s(p.objective),
        businessModel: p.businessModel, status: p.status, geocodeSource: s(p.geocodeSource), listingUrl: s(p.listingUrl), notes: s(p.notes),
      }} />
    </div>
  );
}
