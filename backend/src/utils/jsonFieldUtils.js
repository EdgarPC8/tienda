/** Desenvuelve strings JSON anidados (p. ej. doble codificación tras restore). */
export function unwrapJsonString(value, maxDepth = 40) {
  let v = value;
  for (let i = 0; i < maxDepth; i += 1) {
    if (typeof v !== "string") break;
    const s = v.trim();
    if (!s) break;
    const looksJson =
      (s.startsWith("{") && s.endsWith("}")) ||
      (s.startsWith("[") && s.endsWith("]")) ||
      (s.startsWith('"') && s.endsWith('"'));
    if (!looksJson) break;
    try {
      const next = JSON.parse(s);
      if (next === v) break;
      v = next;
    } catch {
      break;
    }
  }
  return v;
}

/**
 * Valor listo para columna JSON en BD o para backup.json (objeto/array, no string escapado).
 */
export function repairJsonFieldValue(value, { emptyArrayToNull = true } = {}) {
  const v = unwrapJsonString(value);
  if (v === null || v === undefined || v === "") return null;
  if (emptyArrayToNull && Array.isArray(v) && v.length === 0) return null;
  return v;
}

export function deserializeJsonFields(rows, config = {}) {
  if (!Array.isArray(rows)) return rows;
  const fields = config.jsonStringFields || [];
  const emptyArrayToNull = config.emptyArrayToNull !== false;
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const next = { ...row };
    for (const field of fields) {
      if (field in next) {
        next[field] = repairJsonFieldValue(next[field], { emptyArrayToNull });
      }
    }
    return next;
  });
}
