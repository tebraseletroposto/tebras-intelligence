import { Card, EmptyState, PageHeader } from "@/components/ui/misc";
import { Pagination, Table, Td, Th } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTIONS, AUDIT_ENTITIES, auditActionLabel, entityLabel, FIELD_LABELS } from "@/lib/domain/audit";
import { requirePagePermission } from "@/server/auth/dal";
import { listAudit } from "@/server/services/audit-query";

export const metadata = { title: "Auditoria" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = await requirePagePermission("admin.audit");
  const { rows, total, params, pageCount } = await listAudit(ctx, await searchParams);
  return (
    <div>
      <PageHeader title="Trilha de auditoria" description="Registro append-only de alterações de dados e eventos de segurança. O banco de dados bloqueia alteração e exclusão destes registros." />
      <Card>
        <form method="get" className="flex flex-wrap gap-3 border-b border-zinc-100 p-4">
          <input name="q" defaultValue={params.q ?? ""} placeholder="Usuário, resumo ou ID" aria-label="Buscar" className="h-10 min-w-56 flex-[2] rounded-md border border-zinc-300 px-3 text-sm" />
          <select name="action" defaultValue={params.action ?? ""} aria-label="Ação" className="h-10 min-w-40 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm">
            <option value="">Ação: todas</option>{Object.entries(AUDIT_ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select name="entity" defaultValue={params.entity ?? ""} aria-label="Entidade" className="h-10 min-w-40 flex-1 rounded-md border border-zinc-300 bg-white px-2 text-sm">
            <option value="">Entidade: todas</option>{Object.entries(AUDIT_ENTITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input type="date" name="from" defaultValue={params.from ?? ""} aria-label="De" className="h-10 flex-1 rounded-md border border-zinc-300 px-2 text-sm" />
          <div className="flex flex-1 gap-2">
            <input type="date" name="to" defaultValue={params.to ?? ""} aria-label="Até" className="h-10 flex-1 rounded-md border border-zinc-300 px-2 text-sm" />
            <button className="h-10 rounded-md bg-ink px-4 text-sm font-medium text-white">Filtrar</button>
          </div>
        </form>
        {rows.length === 0 ? <EmptyState title="Nenhum registro encontrado" /> : (
          <>
            <Table>
              <thead><tr><Th>Data/hora</Th><Th>Usuário</Th><Th>Ação</Th><Th>Entidade</Th><Th>Detalhes</Th><Th>IP</Th></tr></thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr key={r.id} className="align-top">
                    <Td className="tabular whitespace-nowrap">{formatDateTime(r.occurredAt)}</Td>
                    <Td>{r.userName ?? <span className="text-zinc-400">Sistema / anônimo</span>}</Td>
                    <Td className="whitespace-nowrap">{auditActionLabel(r.action)}</Td>
                    <Td className="whitespace-nowrap">{r.entityType ? entityLabel(r.entityType) : "—"}{r.entityId && <p className="font-mono text-[10px] text-zinc-400">{r.entityId.slice(0, 8)}</p>}</Td>
                    <Td className="max-w-md text-xs text-zinc-600">
                      {r.summary}
                      {r.changedFields?.length ? <p>Campos: {r.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(", ")}</p> : null}
                    </Td>
                    <Td className="font-mono text-xs text-zinc-500">{r.ip ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination base="/admin/auditoria" params={params} page={params.page} pageCount={pageCount} total={total} />
          </>
        )}
      </Card>
    </div>
  );
}
