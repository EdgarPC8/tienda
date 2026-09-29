/**
 * Contenido de apertura de empaque (paca surtida o 1 destino).
 * packContents: [{ productId, qty }, ...]
 * Compat: genericProductId + unitsPerPack = una sola línea.
 */

export function normalizePackContents(input) {
  let raw = input;
  if (raw == null || raw === "") return [];
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];

  const byId = new Map();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const productId = Number(row.productId ?? row.targetProductId ?? row.id);
    const qty = Number(row.qty ?? row.quantity ?? row.unitsPerPack);
    if (!Number.isFinite(productId) || productId <= 0) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const prev = byId.get(productId) || 0;
    byId.set(productId, prev + qty);
  }

  return [...byId.entries()]
    .map(([productId, qty]) => ({ productId, qty }))
    .sort((a, b) => a.productId - b.productId);
}

/** Resuelve líneas efectivas: packContents o legado 1 destino. */
export function resolvePackOpenLines(presentation) {
  if (!presentation) return [];
  const fromJson = normalizePackContents(presentation.packContents);
  if (fromJson.length) return fromJson;

  const targetId = Number(presentation.genericProductId);
  const units = Number(presentation.unitsPerPack);
  if (Number.isFinite(targetId) && targetId > 0 && Number.isFinite(units) && units > 0) {
    return [{ productId: targetId, qty: units }];
  }
  return [];
}

export function presentationContainsProduct(presentation, productId) {
  const pid = Number(productId);
  return resolvePackOpenLines(presentation).some((l) => Number(l.productId) === pid);
}

export function unitsOfProductInPack(presentation, productId) {
  const pid = Number(productId);
  const line = resolvePackOpenLines(presentation).find((l) => Number(l.productId) === pid);
  return line ? Number(line.qty) : 0;
}

/** Sync columnas legadas desde packContents (primera línea). */
export function legacyFieldsFromPackContents(lines) {
  const normalized = normalizePackContents(lines);
  if (!normalized.length) {
    return { genericProductId: null, unitsPerPack: null, packContents: null };
  }
  return {
    packContents: normalized,
    genericProductId: normalized[0].productId,
    unitsPerPack: normalized[0].qty,
  };
}
