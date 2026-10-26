import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;

const globalForDb = globalThis as unknown as { __tebrasPool?: Pool; __tebrasDb?: Db };

/** Pool único por processo (reaproveitado no hot reload em desenvolvimento). */
export function getDb(): Db {
  if (!globalForDb.__tebrasDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL não configurada");
    globalForDb.__tebrasPool = new Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 10) });
    globalForDb.__tebrasDb = drizzle(globalForDb.__tebrasPool, { schema });
  }
  return globalForDb.__tebrasDb;
}

export async function closeDb() {
  await globalForDb.__tebrasPool?.end();
  globalForDb.__tebrasPool = undefined;
  globalForDb.__tebrasDb = undefined;
}

/**
 * Referência qualificada à coluna da consulta EXTERNA, para subconsultas correlacionadas.
 * O Drizzle renderiza colunas sem o nome da tabela em selects de tabela única ("id"),
 * o que dentro de uma subconsulta seria resolvido para a tabela interna. Use sempre este helper.
 */
export const outerCol = (table: string, column: string) => sql.raw(`"${table}"."${column}"`);

export type AuditMeta = { userId: string | null; ip?: string | null; userAgent?: string | null };

/**
 * Executa operações em transação com o contexto de auditoria definido.
 * Os triggers de auditoria do banco leem app.user_id / app.ip / app.user_agent.
 */
export async function withAudit<T>(meta: AuditMeta, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.user_id', ${meta.userId ?? ""}, true),
                 set_config('app.ip', ${meta.ip ?? ""}, true),
                 set_config('app.user_agent', ${(meta.userAgent ?? "").slice(0, 300)}, true)`,
    );
    return fn(tx);
  });
}
