import { Alert, PageHeader } from "@/components/ui/misc";
import { requirePagePermission } from "@/server/auth/dal";
import { getCompanySettings, missingCompanyFields } from "@/server/services/settings";
import { CompanyForm } from "./company-form";

export const metadata = { title: "Dados da empresa" };

export default async function CompanyPage() {
  await requirePagePermission("admin.settings");
  const company = await getCompanySettings();
  const missing = missingCompanyFields(company);
  return (
    <div>
      <PageHeader title="Dados da empresa" description="Usados em propostas, contratos e relatórios. O sistema não pré-preenche nenhum dado da Tebras: confira com o contador/jurídico antes de salvar." />
      {missing.length > 0 && <Alert kind="warning" className="mb-4" title="Configuração pendente">Campos necessários para documentos oficiais: {missing.join(", ")}. Enquanto estiverem vazios, PDFs oficiais não poderão ser emitidos.</Alert>}
      <CompanyForm company={company} />
    </div>
  );
}
