import Link from "next/link";
import { canAny } from "@/server/authz";
import { requirePagePermission } from "@/server/auth/dal";
import type { Permission } from "@/lib/permissions";

const LINKS: { href: string; label: string; perm: Permission[] }[] = [
  { href: "/admin/usuarios", label: "Usuários", perm: ["admin.users"] },
  { href: "/admin/perfis", label: "Perfis e permissões", perm: ["admin.roles", "admin.users"] },
  { href: "/admin/empresa", label: "Dados da empresa", perm: ["admin.settings"] },
  { href: "/admin/auditoria", label: "Auditoria", perm: ["admin.audit"] },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requirePagePermission("admin.users", "admin.roles", "admin.settings", "admin.audit");
  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="Administração">
        {LINKS.filter((l) => canAny(ctx, l.perm)).map((l) => (
          <Link key={l.href} href={l.href} className="rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 hover:border-brand hover:text-brand">{l.label}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
