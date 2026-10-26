// Gera a matriz de permissões em Markdown a partir de src/lib/permissions.ts (usada em docs/PERMISSOES.md).
import { ALL_PERMISSIONS, DEFAULT_ROLES, PERMISSIONS } from "../src/lib/permissions";
const keys = Object.keys(DEFAULT_ROLES);
console.log(`| Permissão | Descrição | ${keys.map((k) => DEFAULT_ROLES[k].name).join(" | ")} |`);
console.log(`| --- | --- | ${keys.map(() => ":-:").join(" | ")} |`);
for (const p of ALL_PERMISSIONS)
  console.log(`| \`${p}\` | ${PERMISSIONS[p].description} | ${keys.map((k) => (DEFAULT_ROLES[k].permissions.includes(p) ? "✔" : "")).join(" | ")} |`);
