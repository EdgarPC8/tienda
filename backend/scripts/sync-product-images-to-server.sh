#!/usr/bin/env bash
# Sube imágenes de productos (local → servidor por SSH / WireGuard)
# y sincroniza primaryImageUrl en la BD remota.
#
# Prerrequisito: VPN/WireGuard al servidor ya conectada desde tu PC.
#
# Uso (desde AppsWeb/eddeli/backend):
#   bash scripts/sync-product-images-to-server.sh
#   bash scripts/sync-product-images-to-server.sh --dry-run
#   bash scripts/sync-product-images-to-server.sh --images-only
#   bash scripts/sync-product-images-to-server.sh --db-only
#
# Variables opcionales:
#   SSH_TARGET=user@100.94.237.31
#   REMOTE_BACKEND=/var/www/html/eddeli/backend
#   APP=eddeli|store|tienda
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
APPS_WEB="$(cd "$BACKEND_ROOT/../.." && pwd)"

DRY_RUN=0
IMAGES_ONLY=0
DB_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --images-only) IMAGES_ONLY=1 ;;
    --db-only) DB_ONLY=1 ;;
    -h|--help)
      sed -n '1,25p' "$0"
      exit 0
      ;;
  esac
done

APP="${APP:-eddeli}"
SSH_TARGET="${SSH_TARGET:-user@100.94.237.31}"

case "$APP" in
  eddeli)
    LOCAL_BACKEND="${LOCAL_BACKEND:-$APPS_WEB/eddeli/backend}"
    REMOTE_BACKEND="${REMOTE_BACKEND:-/var/www/html/eddeli/backend}"
    ;;
  store)
    LOCAL_BACKEND="${LOCAL_BACKEND:-$APPS_WEB/store/backend}"
    REMOTE_BACKEND="${REMOTE_BACKEND:-/var/www/html/store/backend}"
    ;;
  tienda)
    LOCAL_BACKEND="${LOCAL_BACKEND:-$APPS_WEB/tienda/backend}"
    REMOTE_BACKEND="${REMOTE_BACKEND:-/var/www/html/tienda/backend}"
    ;;
  *)
    echo "APP inválida: $APP (eddeli|store|tienda)"
    exit 1
    ;;
esac

LOCAL_IMG="$LOCAL_BACKEND/src/img"
LOCAL_PRODUCTS="$LOCAL_IMG/sistema/products"
REMOTE_IMG="$REMOTE_BACKEND/src/img"
REMOTE_PRODUCTS="$REMOTE_IMG/sistema/products"
REMOTE_TMP="${REMOTE_TMP:-/tmp/${APP}-products-img-upload}"
SQL_LOCAL="${SQL_LOCAL:-/tmp/${APP}-primaryImageUrl-sync.sql}"

c_bold=$'\033[1m'
c_dim=$'\033[2m'
c_green=$'\033[32m'
c_yellow=$'\033[33m'
c_cyan=$'\033[36m'
c_red=$'\033[31m'
c_reset=$'\033[0m'

echo
echo "${c_bold}${c_cyan}═══ Sync imágenes productos → servidor ═══${c_reset}"
echo "  App:            $APP"
echo "  SSH:            $SSH_TARGET"
echo "  Local products: $LOCAL_PRODUCTS"
echo "  Remote products:$REMOTE_PRODUCTS"
echo "  Modo:           $([ "$DRY_RUN" = 1 ] && echo dry-run || echo real)"
echo

if [[ ! -d "$LOCAL_PRODUCTS" ]]; then
  echo "${c_red}No existe:$c_reset $LOCAL_PRODUCTS"
  echo "Primero bajá imágenes con Go-UPC en local."
  exit 1
fi

N_FILES="$(find "$LOCAL_PRODUCTS" -type f | wc -l | tr -d ' ')"
SIZE="$(du -sh "$LOCAL_PRODUCTS" | awk '{print $1}')"
echo "  Archivos locales: ${c_bold}$N_FILES${c_reset} ($SIZE)"
echo

# --- 1) Imágenes ---
if [[ "$DB_ONLY" != 1 ]]; then
  echo "${c_yellow}>>> 1) Subir archivos (rsync por SSH)…${c_reset}"
  if [[ "$DRY_RUN" = 1 ]]; then
    echo "  ${c_dim}[dry-run] rsync $LOCAL_PRODUCTS/ → $SSH_TARGET:$REMOTE_TMP/${c_reset}"
    rsync -avzn --progress "$LOCAL_PRODUCTS/" "$SSH_TARGET:$REMOTE_TMP/" | tail -20
  else
    ssh "$SSH_TARGET" "rm -rf '$REMOTE_TMP' && mkdir -p '$REMOTE_TMP'"
    rsync -avz --progress "$LOCAL_PRODUCTS/" "$SSH_TARGET:$REMOTE_TMP/"
    echo
    echo "  ${c_yellow}>>> moviendo a destino (sudo en servidor)…${c_reset}"
    ssh -t "$SSH_TARGET" "sudo bash -lc '
      set -e
      mkdir -p \"$REMOTE_PRODUCTS\"
      rsync -a \"$REMOTE_TMP\"/ \"$REMOTE_PRODUCTS\"/
      chown -R www-data:www-data \"$REMOTE_IMG/sistema\" 2>/dev/null || true
      echo \"Archivos remotos products: \$(find \"$REMOTE_PRODUCTS\" -type f | wc -l)\"
    '"
  fi
  echo "${c_green}Imágenes OK${c_reset}"
  echo
fi

# --- 2) primaryImageUrl en BD remota ---
if [[ "$IMAGES_ONLY" != 1 ]]; then
  echo "${c_yellow}>>> 2) Sincronizar primaryImageUrl (BD local → SQL → BD remota)…${c_reset}"

  # Cargar .env local
  if [[ -f "$LOCAL_BACKEND/.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^(DB_NAME|DB_USER|DB_PASS|DB_HOST|DB_PORT)=' "$LOCAL_BACKEND/.env" | sed 's/\r$//')
    set +a
  fi
  DB_NAME="${DB_NAME:-softed}"
  DB_USER="${DB_USER:-root}"
  DB_PASS="${DB_PASS:-}"
  DB_HOST="${DB_HOST:-127.0.0.1}"
  DB_PORT="${DB_PORT:-3306}"

  MYSQL_LOCAL=(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER")
  if [[ -n "$DB_PASS" ]]; then
    MYSQL_LOCAL+=(-p"$DB_PASS")
  fi
  MYSQL_LOCAL+=("$DB_NAME")

  "${MYSQL_LOCAL[@]}" -N -e "
    SELECT CONCAT(
      'UPDATE \\\`ERP_inventory_products\\\` SET \\\`primaryImageUrl\\\`=',
      QUOTE(primaryImageUrl),
      ' WHERE \\\`id\\\`=', id, ';'
    )
    FROM ERP_inventory_products
    WHERE primaryImageUrl IS NOT NULL
      AND TRIM(primaryImageUrl) <> ''
      AND primaryImageUrl LIKE 'sistema/products/%'
    ORDER BY id;
  " > "$SQL_LOCAL"

  N_SQL="$(grep -c '^UPDATE' "$SQL_LOCAL" || true)"
  echo "  UPDATEs generados: ${c_bold}$N_SQL${c_reset}"
  echo "  SQL: $SQL_LOCAL"

  if [[ "$N_SQL" -eq 0 ]]; then
    echo "  ${c_dim}Nada que actualizar en BD (no hay primaryImageUrl de products).${c_reset}"
  elif [[ "$DRY_RUN" = 1 ]]; then
    echo "  ${c_dim}[dry-run] primeras líneas:${c_reset}"
    head -5 "$SQL_LOCAL"
    echo "  ${c_dim}…${c_reset}"
  else
    scp "$SQL_LOCAL" "$SSH_TARGET:/tmp/${APP}-primaryImageUrl-sync.sql"
    ssh -t "$SSH_TARGET" "sudo bash -lc '
      set -e
      ENV_FILE=\"$REMOTE_BACKEND/.env\"
      if [[ ! -f \"\$ENV_FILE\" ]]; then
        echo \"No existe \$ENV_FILE\"
        exit 1
      fi
      DB_NAME=\$(grep -E \"^DB_NAME=\" \"\$ENV_FILE\" | head -1 | cut -d= -f2- | tr -d \"\\r\\\"\\047\")
      DB_USER=\$(grep -E \"^DB_USER=\" \"\$ENV_FILE\" | head -1 | cut -d= -f2- | tr -d \"\\r\\\"\\047\")
      DB_PASS=\$(grep -E \"^DB_PASS=\" \"\$ENV_FILE\" | head -1 | cut -d= -f2- | tr -d \"\\r\\\"\\047\")
      DB_HOST=\$(grep -E \"^DB_HOST=\" \"\$ENV_FILE\" | head -1 | cut -d= -f2- | tr -d \"\\r\\\"\\047\")
      DB_PORT=\$(grep -E \"^DB_PORT=\" \"\$ENV_FILE\" | head -1 | cut -d= -f2- | tr -d \"\\r\\\"\\047\")
      DB_HOST=\${DB_HOST:-127.0.0.1}
      DB_PORT=\${DB_PORT:-3306}
      echo \"BD remota: \$DB_USER@\$DB_HOST:\$DB_PORT / \$DB_NAME\"
      if [[ -n \"\$DB_PASS\" ]]; then
        mysql -h \"\$DB_HOST\" -P \"\$DB_PORT\" -u \"\$DB_USER\" -p\"\$DB_PASS\" \"\$DB_NAME\" < /tmp/${APP}-primaryImageUrl-sync.sql
      else
        mysql -h \"\$DB_HOST\" -P \"\$DB_PORT\" -u \"\$DB_USER\" \"\$DB_NAME\" < /tmp/${APP}-primaryImageUrl-sync.sql
      fi
      echo \"SQL aplicado: $N_SQL UPDATEs\"
    '"
  fi
  echo "${c_green}BD OK${c_reset}"
  echo
fi

echo "${c_bold}${c_green}Listo.${c_reset} Conectá WireGuard antes si hace falta, y revisá un producto en el server."
echo "  Tip full img tree: bash \"$APPS_WEB/../_export/sync-app-img.sh\" $APP"
echo
