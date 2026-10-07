import { sequelize } from "../database/connection.js";
import { InventoryProduct } from "../models/Inventory.js";

const norm = (value) => String(value || "").trim();
const normKey = (value) => norm(value).toLowerCase();

export function productRef(product) {
  if (!product) return { barcode: null, sku: null, name: null };
  return {
    barcode: product.barcode || null,
    sku: product.sku || null,
    name: product.name || null,
  };
}

export async function resolveProductByReference(ref, { transaction, cache } = {}) {
  const localCache = cache || new Map();
  const barcode = norm(ref?.barcode);
  const sku = norm(ref?.sku);
  const name = norm(ref?.name);
  const cacheKey = `product:${barcode}|${sku}|${normKey(name)}`;
  if (localCache.has(cacheKey)) return localCache.get(cacheKey);

  let product = null;
  if (barcode) {
    product = await InventoryProduct.findOne({ where: { barcode }, transaction });
  }
  if (!product && sku) {
    product = await InventoryProduct.findOne({ where: { sku }, transaction });
  }
  if (!product && name) {
    product = await InventoryProduct.findOne({
      where: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("name")),
        normKey(name),
      ),
      transaction,
    });
  }

  localCache.set(cacheKey, product);
  return product;
}
