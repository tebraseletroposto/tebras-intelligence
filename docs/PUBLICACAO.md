# Publicação: Supabase (banco) + Railway (sistema)

Tempo estimado: 30–40 minutos. Custos: Supabase tem plano gratuito para começar; Railway cobra pelo uso (aprox. US$ 5–20/mês).

## 1. Banco de dados no Supabase
1. Crie a conta em https://supabase.com e clique em **New project**.
   - Nome: `tebras-intelligence` · Região: **South America (São Paulo)** · defina uma senha forte e **guarde-a**.
2. Ative o PostGIS: menu **Database → Extensions** → procure `postgis` → **Enable**.
3. Copie a conexão: botão **Connect** → aba **ORMs/Direct** → **Session pooler** (porta 5432).
   Fica assim: `postgresql://postgres.xxxx:SUA_SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`
   Acrescente `?sslmode=require` no final.

## 2. Sistema no Railway
1. Crie a conta em https://railway.com (entre com o GitHub `tebraseletroposto`).
2. **New Project → Deploy from GitHub repo → tebras-intelligence**.
3. Em **Variables**, cadastre:
   | Variável | Valor |
   | --- | --- |
   | `DATABASE_URL` | conexão do Supabase (passo 1.3) |
   | `APP_ENV` | `production` |
   | `APP_URL` | o endereço gerado pelo Railway (passo 4) |
   | `APP_TIMEZONE` | `America/Sao_Paulo` |
   | `INTEL_USER_AGENT` | `TebrasIntelligence/1.0 (seu-email@tebras...)` |
4. **Settings → Networking → Generate Domain** (gera `https://tebras-intelligence-xxxx.up.railway.app`; depois pode usar um domínio próprio).
5. O Railway constrói e inicia sozinho (`railway.json`): aplica as migrações, cria os perfis e sobe o sistema.

## 3. Primeiro administrador
No Railway, abra o serviço → **⋮ → Shell** (ou Railway CLI: `railway run`) e execute:
```bash
ADMIN_NAME="Seu Nome" ADMIN_EMAIL=voce@tebras.com.br ADMIN_PASSWORD='SenhaForte#2026' pnpm user:create-admin
```
Entre no sistema, abra **Franquias**, entre em **Tebras Eletroposto** e vincule seu e-mail como *Administrador global*.

## 4. Carregar os dados reais de São Paulo
No mesmo Shell:
```bash
pnpm dados:sp
```
Carrega IBGE (645 municípios, população e área do Censo 2022), carregadores do OpenStreetMap de todo o estado,
vias principais da Região Metropolitana e polos de atração. Leva de 15 a 30 minutos e pode ser repetido a qualquer momento
(atualiza sem duplicar). Para uma etapa só: `pnpm dados:sp carregadores`.

## 5. Frota elétrica (SENATRAN)
O SENATRAN não tem API; a planilha é baixada manualmente:
1. Acesse https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/estatisticas-frota-de-veiculos-senatran
2. Baixe a planilha mais recente de **frota por município e tipo de combustível**.
3. No sistema: **Importação de dados** → tipo *Indicadores municipais* → fonte *SENATRAN — Frota* → envie o arquivo.
4. Mapeie: *Nome do município* → coluna do município · *UF* → coluna da UF · *Valor* → coluna **ELÉTRICO** ·
   *Data de referência* → mês da planilha (ou informe no campo de data) · Indicador: `frota_bev`.
5. A coluna “HÍBRIDO” do SENATRAN **não distingue híbridos plug-in**; por isso não é importada automaticamente como PHEV.

## 6. Mapa e geocodificação em produção
Os servidores públicos do OpenStreetMap atendem uso leve. Com muitos usuários, contrate um provedor (ex.: MapTiler)
e preencha `MAP_TILE_URL`, `MAP_ATTRIBUTION` e `NOMINATIM_URL`.

## 7. Backups
O Supabase faz backups diários automáticos (verifique o plano). Para cópia própria, ver `docs/BACKUP_E_RESTAURACAO.md`.
