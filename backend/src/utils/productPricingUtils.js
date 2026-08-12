/** Normaliza tramos de paquete: [{ qty, totalPrice }, ...] */
import { repairJsonFieldValue } from "./jsonFieldUtils.js";

export function normalizePackageTiersStrict(input) {
  if (input == null || input === "" || input === "[]") return null;

  const val = repairJsonFieldValue(input, { emptyArrayToNull: false });
  if (!Array.isArray(val)) {
    throw new Error("packageTiers debe ser un array de { qty, totalPrice }.");
  }

  const tiers = val
    .map((t) => {
      if (!t || typeof t !== "object") return null;
      const qty = Number(t.qty);
      const totalPrice = Number(t.totalPrice ?? t.total);
      if (!Number.isFinite(qty) || qty <= 0) return null;
      if (!Number.isFinite(totalPrice) || totalPrice < 0) return null;
      return { qty, totalPrice: Number(totalPrice.toFixed(2)) };
    })
    .filter(Boolean)
    .sort((a, b) => a.qty - b.qty);

  const seen = new Set();
  for (const t of tiers) {
    if (seen.has(t.qty)) {
      throw new Error(`packageTiers: cantidad duplicada (${t.qty}).`);
    }
    seen.add(t.qty);
  }

  if (!tiers.length) return null;
  return tiers;
}
