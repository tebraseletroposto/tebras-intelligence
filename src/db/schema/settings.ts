import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Configurações gerais (chave → valor JSON). Ex.: dados da empresa usados em PDFs.
 * Nenhum dado da Tebras (CNPJ, endereço, banco) é pré-preenchido: a administração configura.
 */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
