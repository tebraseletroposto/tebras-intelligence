# Tebras Intelligence

Sistema **independente e confidencial** da Tebras Eletroposto para inteligência geográfica, previsão de demanda e
viabilidade financeira de **Tebras Smart Hubs**. Não compartilha banco, usuários nem servidor com nenhum outro sistema.

- Roda em **Node.js** (servidor) e é usado pelo **navegador** (computador, tablet, celular; instalável como aplicativo).
- Stack: Next.js 16 + TypeScript, PostgreSQL + **PostGIS**, Drizzle, MapLibre GL, Tailwind, pdfkit/ExcelJS, Vitest.

## Instalação
Requisitos: Node ≥ 22, pnpm 10, PostgreSQL ≥ 14 com PostGIS (Supabase já possui; Ubuntu: `apt install postgresql-16-postgis-3`).

```sql
CREATE ROLE tebras LOGIN PASSWORD 'troque-esta-senha' SUPERUSER;  -- precisa poder criar a extensão postgis
CREATE DATABASE tebras_intelligence OWNER tebras;
CREATE DATABASE tebras_intelligence_test OWNER tebras;            -- o nome DEVE conter "test"
```

```bash
pnpm install
cp .env.example .env.local     # preencha DATABASE_URL e TEST_DATABASE_URL
pnpm db:setup                  # migração + perfis
pnpm user:create-admin         # primeiro administrador
pnpm intel:demo seu@email      # opcional: organização "DEMONSTRAÇÃO" com dados fictícios
pnpm dev                       # desenvolvimento → http://localhost:3000
pnpm build && pnpm start       # produção (Node.js)
```

## Comandos
`pnpm test` (unitários + integração) · `pnpm typecheck` · `pnpm lint` · `pnpm db:backup` / `pnpm db:restore`.

## Acesso
Perfis: Administrador, Analista de Inteligência, Franqueado e Consulta. Além do perfil, o usuário precisa estar
**vinculado a uma organização** (tela Franquias). Cada organização vê apenas os próprios dados: isolamento no servidor
e políticas RLS no banco. Em produção, a aplicação deve usar o papel restrito de `db/runtime-role.sql`.

**Publicação passo a passo: [docs/PUBLICACAO.md](docs/PUBLICACAO.md)** · Documentação: [docs/INTELLIGENCE.md](docs/INTELLIGENCE.md) · Backup: [docs/BACKUP_E_RESTAURACAO.md](docs/BACKUP_E_RESTAURACAO.md)
