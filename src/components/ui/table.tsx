import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

type Params = Record<string, string | number | undefined | null>;

export function buildHref(base: string, params: Params, patch: Params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) if (v !== undefined && v !== null && v !== "") sp.set(k, String(v));
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-zinc-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th scope="col" className={cn("bg-zinc-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-zinc-600", className)}>{children}</th>;
}

/** Cabeçalho ordenável por link (mantém filtros e paginação no URL). */
export function SortableTh({ label, field, base, params, className }: { label: string; field: string; base: string; params: Params & { sort?: string; dir?: string }; className?: string }) {
  const active = params.sort === field;
  const nextDir = active && params.dir === "asc" ? "desc" : "asc";
  const Icon = !active ? ArrowUpDown : params.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <Th className={className}>
      <Link href={buildHref(base, params, { sort: field, dir: nextDir, page: 1 })} className="inline-flex items-center gap-1 hover:text-ink" aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : undefined}>
        {label}
        <Icon className={cn("size-3.5", active ? "text-brand" : "text-zinc-400")} aria-hidden />
      </Link>
    </Th>
  );
}

export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-top text-zinc-800", className)}>{children}</td>;
}

export function Pagination({ base, params, page, pageCount, total }: { base: string; params: Params; page: number; pageCount: number; total: number }) {
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 text-sm text-zinc-600" aria-label="Paginação">
      <span className="tabular">{formatNumber(total)} {total === 1 ? "registro" : "registros"} · página {page} de {pageCount}</span>
      <div className="flex gap-1">
        <PageLink href={page > 1 ? buildHref(base, params, { page: page - 1 }) : null} label="Página anterior"><ChevronLeft className="size-4" /></PageLink>
        <PageLink href={page < pageCount ? buildHref(base, params, { page: page + 1 }) : null} label="Próxima página"><ChevronRight className="size-4" /></PageLink>
      </div>
    </nav>
  );
}

function PageLink({ href, label, children }: { href: string | null; label: string; children: ReactNode }) {
  const cls = "inline-flex size-8 items-center justify-center rounded-md border border-zinc-300 bg-white";
  return href ? (
    <Link href={href} aria-label={label} className={cn(cls, "hover:bg-zinc-50")}>{children}</Link>
  ) : (
    <span aria-disabled className={cn(cls, "opacity-40")}>{children}</span>
  );
}
