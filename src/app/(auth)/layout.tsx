import Image from "next/image";
import { IntelWordmark } from "@/components/intel/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-ink lg:flex-row">
      <section className="relative flex flex-col justify-between overflow-hidden px-8 py-10 text-white lg:w-1/2 lg:px-14">
        <div className="absolute -right-32 -top-32 size-96 rounded-full bg-brand/25 blur-3xl" aria-hidden />
        <div className="relative"><IntelWordmark /></div>
        <div className="relative mt-8 hidden items-end gap-6 lg:flex">
          <Image src="/brand/intelligence/mascote.webp" alt="Mascote Tebras segurando o raio" width={300} height={450} priority className="h-auto w-56 drop-shadow-[0_0_30px_rgba(251,1,12,0.35)]" />
          <div>
            <p className="text-3xl font-bold leading-tight">Onde instalar o<br />próximo Smart Hub.</p>
            <p className="mt-3 max-w-sm text-zinc-400">Inteligência geográfica, previsão de demanda e viabilidade financeira — com fontes e premissas sempre explícitas.</p>
            <div className="mt-6 h-1 w-16 rounded-full bg-brand" />
          </div>
        </div>
        <p className="relative mt-8 hidden text-xs text-zinc-600 lg:block">Sistema confidencial · Acesso restrito e monitorado</p>
      </section>
      <main className="flex flex-1 items-center justify-center bg-canvas px-4 py-10 lg:rounded-l-3xl">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
