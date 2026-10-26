import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { auditLog, users } from "@/db/schema";
import { assertCan, type AuthContext } from "../authz";

const paramsSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  action: z.string().trim().max(50).optional().catch(undefined),
  entity: z.string().trim().max(50).optional().catch(undefined),
  from: z.iso.date().optional().catch(undefined),
  to: z.iso.date().optional().catch(undefined),
  page: z.coerce.number().int().min(1).default(1).catch(1),
});

export async function listAudit(ctx: AuthContext, raw: unknown) {
  assertCan(ctx, "admin.audit");
  const p = paramsSchema.parse(raw ?? {});
  const pageSize = 50;
  const where: SQL[] = [];
  if (p.action) where.push(eq(auditLog.action, p.action));
  if (p.entity) where.push(eq(auditLog.entityType, p.entity));
  if (p.from) where.push(gte(auditLog.occurredAt, new Date(`${p.from}T00:00:00-03:00`)));
  if (p.to) where.push(lte(auditLog.occurredAt, new Date(`${p.to}T23:59:59.999-03:00`)));
  if (p.q) {
    const t = `%${p.q.replace(/[%_\\]/g, "\\$&")}%`;
    where.push(or(ilike(auditLog.summary, t), ilike(users.name, t), ilike(auditLog.entityId, t))!);
  }
  const w = where.length ? and(...where) : undefined;
  const db = getDb();
  const [{ total }] = await db.select({ total: count() }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId)).where(w);
  const rows = await db
    .select({
      id: auditLog.id, occurredAt: auditLog.occurredAt, action: auditLog.action, entityType: auditLog.entityType,
      entityId: auditLog.entityId, summary: auditLog.summary, changedFields: auditLog.changedFields, ip: auditLog.ip,
      before: auditLog.before, after: auditLog.after, userName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.userId))
    .where(w)
    .orderBy(desc(auditLog.id))
    .limit(pageSize)
    .offset((p.page - 1) * pageSize);
  return { rows, total, params: p, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}
