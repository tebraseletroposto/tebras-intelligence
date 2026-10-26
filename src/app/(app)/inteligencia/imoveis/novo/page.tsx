import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/dal";
import { savePropertyAction } from "../../actions";
import { propertyFormOptions } from "../options";
import { PropertyForm } from "../property-form";

export const metadata = { title: "Cadastrar imóvel" };

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ lat?: string; lng?: string; polygon?: string }> }) {
  await requirePagePermission("inteligencia.edit", "inteligencia.admin");
  const sp = await searchParams;
  return (
    <div>
      <PageHeader title="Cadastrar imóvel" breadcrumb={<Link href="/inteligencia/imoveis" className="hover:text-brand">Imóveis</Link>}
        description="Cadastre mesmo com informações incompletas: campos vazios ficam como “não informado” e reduzem a confiança das análises, sem virar zero." />
      <PropertyForm action={savePropertyAction.bind(null, null)} opts={propertyFormOptions()} initial={{ lat: sp.lat, lng: sp.lng, polygon: sp.polygon, geocodeSource: sp.lat ? "Seleção no mapa" : undefined }} />
    </div>
  );
}
