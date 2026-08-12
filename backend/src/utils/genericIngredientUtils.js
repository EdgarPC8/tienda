/** Conversión de cantidades de inventario a gramos (base interna para insumos por peso). */

const GRAM_FACTORS = {
  gr: 1,
  g: 1,
  kg: 1000,
  lb: 453.592,
  q: 100_000,
  qq: 100_000,
  arroba: 11_339.8,
  l: 1000,
};

export function resolveGramFactor(unit) {
  if (!unit) return 1;
  const abbr = String(unit.abbreviation || unit.name || "")
    .trim()
    .toLowerCase();
  if (GRAM_FACTORS[abbr] != null) return GRAM_FACTORS[abbr];
  const factor = Number(unit.factor);
  if (Number.isFinite(factor) && factor > 0) return factor;
  return 1;
}

export function isCountUnit(unit) {
  const abbr = String(unit?.abbreviation || "").trim().toLowerCase();
  return abbr === "un" || abbr === "und" || abbr === "u";
}

/**
 * Convierte stock de un producto a gramos.
 * Piezas (un): quantity * standardWeightGrams si existe.
 */
export function productStockToGrams(product, unit) {
  const qty = Number(product?.stock ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return 0;

  const u = unit || product?.ERP_inventory_unit || product?.InventoryUnit;
  if (isCountUnit(u)) {
    const sw = Number(product?.standardWeightGrams ?? 0);
    return sw > 0 ? qty * sw : 0;
  }
  return qty * resolveGramFactor(u);
}

export function gramsToDisplayInUnit(grams, unit) {
  const g = Number(grams ?? 0);
  const u = unit;
  if (isCountUnit(u)) {
    return { value: g, label: "g", grams: g };
  }
  const factor = resolveGramFactor(u);
  return {
    value: Number((g / factor).toFixed(4)),
    label: u?.abbreviation || "g",
    grams: g,
  };
}

export function round2(n) {
  return Number(Number(n ?? 0).toFixed(2));
}
