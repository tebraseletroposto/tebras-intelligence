import Link from "next/link";
import { Bell, KeyRound, LogOut, User } from "lucide-react";
import { logoutAction } from "@/app/(auth)/actions";
import type { Tone } from "@/components/ui/misc";

export type Notice = { id: string; title: string; description?: string; href?: string; tone: Tone };

export function Header({ user, notices }: { user: { name: string; email: string; roles: string[] }; notices: Notice[] }) {
  const initials = user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 pl-16 backdrop-blur lg:pl-6">
      <div className="flex-1" />

      <details className="group relative">
        <summary className="relative flex size-10 cursor-pointer list-none items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100" aria-label={`Notificações (${notices.length})`}>
          <Bell className="size-5" aria-hidden />
          {notices.length > 0 && <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{notices.length}</span>}
        </summary>
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-zinc-200 bg-white shadow-lg">
          <p className="border-b border-zinc-100 px-4 py-2.5 text-sm font-semibold">Notificações</p>
          {notices.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-zinc-500">Nenhuma pendência no momento.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-zinc-100 overflow-y-auto">
              {notices.map((n) => (
                <li key={n.id}>
                  <Link href={n.href ?? "#"} className="block px-4 py-3 hover:bg-zinc-50">
                    <p className="text-sm font-medium text-ink">{n.title}</p>
                    {n.description && <p className="mt-0.5 text-xs text-zinc-500">{n.description}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>

      <details className="relative">
        <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-zinc-100" aria-label="Menu do usuário">
          <span className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{initials || <User className="size-4" />}</span>
          <span className="hidden text-left sm:block">
            <span className="block max-w-40 truncate text-sm font-medium leading-tight">{user.name}</span>
            <span className="block max-w-40 truncate text-xs leading-tight text-zinc-500">{user.roles.join(", ") || "Sem perfil"}</span>
          </span>
        </summary>
        <div className="absolute right-0 mt-2 w-60 rounded-lg border border-zinc-200 bg-white py-1 shadow-lg">
          <p className="truncate px-4 py-2 text-xs text-zinc-500">{user.email}</p>
          <Link href="/perfil/senha" className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-zinc-50"><KeyRound className="size-4" />Alterar senha</Link>
          <form action={logoutAction}>
            <button type="submit" className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-red-700 hover:bg-red-50"><LogOut className="size-4" />Sair</button>
          </form>
        </div>
      </details>
    </header>
  );
}
