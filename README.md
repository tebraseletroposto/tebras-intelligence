# Romeu

Sistema integrado de gestão empresarial (MVP) da **Tebras Eletroposto**: comercial e CRM, pós-venda, engenharia e
dimensionamento de recarga de veículos elétricos, cadastros, projetos, compras, financeiro, contratos, marketing,
relatórios e IA assistiva — em uma única aplicação web com banco de dados central, permissões e auditoria.

> **Estado atual: MVP completo (Fases 1 a 7).** Todos os 13 módulos do menu estão disponíveis, com dados reais,
> permissões no servidor e no banco, auditoria e testes. Integrações externas (e-mail, WhatsApp, assinatura
> eletrônica, plataformas dos carregadores, bancos, nota fiscal) têm estrutura e procedimento manual documentados,
> mas ainda não estão conectadas. Veja [docs/ACOMPANHAMENTO.md](docs/ACOMPANHAMENTO.md).

## Stack

| Camada | Tecnologia |
| --- | --- |
| Aplicação web | Next.js 16 (App Router, Server Components, Server Actions) + TypeScript |
| Interface | Tailwind CSS 4, componentes próprios acessíveis, ícones Lucide |
| Banco de dados | PostgreSQL 16 (compatível com Supabase, Neon, RDS etc.) |
| Acesso a dados | Drizzle ORM + migrações SQL versionadas em `drizzle/` |
| Validação | Zod (mesmos schemas no cliente e no servidor) |
| Autenticação | Sessões no banco, Argon2id, cookie `httpOnly` (ver ADR-003) |
| Relatórios | pdfkit (PDF) e ExcelJS (XLSX) |
| IA | SDK oficial da Anthropic (opcional, ativado por variável de ambiente) |
| Aplicativo | PWA instalável (manifesto + service worker sem cache de dados) |
| Testes | Vitest (unitários e integração com Postgres real) + Playwright (E2E no Chromium) |

## Requisitos

- Node.js ≥ 22 e pnpm 10
- PostgreSQL ≥ 14 (local ou gerenciado)
- `pg_dump`/`pg_restore` para backups

## Instalação (desenvolvimento)

```bash
pnpm install
cp .env.example .env.local          # preencha DATABASE_URL e TEST_DATABASE_URL
pnpm db:setup                       # aplica migrações + sincroniza perfis e permissões
pnpm user:create-admin              # cria o primeiro administrador (interativo)
pnpm dev                            # http://localhost:3000
```

Criação de bancos locais de exemplo:

```sql
CREATE ROLE tebras LOGIN PASSWORD 'troque-esta-senha' CREATEDB;
CREATE DATABASE tebras_hub OWNER tebras;
CREATE DATABASE tebras_hub_test OWNER tebras;   -- o nome DEVE conter "test"
```

## Comandos

| Comando | O que faz |
| --- | --- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Desenvolvimento, build e servidor de produção |
| `pnpm typecheck` / `pnpm lint` | Verificação de tipos e lint |
| `pnpm db:generate` | Gera nova migração a partir de `src/db/schema` |
| `pnpm db:migrate` | Aplica migrações pendentes |
| `pnpm db:seed` | Sincroniza catálogo de permissões e perfis padrão (idempotente) |
| `pnpm user:create-admin` | Cria/promove administrador (também via `ADMIN_NAME`/`ADMIN_EMAIL`/`ADMIN_PASSWORD`) |
| `pnpm db:backup` / `pnpm db:restore` | Backup e restauração (ver [docs/BACKUP_E_RESTAURACAO.md](docs/BACKUP_E_RESTAURACAO.md)) |
| `pnpm test` | Testes unitários + integração (recria o banco de **testes**) |
| `pnpm test:e2e` | Testes E2E no navegador (exige `pnpm build` antes) |
| `pnpm test:all` | Tudo acima |

## Documentação

- [Arquitetura e decisões (ADRs)](docs/ARQUITETURA.md)
- [Modelo de dados](docs/MODELO_DE_DADOS.md)
- [Permissões por perfil](docs/PERMISSOES.md)
- [Segurança, LGPD e auditoria](docs/SEGURANCA_LGPD.md)
- [Backup e restauração](docs/BACKUP_E_RESTAURACAO.md)
- [Publicação em produção](docs/PUBLICACAO.md)
- [Custos de infraestrutura](docs/CUSTOS_INFRAESTRUTURA.md)
- [Testes](docs/TESTES.md)
- [Indicadores: definições e fórmulas](docs/INDICADORES.md)
- [Regras de dimensionamento](docs/REGRAS_DIMENSIONAMENTO.md), [compras e financeiro](docs/REGRAS_FINANCEIRAS.md) e [projetos, contratos e OS](docs/REGRAS_OPERACOES.md)
- [Central de IA](docs/IA.md)
- **[Procedimento de uso por área (PDF)](docs/PROCEDIMENTO_DE_USO.pdf)** — fonte em [PROCEDIMENTO_DE_USO.md](docs/PROCEDIMENTO_DE_USO.md); gerar novamente com `pnpm docs:manual`
- **[Tebras Intelligence](docs/INTELLIGENCE.md)** — inteligência geográfica, demanda e viabilidade de Smart Hubs (requer PostGIS)
- [Acompanhamento das fases, pendências e limitações](docs/ACOMPANHAMENTO.md)

## Estrutura

```
drizzle/                 migrações SQL versionadas (nunca editar uma migração já aplicada)
scripts/                 migração, seed, criação de admin, backup/restauração
src/app/(auth)/          login, recuperação e redefinição de senha
src/app/(app)/           área autenticada (dashboard, cadastros, admin, módulos)
src/components/          design system (ui/) e shell (menu, cabeçalho)
src/db/                  schema Drizzle, cliente e seed de controle de acesso
src/lib/                 domínio puro: documentos, formatação pt-BR, permissões, validação
src/server/              camada de servidor: autenticação, autorização, auditoria, serviços, PDF, relatórios e IA
src/proxy.ts             verificação otimista de sessão (Next 16: "proxy" substitui "middleware")
tests/                   unit/, integration/, e2e/
```

Regra de ouro: **toda regra de negócio e toda verificação de permissão ficam em `src/server/services`**, que recebem
o contexto do usuário (`AuthContext`). Páginas e Server Actions apenas chamam esses serviços.
