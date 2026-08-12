/** Precisión de dinero: BD hasta 6 decimales; pantalla según config. */

export const MONEY_STORAGE_DECIMALS = 6;
export const MONEY_INPUT_MAX_DECIMALS = 5;

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * @param {number|string} value
 * @param {number} decimals
 * @param {'up'|'down'|'nearest'} mode
 */
export function roundMoney(value, decimals = 2, mode = "up") {
  const n = toNum(value);
  const d = Math.max(0, Math.min(6, Number(decimals) || 0));
  const f = 10 ** d;
  const m = String(mode || "up").toLowerCase();
  if (m === "down") {
    return Math.floor(n * f + Number.EPSILON) / f;
  }
  if (m === "nearest") {
    return Math.round(n * f + Number.EPSILON) / f;
  }
  // up (hacia arriba / techo) — default
  return Math.ceil(n * f - Number.EPSILON) / f;
}

/** Guarda en BD con hasta 6 decimales (sin “hacia arriba” de pantalla). */
export function toStorageMoney(value) {
  return roundMoney(value, MONEY_STORAGE_DECIMALS, "nearest");
}

export function normalizeMoneyDisplayDecimals(raw, fallback = 2) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(6, Math.trunc(n)));
}

export function normalizeMoneyRoundingMode(raw, fallback = "up") {
  const s = String(raw || "").trim().toLowerCase();
  if (s === "up" || s === "down" || s === "nearest") return s;
  return fallback;
}
