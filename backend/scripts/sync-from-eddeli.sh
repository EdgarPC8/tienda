#!/usr/bin/env bash
# Copia código compartible de eddeli/backend → store/backend
# (mantiene identidad Store: puerto, BD, API, seed, app settings Raptor).
set -euo pipefail
DST="$(cd "$(dirname "$0")/.." && pwd)"   # .../store/backend
ROOT="$(cd "$DST/../.." && pwd)"          # .../AppsWeb
SRC="$ROOT/eddeli/backend"

if [[ ! -d "$SRC/src" || ! -d "$DST/src" ]]; then
  echo "No encuentro eddeli/backend o store/backend"
  echo "  ROOT=$ROOT"
  echo "  SRC=$SRC"
  echo "  DST=$DST"
  exit 1
fi

rsync -a \
  --exclude 'img/' \
  --exclude 'files/' \
  --exclude 'node_modules/' \
  --exclude '.env' \
  --exclude '.env.example' \
  --exclude 'package.json' \
  --exclude 'package-lock.json' \
  --exclude 'index.js' \
  --exclude 'src/config/serverEnv.js' \
  --exclude 'src/database/connection.js' \
  --exclude 'src/database/backup.json' \
  --exclude 'src/database/seed.js' \
  --exclude 'src/models/AppSettings.js' \
  --exclude 'src/services/appSettingsService.js' \
  --exclude 'scripts/reset-database.js' \
  --exclude 'scripts/sync-from-eddeli.sh' \
  --exclude 'src/backups/' \
  "$SRC/" "$DST/"

# Tienda/Store usan bcryptjs (ya en package.json). Eddeli usa bcrypt nativo.
# Tras el sync, unificar imports para no romper el arranque.
find "$DST/src" "$DST/scripts" -type f \( -name '*.js' -o -name '*.mjs' \) \
  -exec grep -l "from [\"']bcrypt[\"']" {} \; 2>/dev/null | while read -r f; do
  sed -i 's/from "bcrypt"/from "bcryptjs"/g; s/from '\''bcrypt'\''/from '\''bcryptjs'\''/g' "$f"
done

if [[ -f "$DST/src/routes/SubscriptionRoutes.js" ]]; then
  sed -i 's/frontend EdDeli/frontend Tienda/g; s/frontend Store/frontend Tienda/g' \
    "$DST/src/routes/SubscriptionRoutes.js" 2>/dev/null || true
fi
if [[ -f "$DST/src/controllers/SubscriptionController.js" ]]; then
  sed -i 's/frontend EdDeli/frontend Tienda/g; s/frontend Store/frontend Tienda/g' \
    "$DST/src/controllers/SubscriptionController.js" 2>/dev/null || true
fi

# Tienda: un solo local — al restaurar backups, forzar multiStock desactivado.
INSERT_DATA="$DST/src/database/insertData.js"
if [[ -f "$INSERT_DATA" ]]; then
  python3 - "$INSERT_DATA" <<'PY'
import re, sys
from pathlib import Path
p = Path(sys.argv[1])
text = p.read_text(encoding="utf-8")
old = """      if (next.multiStockEnabled === undefined || next.multiStockEnabled === null) {
        next.multiStockEnabled = true;
      }"""
new = """      // Tienda/Store: un solo local (aunque el backup venga de Eddeli con multistock).
      next.multiStockEnabled = false;"""
if old in text:
    p.write_text(text.replace(old, new), encoding="utf-8")
elif "next.multiStockEnabled = false;" not in text:
    # Fallback: cualquier asignación true → false en AppSettings normalize
    text2 = re.sub(
        r"next\.multiStockEnabled\s*=\s*true;",
        "next.multiStockEnabled = false;",
        text,
    )
    if text2 != text:
        p.write_text(text2, encoding="utf-8")
PY
fi

echo "✅ Sync eddeli → tienda (identidad tienda + bcryptjs + multiStock OFF)."
