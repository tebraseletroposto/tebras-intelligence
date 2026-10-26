#!/usr/bin/env bash
# Teste automatizado de backup + restauração: gera backup do DATABASE_URL, restaura em um
# banco temporário e compara contagens de registros de todas as tabelas.
# Uso: DATABASE_URL=... ADMIN_DATABASE_URL=postgres://...@host/postgres scripts/backup-restore-test.sh
set -euo pipefail
: "${DATABASE_URL:?}"; : "${ADMIN_DATABASE_URL:?Conexão com permissão de CREATE DATABASE}"
TMPDB="tebras_restore_test_$$"
DIR="$(mktemp -d)"
trap 'psql "$ADMIN_DATABASE_URL" -qc "DROP DATABASE IF EXISTS $TMPDB" >/dev/null; rm -rf "$DIR"' EXIT
"$(dirname "$0")/backup.sh" "$DIR"
FILE="$(ls "$DIR"/*.dump)"
psql "$ADMIN_DATABASE_URL" -qc "CREATE DATABASE $TMPDB"
TARGET="${ADMIN_DATABASE_URL%/*}/$TMPDB"
TARGET_DATABASE_URL="$TARGET" "$(dirname "$0")/restore.sh" "$FILE" --yes
Q="select string_agg(t.schemaname||'.'||t.relname || '=' || (xpath('/row/c/text()', query_to_xml('select count(*) as c from '||quote_ident(t.schemaname)||'.'||quote_ident(t.relname), false, true, '')))[1]::text, ',' order by t.schemaname, t.relname) from pg_stat_user_tables t where schemaname in ('public','drizzle')"
A="$(psql "$DATABASE_URL" -tAc "$Q")"; B="$(psql "$TARGET" -tAc "$Q")"
echo "Origem : $A"; echo "Destino: $B"
[[ "$A" == "$B" ]] && echo "OK: backup restaurado com contagens idênticas." || { echo "FALHA: divergência"; exit 1; }
