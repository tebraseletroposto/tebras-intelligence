# Tebras Intelligence

Sistema independente para inteligência geográfica, previsão de demanda e
viabilidade financeira de **Tebras Smart Hubs** (modelo A) e estudos **B2B** (modelo B).
Roda em **Node.js** (`pnpm build && pnpm start`) e é acessado pelo **navegador** (desktop, tablet e celular; PWA instalável).

## Identidade visual
Raio vermelho `#FB010C` com núcleo branco sobre preto, mascote buldogue Tebras, cinzas para informação secundária.
Arquivos: `public/brand/intelligence/` (raio SVG/WEBP/PNG para PDF, mascote). Componentes: `src/components/intel/brand.tsx`.

## Instalação
Requer **PostgreSQL ≥ 14 com PostGIS** (Supabase já oferece; Debian/Ubuntu: `apt install postgresql-16-postgis-3`).
```bash
pnpm install && cp .env.example .env.local
pnpm db:setup                     # migração 0000 cria extensão postgis, tabelas intel_*, RLS e catálogo de fontes
pnpm user:create-admin
pnpm intel:demo seu@email          # OPCIONAL: organização "Tebras — DEMONSTRAÇÃO" com dados fictícios (bloqueado em produção)
pnpm dev
```
Variáveis opcionais: `MAP_TILE_URL`, `MAP_ATTRIBUTION`, `NOMINATIM_URL`, `OVERPASS_URL`, `IBGE_API_URL`,
`OPEN_CHARGE_MAP_API_KEY`, `INTEL_USER_AGENT`. Em produção use provedores próprios/contratados de tiles e geocodificação
(os servidores públicos do OSM não são infraestrutura ilimitada).

## Telas (menu interno)
Dashboard · Mapa de oportunidades (MapLibre; busca, ponto, coordenadas, polígono do terreno, camadas e mapa de calor com legenda e filtro de período) ·
Buscar imóveis (filtros + CSV) · Análise de terreno (ranking + CSV/XLSX/PDF) · Concorrência (inventário com verificação e histórico de correções) ·
Simulador (comparador de configurações) · Previsão de demanda · Viabilidade financeira · Comparador de projetos · Importação de dados ·
Catálogo de fontes · Relatórios · Franquias · Configurações (versões do índice).

## Arquitetura
- `src/lib/intel/*` — cálculos puros e testados: geo, concorrência, índice de potencial, infraestrutura, baixa tensão, demanda, financeiro, recomendação, importador.
- `src/server/intel/*` — serviços com escopo multiempresa (`scope.ts`), adaptadores externos (`adapters.ts`), relatórios.
- Banco: `drizzle/0000_fundacao.sql`, schema `src/db/schema/intelligence.ts`.
- Python não foi adotado: o modelo atual é de regras e roda no servidor Node; a calibração estatística (MAE/WAPE, validação temporal) também. Python/ML entra quando houver dados de operação suficientes para superar a linha de base.

### Mapeamento das entidades pedidas
organizations/franchises → `intel_organizations` (matriz/franquia/parceiro) + `intel_org_regions`; users/roles → `users`, `roles` + `intel_memberships` (admin_global, gestor_regional, franqueado, analista, consulta);
states/municipalities → `intel_states`, `intel_municipalities`; geographic_areas, roads, properties, property_documents, charging_stations, charging_connectors, charger_catalog, energy_tariffs, data_sources, data_imports, imported_datasets, geographic_indicators → tabelas `intel_*` homônimas;
demand_models/demand_model_versions → `intel_model_versions`; demand_scenarios, infrastructure_scenarios, electrical_assessments, financial_projects, project_costs, financial_scenarios → JSONB validado em `intel_studies` (chargers, site, electrical, demand, finance);
demand_forecasts → `intel_demand_forecasts` (parâmetros + versão + resultado); project_revenues → `intel_study_revenues`; project_reports → `intel_reports`; audit_logs → `audit_log` (triggers); calibração → `intel_hub_observations`.

## Segurança
- Autorização sempre no servidor; escopo por organização em cada serviço (`withIntel`) e **RLS** no PostgreSQL (`intel_org_visible`) — efetiva com o papel restrito de produção (`db/runtime-role.sql`); superusuário/dono ignora RLS.
- Análises usam apenas dados públicos + dados da organização dona do imóvel.
- Importação: limite 15 MB, validação de formato, hash SHA-256, arquivo original preservado; EVIE exige registro das condições de uso.
- LGPD: apenas dados agregados de mobilidade; nada de trajetos ou identificadores de motoristas.

## Fontes (estado real)
| Fonte | Situação |
| --- | --- |
| Cadastro manual e importação CSV/XLSX/GeoJSON | Funcionando |
| IBGE Localidades / Censo 2022 (SIDRA 4714) | Implementado; testado com respostas gravadas. Botão “Testar conexão” marca o status real |
| Nominatim, Overpass, tiles OSM | Implementados com limite de uso/cache; dependem de rede |
| Open Charge Map | Implementado; **necessita `OPEN_CHARGE_MAP_API_KEY`** |
| SENATRAN, DETRAN, ANEEL, GeoSampa, extratos OSM | Importação manual (sem API pública adequada) |
| EVIE (Uber) | Importador configurável; **necessita autorização e arquivos da Uber** |
| Contagens de tráfego | Não implementada (adaptador futuro) |

## Modelos e limitações
- **Índice de Potencial (0–100)**: média ponderada só das dimensões com dados; pesos são hipóteses versionadas; cobertura e confiança exibidas à parte.
- **Demanda (regras-v1)**: frota → recarga pública → área de influência → captável (com fator de concorrência) → limitada pela capacidade. Valores iniciais das premissas são pontos de partida, não observações. Sem intervalos de previsão nem perfil horário até haver dados.
- **Baixa tensão**: classificação preliminar; nunca afirma aprovação da distribuidora.
- **Financeiro**: receita ≠ lucro; resultado operacional, lucro líquido e fluxo de caixa separados; payback só quando atingido; receitas complementares só contratadas/realizadas por padrão.
- Distâncias em linha reta (rede viária exige roteamento — pendente). GeoPackage: converter para GeoJSON.

## Pendências
Roteamento por rede viária; adaptador de contagens de tráfego; importação direta GeoPackage/Shapefile; tela de tarifas de energia (tabela existe);
processamento assíncrono em fila para arquivos muito grandes; modelo estatístico calibrado quando houver ≥ 1 ano de operação dos hubs.
