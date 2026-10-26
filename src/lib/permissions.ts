/**
 * Catálogo de permissões do Tebras Intelligence (sistema independente).
 * `pnpm db:seed` sincroniza a tabela `permissions` e os perfis padrão.
 * A autorização é sempre verificada no servidor; ocultar botões é apenas conveniência.
 */
export const PERMISSIONS = {
  "dashboard.view": { module: "dashboard", description: "Visualizar o painel" },
  "inteligencia.view": { module: "inteligencia", description: "Consultar mapa, imóveis e estudos das organizações vinculadas" },
  "inteligencia.edit": { module: "inteligencia", description: "Cadastrar imóveis e editar estudos" },
  "inteligencia.import": { module: "inteligencia", description: "Importar arquivos de dados e corrigir carregadores" },
  "inteligencia.admin": { module: "inteligencia", description: "Administração global (fontes, pesos do índice, franquias, todas as organizações)" },
  "admin.users": { module: "admin", description: "Gerenciar usuários e atribuição de perfis" },
  "admin.roles": { module: "admin", description: "Gerenciar perfis e permissões" },
  "admin.settings": { module: "admin", description: "Alterar dados da empresa usados nos relatórios" },
  "admin.audit": { module: "admin", description: "Consultar a trilha de auditoria" },
} as const satisfies Record<string, { module: string; description: string }>;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/** Perfis iniciais. Acesso a dados de cada franquia depende ainda do vínculo à organização. */
export const DEFAULT_ROLES: Record<string, { name: string; description: string; permissions: Permission[] }> = {
  admin: { name: "Administrador", description: "Acesso total: usuários, perfis, auditoria e todas as organizações", permissions: ALL_PERMISSIONS },
  inteligencia: { name: "Analista de Inteligência", description: "Imóveis, estudos e importação de dados", permissions: ["dashboard.view", "inteligencia.view", "inteligencia.edit", "inteligencia.import"] },
  franqueado: { name: "Franqueado", description: "Restrito às organizações vinculadas", permissions: ["dashboard.view", "inteligencia.view", "inteligencia.edit"] },
  consulta: { name: "Consulta", description: "Somente leitura das organizações vinculadas", permissions: ["dashboard.view", "inteligencia.view"] },
};
