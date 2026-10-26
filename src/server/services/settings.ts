import { eq } from "drizzle-orm";
import { getDb, withAudit } from "@/db/client";
import { appSettings } from "@/db/schema";
import { companySchema, type CompanySettings } from "@/lib/validation/admin";
import { zodFieldErrors } from "@/lib/validation/common";
import { assertCan, auditMeta, type AuthContext } from "../authz";
import { validation } from "../errors";

export const SETTINGS_KEYS = { company: "company" } as const;

async function getSetting<T>(key: string): Promise<T | null> {
  const [row] = await getDb().select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return (row?.value as T) ?? null;
}

async function putSetting(ctx: AuthContext, key: string, value: unknown) {
  await withAudit(auditMeta(ctx), (tx) =>
    tx.insert(appSettings).values({ key, value, updatedBy: ctx.userId })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedBy: ctx.userId, updatedAt: new Date() } }),
  );
}

export const getCompanySettings = () => getSetting<CompanySettings>(SETTINGS_KEYS.company).then((v) => v ?? {});

export async function updateCompanySettings(ctx: AuthContext, input: unknown) {
  assertCan(ctx, "admin.settings");
  const r = companySchema.safeParse(input);
  if (!r.success) throw validation("Verifique os campos.", zodFieldErrors(r.error));
  await putSetting(ctx, SETTINGS_KEYS.company, r.data);
}

/** Campos obrigatórios para emitir documentos oficiais (propostas) — usados para alertas de configuração pendente. */
export function missingCompanyFields(c: CompanySettings): string[] {
  const req: [keyof CompanySettings, string][] = [["legalName", "Razão social"], ["cnpj", "CNPJ"], ["city", "Cidade"], ["state", "UF"], ["email", "E-mail"]];
  return req.filter(([k]) => !c[k]).map(([, l]) => l);
}
