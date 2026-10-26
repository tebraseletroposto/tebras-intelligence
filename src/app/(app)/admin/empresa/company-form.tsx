"use client";
import { useActionState } from "react";
import { FormSection, SelectInput, TextArea, TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/lib/action-state";
import { formatCnpj, formatPhone, formatZip, UFS } from "@/lib/domain/documents";
import type { CompanySettings } from "@/lib/validation/admin";
import { updateCompanyAction } from "../actions";

export function CompanyForm({ company }: { company: CompanySettings }) {
  const [state, action] = useActionState(updateCompanyAction, initialActionState);
  const v = { ...company, ...(state.ok ? {} : (state.values as CompanySettings | undefined) ?? {}) };
  const e = state.fieldErrors ?? {};
  const t = (k: keyof CompanySettings) => (v[k] as string | undefined) ?? "";
  return (
    <form key={state.ts ?? 0} action={action} className="space-y-5" noValidate>
      {state.message && <Alert kind={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <FormSection title="Identificação">
        <TextInput label="Razão social" name="legalName" defaultValue={t("legalName")} error={e.legalName} className="sm:col-span-2" />
        <TextInput label="Nome fantasia" name="tradeName" defaultValue={t("tradeName")} error={e.tradeName} />
        <TextInput label="CNPJ" name="cnpj" defaultValue={t("cnpj") ? formatCnpj(t("cnpj")) : ""} error={e.cnpj} />
        <TextInput label="Inscrição estadual" name="stateRegistration" defaultValue={t("stateRegistration")} error={e.stateRegistration} />
        <TextInput label="Inscrição municipal" name="municipalRegistration" defaultValue={t("municipalRegistration")} error={e.municipalRegistration} />
      </FormSection>
      <FormSection title="Contato">
        <TextInput label="E-mail" name="email" type="email" defaultValue={t("email")} error={e.email} />
        <TextInput label="Telefone" name="phone" defaultValue={formatPhone(t("phone"))} error={e.phone} />
        <TextInput label="Site" name="website" defaultValue={t("website")} error={e.website} />
      </FormSection>
      <FormSection title="Endereço">
        <TextInput label="CEP" name="zipCode" defaultValue={formatZip(t("zipCode"))} error={e.zipCode} />
        <TextInput label="Logradouro" name="street" defaultValue={t("street")} error={e.street} className="sm:col-span-2" />
        <TextInput label="Número" name="number" defaultValue={t("number")} error={e.number} />
        <TextInput label="Complemento" name="complement" defaultValue={t("complement")} error={e.complement} />
        <TextInput label="Bairro" name="district" defaultValue={t("district")} error={e.district} />
        <TextInput label="Cidade" name="city" defaultValue={t("city")} error={e.city} />
        <SelectInput label="UF" name="state" defaultValue={t("state")} placeholder="—" options={UFS.map((u) => [u, u] as [string, string])} error={e.state} />
      </FormSection>
      <FormSection title="Documentos comerciais" description="Textos usados nas propostas em PDF (Fase 2).">
        <TextArea label="Dados bancários para pagamento" name="bankInfo" defaultValue={t("bankInfo")} error={e.bankInfo} className="sm:col-span-3" />
        <TextArea label="Rodapé padrão das propostas" name="proposalFooter" defaultValue={t("proposalFooter")} error={e.proposalFooter} className="sm:col-span-3" />
      </FormSection>
      <div className="flex justify-end"><SubmitButton>Salvar dados da empresa</SubmitButton></div>
    </form>
  );
}
