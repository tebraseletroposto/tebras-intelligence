"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

/** Menu do Tebras Intelligence (seção 11). */
export const INTEL_MENU = [
  { href: "/inteligencia", label: "Dashboard", exact: true },
  { href: "/inteligencia/mapa", label: "Mapa de oportunidades" },
  { href: "/inteligencia/imoveis", label: "Buscar imóveis" },
  { href: "/inteligencia/analise", label: "Análise de terreno", also: "/inteligencia/estudos" },
  { href: "/inteligencia/concorrencia", label: "Concorrência" },
  { href: "/inteligencia/simulador", label: "Simulador de infraestrutura" },
  { href: "/inteligencia/demanda", label: "Previsão de demanda" },
  { href: "/inteligencia/viabilidade", label: "Viabilidade financeira" },
  { href: "/inteligencia/comparador", label: "Comparador de projetos" },
  { href: "/inteligencia/importacao", label: "Importação de dados" },
  { href: "/inteligencia/fontes", label: "Catálogo de fontes" },
  { href: "/inteligencia/relatorios", label: "Relatórios" },
  { href: "/inteligencia/franquias", label: "Franquias" },
  { href: "/inteligencia/configuracoes", label: "Configurações" },
];

export function IntelNav() {
  const path = usePathname();
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Seções do Tebras Intelligence">
      {INTEL_MENU.map((t, i) => {
        const active = t.exact ? path === t.href : path.startsWith(t.href) || (!!t.also && path.startsWith(t.also));
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className={cn("flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors", active ? "bg-brand text-white" : "text-zinc-300 hover:bg-white/10 hover:text-white")}>
            <span className={cn("tabular text-[10px]", active ? "text-white/80" : "text-zinc-500")}>{String(i + 1).padStart(2, "0")}</span>{t.label}
          </Link>
        );
      })}
    </nav>
  );
}
