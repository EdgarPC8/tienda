import { Op } from "sequelize";
import { sequelize } from "../database/connection.js";
import { InventoryProduct, Store } from "../models/Inventory.js";
import { StoreStock } from "../models/StoreStock.js";
import { getAppSettingsSync, isMultiStockEnabled } from "./appSettingsService.js";

const BODEGA_NAME = "Bodega";

export function numStock(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normaliza tipo de local (incluye bodega). */
export function normalizeStoreKind(kind) {
  const k = String(kind || "").trim().toLowerCase();
  if (k === "propia" || k === "bodega" || k === "vitrina") return k;
  return "vitrina";
}

export function storeHoldsInventory(kind) {
  const k = normalizeStoreKind(kind);
  return k === "propia" || k === "bodega";
}

/**
 * Asegura ENUM locationKind con 'bodega' (MySQL/MariaDB).
 */
export async function ensureStoreLocationKindEnum() {
  try {
    await sequelize.query(
      "ALTER TABLE `ERP_stores` MODIFY COLUMN `locationKind` ENUM('propia','vitrina','bodega') NOT NULL DEFAULT 'vitrina'",
    );
  } catch (err) {
    // SQLite u otro motor: se ignora; Sequelize sync alter puede bastar
    console.warn("[storeStock] ensureStoreLocationKindEnum:", err.message);
  }
}

/** Columna isVisible en ERP_stores (vitrina pública vs operativo). */
export async function ensureStoreIsVisibleColumn() {
  try {
    const [cols] = await sequelize.query(`SHOW COLUMNS FROM \`ERP_stores\` LIKE 'isVisible'`);
    if (Array.isArray(cols) && cols.length) return;
    await sequelize.query(
      "ALTER TABLE `ERP_stores` ADD COLUMN `isVisible` TINYINT(1) NOT NULL DEFAULT 1 AFTER `isActive`",
    );
    // Locales inactivos no deben verse en home
    await sequelize.query(
      "UPDATE `ERP_stores` SET `isVisible` = 0 WHERE `isActive` = 0 OR `isActive` IS NULL",
    );
    console.log("[storeStock] Columna isVisible añadida a ERP_stores.");
  } catch (err) {
    console.warn("[storeStock] ensureStoreIsVisibleColumn:", err.message);
  }
}

/** Obtiene o crea el local Bodega (solo multistock). Sin multistock → local de operación. */
export async function ensureBodegaStore({ transaction } = {}) {
  if (!isMultiStockEnabled()) {
    return ensureSingleLocalOwnStore({ transaction });
  }

  let bodega = await Store.findOne({
    where: { locationKind: "bodega" },
    order: [["id", "ASC"]],
    transaction,
  });
  if (bodega) return bodega;

  bodega = await Store.findOne({
    where: { name: { [Op.like]: "Bodega%" } },
    order: [["id", "ASC"]],
    transaction,
  });
  if (bodega) {
    if (bodega.locationKind !== "bodega") {
      await bodega.update({ locationKind: "bodega", isActive: true }, { transaction });
    }
    return bodega;
  }

  return Store.create(
    {
      name: BODEGA_NAME,
      address: "Almacén central",
      description: "Bodega de insumos y productos. El stock migrado inicia aquí.",
      locationKind: "bodega",
      isActive: true,
      position: -100,
      establishmentCode: "000",
      emissionPointCode: "000",
    },
    { transaction },
  );
}

export async function getDefaultStockStoreId({ transaction } = {}) {
  if (!isMultiStockEnabled()) {
    const store = await ensureSingleLocalOwnStore({ transaction });
    return store.id;
  }
  const bodega = await ensureBodegaStore({ transaction });
  return bodega.id;
}

/**
 * Modo un solo local (multiStock desactivado): no exige Bodega.
 * Si el único local quedó como «bodega», lo pasa a «propia» para poder abrir turno/caja.
 */
export async function ensureSingleLocalOwnStore({ transaction } = {}) {
  const propia = await Store.findOne({
    where: { locationKind: "propia", isActive: true },
    order: [["id", "ASC"]],
    transaction,
  });
  if (propia) {
    await Store.update(
      { isActive: false },
      {
        where: { locationKind: "bodega", isActive: true },
        transaction,
      },
    );
    return propia;
  }

  const anyActive = await Store.findOne({
    where: { isActive: true },
    order: [["id", "ASC"]],
    transaction,
  });
  if (anyActive) {
    const patch = {
      locationKind: "propia",
      isActive: true,
      establishmentCode: anyActive.establishmentCode || "001",
      emissionPointCode: anyActive.emissionPointCode || "001",
    };
    // Evitar que el único local se siga mostrando como «Bodega».
    if (/^bodega/i.test(String(anyActive.name || "").trim())) {
      patch.name = "Local principal";
      patch.address = anyActive.address || "";
      patch.description = "Local de operación (modo un solo local).";
    }
    await anyActive.update(patch, { transaction });
    console.log(
      `[storeStock] Modo un local: «${anyActive.name}» (#${anyActive.id}) → sucursal propia.`,
    );
    return anyActive;
  }

  const created = await Store.create(
    {
      name: "Local principal",
      address: "",
      description: "Local de operación (modo un solo local).",
      locationKind: "propia",
      isActive: true,
      position: 0,
      establishmentCode: "001",
      emissionPointCode: "001",
    },
    { transaction },
  );
  console.log(`[storeStock] Modo un local: creado Local principal #${created.id}.`);
  return created;
}

export async function sumProductStoreStock(productId, { transaction } = {}) {
  const total = await StoreStock.sum("quantity", {
    where: { productId },
    transaction,
  });
  return numStock(total);
}

export async function syncProductStockFromStores(productId, { transaction } = {}) {
  const total = await sumProductStoreStock(productId, { transaction });
  await InventoryProduct.update(
    { stock: total },
    { where: { id: productId }, transaction },
  );
  return total;
}

async function getOrCreateRow(storeId, productId, { transaction } = {}) {
  const [row] = await StoreStock.findOrCreate({
    where: { storeId, productId },
    defaults: { storeId, productId, quantity: 0, exhibidorId: null },
    transaction,
  });
  return row;
}

export async function getStoreStockQty(storeId, productId, { transaction } = {}) {
  if (!storeId || !productId) return 0;
  const row = await StoreStock.findOne({
    where: { storeId, productId },
    transaction,
  });
  return numStock(row?.quantity);
}

/**
 * Ajusta stock del local y sincroniza suma en el producto.
 * @param {{ allowNegative?: boolean }} opts
 */
export async function adjustStoreStock(
  storeId,
  productId,
  delta,
  { transaction, allowNegative = false } = {},
) {
  if (!storeId) throw new Error("storeId es obligatorio para ajustar stock.");
  if (!productId) throw new Error("productId es obligatorio.");
  const d = numStock(delta);
  if (d === 0) {
    return {
      storeId,
      productId,
      quantity: await getStoreStockQty(storeId, productId, { transaction }),
      productStock: await sumProductStoreStock(productId, { transaction }),
    };
  }

  const run = async (t) => {
    const row = await getOrCreateRow(storeId, productId, { transaction: t });
    const before = numStock(row.quantity);
    const after = before + d;
    if (!allowNegative && after < -1e-9) {
      const product = await InventoryProduct.findByPk(productId, {
        attributes: ["id", "name"],
        transaction: t,
      });
      throw new Error(
        `Stock insuficiente en este local para ${product?.name || `#${productId}`}. Disponible: ${before}`,
      );
    }
    row.quantity = after;
    await row.save({ transaction: t });
    const productStock = await syncProductStockFromStores(productId, { transaction: t });
    return { storeId, productId, quantity: after, productStock, before };
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/** Define cantidad absoluta en un local y sincroniza el total del producto. */
export async function setStoreStockAbsolute(
  storeId,
  productId,
  quantity,
  { transaction, allowNegative = false } = {},
) {
  const target = numStock(quantity);
  if (!allowNegative && target < 0) {
    throw new Error("La cantidad de stock no puede ser negativa.");
  }
  const run = async (t) => {
    const row = await getOrCreateRow(storeId, productId, { transaction: t });
    row.quantity = target;
    await row.save({ transaction: t });
    const productStock = await syncProductStockFromStores(productId, { transaction: t });
    return { storeId, productId, quantity: target, productStock };
  };
  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/**
 * Stock desde ficha de producto (alta/edición).
 * - Sin multistock: concentra la cantidad en el local de operación (el de caja)
 *   y deja en 0 cualquier otra fila, para que Caja no siga viendo 0.
 * - Con multistock: la cantidad inicial/editada va a Bodega.
 */
export async function setProductCatalogStock(
  productId,
  quantity,
  { transaction, allowNegative = false } = {},
) {
  const target = numStock(quantity);
  if (!allowNegative && target < 0) {
    throw new Error("La cantidad de stock no puede ser negativa.");
  }
  const multi = isMultiStockEnabled();
  const run = async (t) => {
    const storeId = await getDefaultStockStoreId({ transaction: t });
    await setStoreStockAbsolute(storeId, productId, target, {
      transaction: t,
      allowNegative,
    });
    if (!multi) {
      await StoreStock.update(
        { quantity: 0 },
        {
          where: { productId, storeId: { [Op.ne]: storeId } },
          transaction: t,
        },
      );
      await syncProductStockFromStores(productId, { transaction: t });
    }
    return {
      storeId,
      productId,
      quantity: target,
      productStock: await sumProductStoreStock(productId, { transaction: t }),
    };
  };
  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/**
 * Migración inicial: si no hay filas de stock por local,
 * mueve product.stock actual a Bodega y deja el total sincronizado.
 */
export async function migrateGlobalStockToBodega() {
  if (!isMultiStockEnabled()) {
    console.log("[storeStock] Multistock OFF: no se migra stock a Bodega.");
    return { migrated: false, skipped: "single_local" };
  }
  const existing = await StoreStock.count();
  if (existing > 0) {
    console.log(`[storeStock] Ya hay ${existing} filas en ERP_store_stocks; no se remigra.`);
    return { migrated: false, rows: existing };
  }

  const bodega = await ensureBodegaStore();
  const products = await InventoryProduct.findAll({
    attributes: ["id", "name", "stock"],
  });

  let created = 0;
  await sequelize.transaction(async (t) => {
    for (const p of products) {
      const qty = numStock(p.stock);
      if (Math.abs(qty) < 1e-9) continue;
      await StoreStock.create(
        {
          storeId: bodega.id,
          productId: p.id,
          quantity: qty,
          exhibidorId: null,
        },
        { transaction: t },
      );
      created += 1;
      // Mantener product.stock = misma cantidad (única fila = bodega)
      await p.update({ stock: qty }, { transaction: t });
    }
  });

  console.log(
    `[storeStock] Migración OK: ${created} productos → Bodega #${bodega.id} (${bodega.name}).`,
  );
  return { migrated: true, rows: created, bodegaId: bodega.id };
}

/** Lista stock por local de un producto. */
export async function listProductStoreStocks(productId) {
  const rows = await StoreStock.findAll({
    where: { productId },
    include: [
      {
        model: Store,
        as: "store",
        attributes: ["id", "name", "locationKind", "isActive"],
      },
    ],
    order: [["storeId", "ASC"]],
  });
  return rows.map((r) => ({
    storeId: r.storeId,
    productId: r.productId,
    quantity: numStock(r.quantity),
    store: r.store
      ? {
          id: r.store.id,
          name: r.store.name,
          locationKind: r.store.locationKind,
          isActive: r.store.isActive,
        }
      : null,
  }));
}

/** Traslado entre locales que llevan inventario (bodega/propia). */
export async function transferStoreStock({
  fromStoreId,
  toStoreId,
  productId,
  quantity,
  transaction,
} = {}) {
  const qty = numStock(quantity);
  if (!fromStoreId || !toStoreId) throw new Error("Origen y destino son obligatorios.");
  if (Number(fromStoreId) === Number(toStoreId)) {
    throw new Error("Origen y destino deben ser distintos.");
  }
  if (!(qty > 0)) throw new Error("La cantidad a trasladar debe ser mayor a 0.");

  const run = async (t) => {
    const [fromStore, toStore] = await Promise.all([
      Store.findByPk(fromStoreId, { transaction: t }),
      Store.findByPk(toStoreId, { transaction: t }),
    ]);
    if (!fromStore || !storeHoldsInventory(fromStore.locationKind)) {
      throw new Error("El local de origen no admite stock inventariable.");
    }
    if (!toStore || !storeHoldsInventory(toStore.locationKind)) {
      throw new Error("El local de destino no admite stock inventariable.");
    }
    await adjustStoreStock(fromStoreId, productId, -qty, {
      transaction: t,
      allowNegative: false,
    });
    await adjustStoreStock(toStoreId, productId, qty, {
      transaction: t,
      allowNegative: false,
    });
    return {
      fromStoreId: Number(fromStoreId),
      toStoreId: Number(toStoreId),
      productId: Number(productId),
      quantity: qty,
      productStock: await sumProductStoreStock(productId, { transaction: t }),
    };
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/**
 * Traspaso de varios productos en una sola transacción (misma origen/destino).
 * items: [{ productId, quantity }]
 */
export async function transferStoreStockBatch({
  fromStoreId,
  toStoreId,
  items = [],
  transaction,
} = {}) {
  if (!fromStoreId || !toStoreId) throw new Error("Origen y destino son obligatorios.");
  if (Number(fromStoreId) === Number(toStoreId)) {
    throw new Error("Origen y destino deben ser distintos.");
  }
  const list = Array.isArray(items) ? items : [];
  if (!list.length) throw new Error("La lista de traspaso está vacía.");

  const merged = new Map();
  for (const raw of list) {
    const productId = Number(raw?.productId);
    const quantity = numStock(raw?.quantity);
    if (!Number.isFinite(productId) || productId <= 0) {
      throw new Error("Hay un producto inválido en la lista.");
    }
    if (!(quantity > 0)) {
      throw new Error(`Cantidad inválida para el producto #${productId}.`);
    }
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }

  const run = async (t) => {
    const results = [];
    for (const [productId, quantity] of merged.entries()) {
      results.push(
        await transferStoreStock({
          fromStoreId,
          toStoreId,
          productId,
          quantity,
          transaction: t,
        }),
      );
    }
    return {
      fromStoreId: Number(fromStoreId),
      toStoreId: Number(toStoreId),
      count: results.length,
      items: results,
    };
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/** Mapa productId → qty para un local (útil en POS). */
export async function mapStoreStockByProduct(storeId) {
  const rows = await StoreStock.findAll({
    where: { storeId, quantity: { [Op.ne]: 0 } },
    attributes: ["productId", "quantity"],
  });
  const map = {};
  for (const r of rows) map[r.productId] = numStock(r.quantity);
  return map;
}
