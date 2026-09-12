/**
 * Guards para ENTRADA_COMPRA: evita totales/unitarios absurdos
 * (p. ej. modo «unitario × cant.» con precio de paca × unidades sueltas).
 */
import { Op } from "sequelize";

/** Tope duro por línea de compra (USD). */
export const MAX_PURCHASE_LINE_TOTAL = 2500;

/** Multiplicador máx. del unitario implícito vs precio proveedor/catálogo. */
export const MAX_UNIT_VS_REF_RATIO = 40;

/**
 * @param {{ quantity: number, priceTotal: number|null|undefined, product: object, reason: string }} args
 * @returns {string|null} mensaje de error o null si ok
 */
export function validatePurchasePriceTotal({ quantity, priceTotal, product, reason }) {
  if (reason !== "ENTRADA_COMPRA") return null;
  if (priceTotal == null || priceTotal === "") return null;

  const total = Number(priceTotal);
  const qty = Number(quantity);
  if (!Number.isFinite(total) || total < 0) {
    return "El monto de compra no es válido";
  }
  if (!Number.isFinite(qty) || !(qty > 0)) {
    return "La cantidad de compra no es válida";
  }

  if (total > MAX_PURCHASE_LINE_TOTAL) {
    return `El total de compra ($${total.toFixed(2)}) supera el tope de $${MAX_PURCHASE_LINE_TOTAL}. Revisá si usaste «Unitario × cant.» con un precio de paca/cubeta.`;
  }

  const unit = total / qty;
  const ref =
    Number(product?.supplierPrice) > 0
      ? Number(product.supplierPrice)
      : Number(product?.price) > 0
        ? Number(product.price)
        : 0;

  if (ref > 0 && unit > ref * MAX_UNIT_VS_REF_RATIO) {
    return `El costo unitario implícito ($${unit.toFixed(4)}) es ~${Math.round(unit / ref)}× el precio de referencia ($${ref.toFixed(4)}). Revisá cantidad/modo de precio (Total vs Unitario).`;
  }

  return null;
}

/**
 * Si el producto es genérico y ya tiene presentaciones de compra, no permitir ENTRADA_COMPRA directa.
 */
export async function assertNotBuyingGenericWhenPacksExist(
  InventoryProduct,
  product,
  reason,
  transaction,
) {
  if (reason !== "ENTRADA_COMPRA") return null;
  const isGeneric =
    Boolean(product?.isGenericIngredient) && product?.genericProductId == null;
  if (!isGeneric) return null;

  const packCount = await InventoryProduct.count({
    where: {
      genericProductId: product.id,
      unitsPerPack: { [Op.gt]: 0 },
      isActive: true,
    },
    transaction,
  });

  if (packCount > 0) {
    return `«${product.name}» es un insumo genérico de receta. Comprá la presentación (paca/cubeta) y abrila para sumar stock al genérico.`;
  }
  return null;
}
