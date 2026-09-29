/**
 * Materia prima (type=raw / isRaw) = insumo genérico de recetas / destino de empaques.
 * Final e intermedio (sin isRaw) nunca son genéricos.
 * Almacenamiento del genérico:
 * - peso: gramos (gr/g)
 * - volumen: mililitros (ml) o litros (l)
 * En receta/UI se puede escribir kg, lb o L y convertir.
 */
export function syncProductIngredientFlags(payload, existing = null) {
  const type = payload.type != null ? String(payload.type) : existing?.type;
  const isRaw =
    payload.isRaw != null
      ? Boolean(payload.isRaw)
      : existing?.isRaw != null
        ? Boolean(existing.isRaw)
        : type === "raw" || type === "intermediate";

  if (type == null && payload.isRaw == null && existing?.isRaw == null) return;

  const linkedRaw =
    "genericProductId" in payload ? payload.genericProductId : existing?.genericProductId;
  const isLinked =
    linkedRaw != null && linkedRaw !== "" && Number.isFinite(Number(linkedRaw)) && Number(linkedRaw) > 0;

  if (isRaw && !isLinked) {
    payload.isGenericIngredient = true;
    payload.genericProductId = null;
  } else if (!isRaw) {
    payload.isGenericIngredient = false;
  }
}

/** Unidades válidas de almacenamiento del genérico. */
export const GENERIC_STORAGE_ABBREVS = ["gr", "g", "ml", "l", "lt"];

export function isGenericStorageAbbr(abbr) {
  return GENERIC_STORAGE_ABBREVS.includes(String(abbr || "").trim().toLowerCase());
}

/** @deprecated usar isGenericStorageAbbr */
export function isGramUnitAbbr(abbr) {
  const a = String(abbr || "").trim().toLowerCase();
  return a === "gr" || a === "g";
}
