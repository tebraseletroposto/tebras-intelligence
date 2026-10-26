import { auditLog } from "@/db/schema";
import { getDb, type DbOrTx } from "@/db/client";

export type AuditEvent = {
  userId?: string | null;
  action: string; // ex.: auth.login, auth.login_failed, auth.logout, access.denied
  entityType?: string;
  entityId?: string;
  summary?: string;
  after?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

/** Registra eventos de segurança/negócio que não são alterações de linha (essas vêm dos triggers). */
export async function logEvent(ev: AuditEvent, db: DbOrTx = getDb()) {
  await db.insert(auditLog).values({
    userId: ev.userId ?? null,
    action: ev.action,
    entityType: ev.entityType,
    entityId: ev.entityId,
    summary: ev.summary,
    after: ev.after,
    ip: ev.ip ?? null,
    userAgent: ev.userAgent?.slice(0, 300) ?? null,
  });
}
