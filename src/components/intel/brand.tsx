import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { VALUE_NATURE, type ValueNature } from "@/lib/intel/provenance";
import { Badge } from "@/components/ui/misc";

/**
 * Identidade visual Tebras Intelligence: raio vermelho com núcleo branco (arte oficial) sobre preto,
 * com o mascote buldogue da Tebras. Paleta: preto #0C0B0E, vermelho #FB010C, branco e cinzas.
 */
export function BoltMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 96" className={cn("h-8 w-auto drop-shadow-[0_0_6px_rgba(251,1,12,0.55)]", className)} aria-hidden>
      <path d="M46 2 8 54h22L18 94 58 36H36L46 2Z" fill="#fb010c" stroke="#fb010c" strokeWidth="3" strokeLinejoin="round" />
      <path d="M41 13 15 50h20l-8 30 25-38H31l10-29Z" fill="#fff" />
    </svg>
  );
}

export function IntelWordmark({ compact }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <BoltMark className={compact ? "h-6" : "h-9"} />
      <span className="leading-none">
        <span className="block text-[10px] font-semibold uppercase tracking-[0.25em] text-brand">Tebras</span>
        <span className={cn("block font-black tracking-tight", compact ? "text-base" : "text-xl")}>Intelligence</span>
      </span>
    </span>
  );
}

export function NatureBadge({ nature, title }: { nature: ValueNature; title?: string }) {
  const n = VALUE_NATURE[nature];
  return <span title={title ?? n.description}><Badge tone={n.tone}>{n.label}</Badge></span>;
}

export function DemoBanner({ children }: { children?: ReactNode }) {
  return (
    <div role="status" className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-center gap-2 bg-[repeating-linear-gradient(135deg,#fb010c_0_12px,#d9000a_12px_24px)] px-4 py-1.5 text-center text-xs font-black uppercase tracking-[0.3em] text-white sm:-mx-6 lg:-mx-8">
      Demonstração — dados fictícios{children ? <span className="font-medium normal-case tracking-normal">· {children}</span> : null}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "brand" | "dark" }) {
  return (
    <div className={cn("rounded-lg border p-4", tone === "dark" ? "border-ink bg-ink text-white" : "border-zinc-200 bg-white")}>
      <p className={cn("text-xs font-medium uppercase tracking-wide", tone === "dark" ? "text-zinc-400" : "text-zinc-500")}>{label}</p>
      <p className={cn("tabular mt-1 text-2xl font-bold", tone === "brand" && "text-brand")}>{value}</p>
      {hint && <p className={cn("mt-0.5 text-xs", tone === "dark" ? "text-zinc-400" : "text-zinc-500")}>{hint}</p>}
    </div>
  );
}

export function ScoreGauge({ score, confidence }: { score: number | null; confidence: string }) {
  const pct = score ?? 0;
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-24 shrink-0 rounded-full" style={{ background: score === null ? "#e4e4e7" : `conic-gradient(#fb010c ${pct * 3.6}deg, #e4e4e7 0)` }} aria-label={score === null ? "Índice não calculável" : `Índice ${score} de 100`}>
        <div className="absolute inset-2 flex flex-col items-center justify-center rounded-full bg-ink text-white">
          <span className="tabular text-2xl font-black">{score ?? "—"}</span>
          <span className="text-[9px] uppercase tracking-wider text-zinc-400">de 100</span>
        </div>
      </div>
      <div className="text-sm">
        <p className="font-semibold">Índice de Potencial Tebras</p>
        <p className="text-zinc-600">Confiança: <strong>{confidence}</strong></p>
        <p className="text-xs text-zinc-500">Pesos são hipóteses de modelagem configuráveis.</p>
      </div>
    </div>
  );
}
