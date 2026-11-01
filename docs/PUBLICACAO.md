# Publicação: Supabase (banco) + Render (sistema) + GitHub Actions (operações)

Nenhum terminal é necessário. Tempo estimado: 30 minutos.

## 1. Banco de dados — Supabase
1. https://supabase.com → **New project** → nome `tebras-intelligence`, região **South America (São Paulo)**, senha forte (guarde).
2. **Database → Extensions** → `postgis` → **Enable**.
3. Botão **Connect** (topo) → **Session pooler** → copie a URI e troque `[YOUR-PASSWORD]` pela senha.
   No final acrescente: `?sslmode=require&uselibpqcompat=true`
   Resultado: `postgresql://postgres.xxxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true`
   Se a senha tiver símbolos (`@ # / ? %`), use só letras e números ou redefina a senha em **Project Settings → Database**.

## 2. Segredos no GitHub
Repositório `tebras-intelligence` → **Settings → Secrets and variables → Actions → New repository secret**:
- `DATABASE_URL` = a URI do passo 1.3
- `ADMIN_PASSWORD` = a senha do seu usuário no sistema (mín. 10 caracteres, letras e números, sem conter o e-mail)

## 3. Preparar banco, administrador e dados — GitHub Actions
Repositório → **Actions** → **Banco de dados** → **Run workflow**, nesta ordem (espere cada um ficar verde ✓):
1. `preparar-banco`
2. `criar-administrador` — preencha nome e e-mail
3. `carregar-dados-sp` — 15 a 30 min (IBGE + OpenStreetMap; pode repetir quando quiser atualizar)

## 4. Sistema — Render
1. https://render.com → **Get Started** → entre com o **GitHub** (`tebraseletroposto`) e autorize o repositório `tebras-intelligence`.
2. **New → Blueprint** → escolha `tebras-intelligence` → o Render lê o `render.yaml`.
3. Quando pedir `DATABASE_URL`, cole a URI do passo 1.3 → **Apply**.
4. Aguarde o deploy (5–10 min). O endereço aparece no topo: `https://tebras-intelligence-xxxx.onrender.com`.
5. Em **Environment**, adicione `APP_URL` = esse endereço (o Render reinicia sozinho).

Plano gratuito: o sistema “dorme” após 15 minutos sem uso e o primeiro acesso leva cerca de 1 minuto.
Plano Starter (US$ 7/mês): sempre ligado.

## 5. Primeiro acesso
1. Abra o endereço, entre com o e-mail do passo 3.2 e a senha `ADMIN_PASSWORD`.
2. **Franquias → Tebras Eletroposto** → vincule seu e-mail como *Administrador global*.
3. **Importação de dados** → frota do SENATRAN (ver abaixo).
4. **Buscar imóveis → Cadastrar imóvel** → cole o link do anúncio e cadastre seus terrenos.

## Frota elétrica (SENATRAN)
1. https://www.gov.br/transportes/pt-br/assuntos/transito/conteudo-Senatran/estatisticas-frota-de-veiculos-senatran
2. Baixe a planilha mais recente de frota por município e combustível.
3. **Importação de dados** → *Indicadores municipais* → fonte *SENATRAN — Frota* → envie o arquivo.
4. Mapeie *Nome do município*, *UF*, *Valor* = coluna **ELÉTRICO**, informe a data de referência e o indicador `frota_bev`.
   A coluna “HÍBRIDO” não distingue plug-in e por isso não é usada como PHEV.

## Produção com mais usuários
- Mapa e geocodificação: contrate um provedor (ex.: MapTiler) e preencha `MAP_TILE_URL`, `MAP_ATTRIBUTION`, `NOMINATIM_URL` no Render.
- Backups: o Supabase faz backups diários automáticos; ver também `docs/BACKUP_E_RESTAURACAO.md`.
