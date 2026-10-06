/**
 * Columnas ocultas de las 5 tablas anchas (comprobantes, ventas, compras, locales, préstamos).
 * Se guarda en app_settings.tableColumnVisibility (BD). Otras tablas usan solo localStorage.
 */
export const DEFAULT_TABLE_COLUMN_VISIBILITY = {
  comprobantesPos: { hidden: [] },
  ventas: { hidden: [] },
  compras: { hidden: [] },
  locales: { hidden: [] },
  prestamos: { hidden: [] },
};

const DB_KEYS = Object.keys(DEFAULT_TABLE_COLUMN_VISIBILITY);

function parseMaybeJson(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

export function normalizeTableColumnVisibility(raw) {
  const parsed = parseMaybeJson(raw) || {};
  const out = {};
  for (const key of DB_KEYS) {
    const entry = parsed[key];
    const hidden = Array.isArray(entry?.hidden)
      ? [...new Set(entry.hidden.map((id) => String(id)).filter(Boolean))]
      : [];
    out[key] = { hidden };
  }
  return out;
}

export function serializeTableColumnVisibility(value) {
  return JSON.stringify(normalizeTableColumnVisibility(value));
}
