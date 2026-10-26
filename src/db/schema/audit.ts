import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Trilha de auditoria append-only.
 * - Alterações de dados são gravadas por triggers no banco (não dependem do código da aplicação).
 * - Eventos de segurança (login, logout, acesso negado, exportações) são gravados pela aplicação.
 * - UPDATE e DELETE são bloqueados por trigger (ver migração de auditoria).
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // insert | update | delete | auth.login | ...
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary"),
    before: jsonb("before"),
    after: jsonb("after"),
    changedFields: text("changed_fields").array(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("audit_entity_idx").on(t.entityType, t.entityId),
    index("audit_user_idx").on(t.userId),
    index("audit_occurred_idx").on(t.occurredAt),
  ],
);
