import Image from "next/image";
import { DemoBanner, IntelWordmark } from "@/components/intel/brand";
import { requirePagePermission } from "@/server/auth/dal";
import { loadScope } from "@/server/intel/scope";
import { selectOrgAction } from "./actions";
import { IntelNav } from "./nav";

export const metadata = { title: { template: "%s · Tebras Intelligence", default: "Tebras Intelligence" } };

export default async function IntelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePagePermission("inteligencia.view", "inteligencia.admin");
  const scope = await loadScope(ctx);
  return (
    <div>
      {scope.currentOrg?.isDemo && <DemoBanner>Organização “{scope.currentOrg.name}”. Nada aqui representa dados reais.</DemoBanner>}
      <div className="relative mb-6 overflow-hidden rounded-xl bg-ink text-white shadow-lg">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(251,1,12,0.35),transparent_45%)]" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4 px-5 pt-4">
          <div className="flex items-center gap-3">
            <Image src="/brand/intelligence/mascote-avatar.webp" alt="Mascote Tebras" width={52} height={52} className="hidden size-13 rounded-full ring-2 ring-brand sm:block" />
            <IntelWordmark />
            <p className="hidden max-w-xs text-xs text-zinc-400 md:block">Inteligência geográfica, demanda e viabilidade para Tebras Smart Hubs.</p>
          </div>
          {scope.memberships.length > 0 ? (
            <form action={selectOrgAction} className="flex items-center gap-2">
              <label htmlFor="org" className="text-xs text-zinc-400">Organização</label>
              <select id="org" name="org" defaultValue={scope.currentOrgId ?? ""} className="h-9 max-w-56 rounded-md border border-white/20 bg-ink-800 px-2 text-sm text-white">
                {scope.memberships.map((m) => <option key={m.organizationId} value={m.organizationId}>{m.name}{m.isDemo ? " (DEMONSTRAÇÃO)" : ""}</option>)}
              </select>
              <button className="h-9 rounded-md bg-brand px-3 text-sm font-semibold text-white hover:bg-brand-600">Trocar</button>
            </form>
          ) : (
            <p className="rounded-md bg-white/10 px-3 py-1.5 text-xs text-amber-300">Sem organização vinculada — solicite acesso a um administrador.</p>
          )}
        </div>
        <div className="relative mt-3 border-t border-white/10 px-4 py-2"><IntelNav /></div>
      </div>
      {children}
    </div>
  );
}
