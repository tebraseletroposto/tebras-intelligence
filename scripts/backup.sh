#!/usr/bin/env bash
# Backup lógico do banco (formato custom do pg_dump, comprimido).
# Uso: DATABASE_URL=... scripts/backup.sh [diretorio_destino]
set -euo pipefail
DEST="${1:-./backups}"
: "${DATABASE_URL:?Defina DATABASE_URL}"
mkdir -p "$DEST"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DEST/tebras_intelligence_${STAMP}.dump"
pg_dump --format=custom --no-owner --no-privileges --dbname="$DATABASE_URL" --file="$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo "Backup gerado: $FILE ($(du -h "$FILE" | cut -f1))"
