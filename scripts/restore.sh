#!/usr/bin/env bash
# Restaura um backup em um banco de destino. ATENÇÃO: substitui os objetos existentes no destino.
# Uso: TARGET_DATABASE_URL=... scripts/restore.sh arquivo.dump [--yes]
set -euo pipefail
FILE="${1:?Informe o arquivo .dump}"
: "${TARGET_DATABASE_URL:?Defina TARGET_DATABASE_URL (banco de destino)}"
if [[ -f "$FILE.sha256" ]]; then sha256sum --check --quiet "$FILE.sha256"; echo "Checksum OK"; fi
if [[ "${2:-}" != "--yes" ]]; then
  read -r -p "Restaurar $FILE em ${TARGET_DATABASE_URL%%\?*} (dados existentes serão substituídos)? [digite SIM] " ans
  [[ "$ans" == "SIM" ]] || { echo "Cancelado."; exit 1; }
fi
pg_restore --clean --if-exists --no-owner --no-privileges --single-transaction --dbname="$TARGET_DATABASE_URL" "$FILE"
echo "Restauração concluída."
