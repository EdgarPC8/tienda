/** Prefijo estándar de carpetas bajo src/img y src/files. */
export const SYSTEM_MEDIA_PREFIX = "sistema";

const FROM_PREFIX = "EdDeli/";

/** Normaliza rutas legacy EdDeli/ → sistema/ (img, files, tracks). */
export function migrateMediaPath(value) {
  if (typeof value !== "string" || !value) return value;
  let next = value;
  if (next.startsWith("track_EdDeli/")) {
    next = `track_${SYSTEM_MEDIA_PREFIX}/${next.slice("track_EdDeli/".length)}`;
  }
  if (next.startsWith(FROM_PREFIX)) {
    next = `${SYSTEM_MEDIA_PREFIX}/${next.slice(FROM_PREFIX.length)}`;
  }
  return next;
}

export function migrateValueDeep(value) {
  if (typeof value === "string") return migrateMediaPath(value);
  if (Array.isArray(value)) return value.map(migrateValueDeep);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = migrateValueDeep(v);
    return out;
  }
  return value;
}
