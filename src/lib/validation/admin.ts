import { z } from "zod";
import { isValidCnpj, normalizeDocument } from "../domain/documents";
import { checkbox, optionalEmail, optionalPhone, optionalText, optionalZip, requiredText } from "./common";

export const userCreateSchema = z.object({
  name: requiredText("Nome", 2, 120),
  email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email({ error: "E-mail inválido." })),
  temporaryPassword: z.string().min(1, { error: "Informe a senha provisória." }),
  roleIds: z.array(z.uuid()).min(1, { error: "Selecione pelo menos um perfil." }),
});

export const userUpdateSchema = z.object({
  name: requiredText("Nome", 2, 120),
  email: z.preprocess((v) => (typeof v === "string" ? v.trim().toLowerCase() : v), z.email({ error: "E-mail inválido." })),
  roleIds: z.array(z.uuid()).min(1, { error: "Selecione pelo menos um perfil." }),
  active: checkbox,
});

export const roleSchema = z.object({
  name: requiredText("Nome do perfil", 2, 80),
  description: optionalText(300),
  permissions: z.array(z.string()).default([]),
});

/** Dados da empresa usados em propostas e relatórios. Nada é pré-preenchido. */
export const companySchema = z.object({
  legalName: optionalText(200),
  tradeName: optionalText(200),
  cnpj: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().transform(normalizeDocument).refine(isValidCnpj, { error: "CNPJ inválido." }).optional(),
  ),
  stateRegistration: optionalText(30),
  municipalRegistration: optionalText(30),
  email: optionalEmail,
  phone: optionalPhone,
  website: optionalText(200),
  zipCode: optionalZip,
  street: optionalText(200),
  number: optionalText(20),
  complement: optionalText(100),
  district: optionalText(100),
  city: optionalText(100),
  state: optionalText(2),
  bankInfo: optionalText(1000),
  proposalFooter: optionalText(2000),
});
export type CompanySettings = z.infer<typeof companySchema>;
