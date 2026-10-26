import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/lib/nav";
import { ALL_PERMISSIONS, DEFAULT_ROLES } from "@/lib/permissions";

describe("Catálogo de permissões e perfis", () => {
  it("perfis padrão do Tebras Intelligence", () => {
    expect(Object.keys(DEFAULT_ROLES).sort()).toEqual(["admin", "consulta", "franqueado", "inteligencia"]);
  });
  it("Administrador tem todas as permissões; demais perfis não administram", () => {
    expect(new Set(DEFAULT_ROLES.admin.permissions)).toEqual(new Set(ALL_PERMISSIONS));
    for (const [k, r] of Object.entries(DEFAULT_ROLES)) if (k !== "admin") expect(r.permissions.some((p) => p.startsWith("admin.") || p === "inteligencia.admin")).toBe(false);
  });
  it("Consulta é somente leitura", () => {
    expect(DEFAULT_ROLES.consulta.permissions).not.toContain("inteligencia.edit");
  });
  it("menu usa permissões existentes e não contém módulos do Romeu", () => {
    for (const i of NAV_ITEMS) for (const p of i.permissions) expect(ALL_PERMISSIONS).toContain(p);
    expect(NAV_ITEMS.map((i) => i.href)).toEqual(["/inteligencia", "/admin"]);
  });
});
