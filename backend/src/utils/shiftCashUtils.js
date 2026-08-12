/** Denominaciones USD (Ecuador) para arqueo de cierre de caja. */

export const CASH_DENOMINATIONS = [
  { key: "c_001", label: "1 ctvo", value: 0.01 },
  { key: "c_005", label: "5 ctvo", value: 0.05 },
  { key: "c_010", label: "10 ctvo", value: 0.1 },
  { key: "c_025", label: "25 ctvo", value: 0.25 },
  { key: "c_050", label: "50 ctvo", value: 0.5 },
  { key: "c_100", label: "$1.00", value: 1 },
  { key: "b_001", label: "$1", value: 1 },
  { key: "b_005", label: "$5", value: 5 },
  { key: "b_010", label: "$10", value: 10 },
  { key: "b_020", label: "$20", value: 20 },
  { key: "b_050", label: "$50", value: 50 },
  { key: "b_100", label: "$100", value: 100 },
];

export const CASH_COINS = CASH_DENOMINATIONS.filter((d) => d.key.startsWith("c_"));
export const CASH_BILLS = CASH_DENOMINATIONS.filter((d) => d.key.startsWith("b_"));

const VALID_KEYS = new Set(CASH_DENOMINATIONS.map((d) => d.key));

export function emptyCashCounts() {
  return Object.fromEntries(CASH_DENOMINATIONS.map((d) => [d.key, ""]));
}

export function parseQty(raw) {
  const n = Number(String(raw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function normalizeCashCounts(input) {
  const src = input && typeof input === "object" ? input : {};
  const out = {};
  for (const d of CASH_DENOMINATIONS) {
    out[d.key] = parseQty(src[d.key]);
  }
  return out;
}

export function computeCashTotal(counts) {
  let total = 0;
  for (const d of CASH_DENOMINATIONS) {
    total += parseQty(counts?.[d.key]) * d.value;
  }
  return Number(total.toFixed(2));
}

export function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

export function isValidCountsPayload(input) {
  if (!input || typeof input !== "object") return false;
  return Object.keys(input).every((k) => VALID_KEYS.has(k));
}

/** Acepta arqueo por denominación (Admin/Programador) o solo total (empleados). */
export function resolveCashFromBody(body = {}) {
  const { cashCounts, cashTotal } = body;
  if (cashCounts && typeof cashCounts === "object") {
    const counts = normalizeCashCounts(cashCounts);
    const total = computeCashTotal(counts);
    if (total > 0) return { counts, total };
  }
  const total = Number(Number(cashTotal || 0).toFixed(2));
  if (total > 0) {
    return { counts: normalizeCashCounts(emptyCashCounts()), total };
  }
  return null;
}
