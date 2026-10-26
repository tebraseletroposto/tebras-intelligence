import type { Permission } from "./permissions";

export type NavItem = { href: string; label: string; icon: string; permissions: Permission[]; phase: number; available: boolean; description: string };

/** Menu lateral do sistema. As 14 seções da inteligência ficam no menu interno (/inteligencia). */
export const NAV_ITEMS: NavItem[] = [
  { href: "/inteligencia", label: "Tebras Intelligence", icon: "MapPinned", permissions: ["inteligencia.view", "inteligencia.admin"], phase: 1, available: true, description: "Inteligência geográfica, demanda e viabilidade" },
  { href: "/admin", label: "Administração", icon: "Settings", permissions: ["admin.users", "admin.roles", "admin.settings", "admin.audit"], phase: 1, available: true, description: "Usuários, perfis, empresa e auditoria" },
];
