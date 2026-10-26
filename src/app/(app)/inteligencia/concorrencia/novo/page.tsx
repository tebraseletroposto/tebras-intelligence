import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/dal";
import { saveStationAction } from "../../actions";
import { StationForm } from "../station-form";

export const metadata = { title: "Cadastrar carregador" };

export default async function NewStationPage() {
  await requirePagePermission("inteligencia.import", "inteligencia.admin");
  return (<div><PageHeader title="Cadastrar carregador" breadcrumb={<Link href="/inteligencia/concorrencia" className="hover:text-brand">Concorrência</Link>} /><div className="rounded-lg border border-zinc-200 bg-white p-5"><StationForm action={saveStationAction.bind(null, null)} isNew /></div></div>);
}
