"use client";
import { IntelWordmark } from "@/components/intel/brand";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavItem } from "@/lib/nav";
import { NAV_ICONS } from "./icons";

export function Sidebar({ items, appEnv }: { items: NavItem[]; appEnv: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="fixed left-3 top-3 z-40 inline-flex size-10 items-center justify-center rounded-md bg-ink text-white lg:hidden" aria-label="Abrir menu">
        <Menu className="size-5" />
      </button>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-ink text-zinc-300 transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")} aria-label="Menu principal">
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <Link href="/" className="flex items-center gap-2 text-white" aria-label="Tebras Intelligence — início">
            <IntelWordmark compact />
          </Link>
          <button type="button" onClick={() => setOpen(false)} className="lg:hidden" aria-label="Fechar menu"><X className="size-5" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white",
                    )}
                  >
                    <span className={cn("h-5 w-0.5 rounded-full", active ? "bg-brand" : "bg-transparent")} aria-hidden />
                    {Icon && <Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-zinc-500 group-hover:text-zinc-300")} aria-hidden />}
                    <span className="flex-1 truncate">{item.label}</span>
                    {!item.available && <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500" title={`Previsto para a Fase ${item.phase}`}>F{item.phase}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-white/10 px-5 py-3 text-[11px] text-zinc-500">
          Tebras Intelligence · {appEnv === "production" ? "Produção" : <span className="font-semibold text-amber-400">Ambiente de {appEnv === "test" ? "testes" : "desenvolvimento"}</span>}
        </div>
      </aside>
    </>
  );
}
