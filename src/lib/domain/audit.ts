const ACTIONS: Record<string, string> = {
  insert: "Criação", update: "Alteração", delete: "Exclusão",
  "auth.login": "Login", "auth.logout": "Logout", "auth.login_failed": "Falha de login", "auth.login_blocked": "Login bloqueado",
  "auth.password_changed": "Senha alterada", "auth.password_reset": "Senha redefinida", "auth.reset_link_created": "Link de redefinição gerado",
  "access.denied": "Acesso negado", "export.pdf": "PDF gerado", "document.download": "Download de documento",
};
const ENTITIES: Record<string, string> = {
  users: "Usuário", roles: "Perfil", role_permissions: "Permissão de perfil", user_roles: "Perfil de usuário",
  parties: "Cadastro", party_roles: "Papel do cadastro", party_contacts: "Contato", party_addresses: "Endereço",
  party_relations: "Vínculo", app_settings: "Configuração",
  pipeline_stages: "Etapa do funil", opportunities: "Oportunidade", activities: "Atividade", proposals: "Proposta",
  proposal_versions: "Versão de proposta", proposal_items: "Item de proposta", deliveries: "Entrega", delivery_checklist_items: "Checklist de entrega",
  post_sale_tasks: "Acompanhamento", occurrences: "Ocorrência", satisfaction_surveys: "Pesquisa de satisfação",
  manufacturers: "Fabricante", equipment_models: "Modelo de carregador", equipment_prices: "Preço de equipamento", catalog_items: "Material/serviço",
  technical_projects: "Projeto técnico", documents: "Documento", scenarios: "Cenário", scenario_equipment: "Equipamento do cenário",
  scenario_items: "Item do cenário", technical_validations: "Validação técnica",
};
export const auditActionLabel = (a: string) => ACTIONS[a] ?? a;
export const entityLabel = (e: string) => ENTITIES[e] ?? e;
export const AUDIT_ACTIONS = ACTIONS;
export const AUDIT_ENTITIES = ENTITIES;

/** Rótulos dos campos para o histórico. */
export const FIELD_LABELS: Record<string, string> = {
  name: "Nome", trade_name: "Nome fantasia", document: "CPF/CNPJ", email: "E-mail", billing_email: "E-mail de faturamento",
  phone: "Telefone", whatsapp: "WhatsApp", segment: "Segmento", person_kind: "Tipo de pessoa", stage: "Etapa do cadastro",
  legal_basis: "Base legal (LGPD)", data_purpose: "Finalidade", notes: "Observações", active: "Ativo", website: "Site",
  representative_name: "Representante", representative_role: "Cargo do representante", state_registration: "Inscrição estadual",
  municipal_registration: "Inscrição municipal", updated_by: "Alterado por", position: "Cargo", is_primary: "Principal",
  is_authorized_representative: "Representante autorizado", kind: "Tipo", city: "Cidade", state: "UF", street: "Logradouro",
  number: "Número", zip_code: "CEP", district: "Bairro", complement: "Complemento", label: "Identificação", role: "Papel",
};
