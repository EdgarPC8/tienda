/** Conversión de cantidades de inventario a gramos (base interna para insumos por peso). */

/** Fallbacks si la unidad no trae factor en BD. Quintal EC ≈ 100 lb = 45,36 kg. */
const GRAM_FACTORS = {
  gr: 1,
  g: 1,
  kg: 1000,
  lb: 453.592,
  libra: 453.592,
  q: 45_360,
  qq: 45_360,
  quintal: 45_360,
  arroba: 11_339.8,
  arb: 11_339.8,
  "@": 11_339.8,
  l: 1000,
  ml: 1,
};

const WEIGHT_ABBREVS = new Set(["gr", "g", "kg", "lb", "libra"]);

export function isWeightUnit(unit) {
  const abbr = String(unit?.abbreviation || unit?.name || "")
    .trim()
    .toLowerCase();
  return WEIGHT_ABBREVS.has(abbr);
}

/**
 * Prioriza el factor de la BD (configurable); si no hay, usa tabla conocida.
 */
export function resolveGramFactor(unit) {
  if (!unit) return 1;
  const factor = Number(unit.factor);
  if (Number.isFinite(factor) && factor > 0) return factor;
  const abbr = String(unit.abbreviation || unit.name || "")
    .trim()
    .toLowerCase();
  if (GRAM_FACTORS[abbr] != null) return GRAM_FACTORS[abbr];
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

/** Cantidad del destino al abrir 1 presentación (según factores de unidad). */
export function suggestUnitsPerPack(presentationUnit, targetUnit) {
  const from = resolveGramFactor(presentationUnit);
  const to = resolveGramFactor(targetUnit);
  if (!(from > 0) || !(to > 0)) return null;
  return Number((from / to).toFixed(4));
}

export function round2(n) {
  return Number(Number(n ?? 0).toFixed(2));
}
