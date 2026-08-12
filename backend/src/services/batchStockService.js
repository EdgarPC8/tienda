/**
 * Stock por lote (FEFO): descontar al vender/salir, cerrar y dividir entre locales.
 */
import { Op } from "sequelize";
import { sequelize } from "../database/connection.js";
import { InventoryBatch, InventoryProduct, Store } from "../models/Inventory.js";
import { getAppSettingsSync } from "./appSettingsService.js";
import {
  storeHoldsInventory,
  transferStoreStock,
} from "./storeStockService.js";

const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

let storeIdColumnReady = false;

/** Asegura columna storeId en lotes (multistock). */
export async function ensureBatchStoreIdColumn() {
  if (storeIdColumnReady) return;
  try {
    const [cols] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_inventory_batches` LIKE 'storeId'",
    );
    if (!Array.isArray(cols) || cols.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_inventory_batches` ADD COLUMN `storeId` INT NULL AFTER `productId`",
      );
      try {
        await sequelize.query(
          "ALTER TABLE `ERP_inventory_batches` ADD INDEX `erp_batches_store_id` (`storeId`)",
        );
      } catch {
        /* índice puede existir */
      }
      console.log("[batchStock] Columna storeId añadida a ERP_inventory_batches.");
    }
  } catch (err) {
    console.warn("[batchStock] ensureBatchStoreIdColumn:", err?.message || err);
  }
  storeIdColumnReady = true;
}

function multiStockOn() {
  return Boolean(getAppSettingsSync()?.multiStockEnabled);
}

/**
 * Descuenta cantidad de lotes activos (FEFO: vence antes primero).
 * Con multistock + storeId: prioriza lotes de ese local (luego sin local asignado).
 * Al llegar a 0 → status depleted (cerrado).
 */
export async function consumeBatchesFefo({
  productId,
  quantity,
  storeId = null,
  transaction,
} = {}) {
  const qtyNeeded = round4(quantity);
  if (!(qtyNeeded > 0) || !productId) return { consumed: 0, batches: [] };

  await ensureBatchStoreIdColumn();

  const run = async (t) => {
    const where = {
      productId: Number(productId),
      status: "active",
      quantityRemaining: { [Op.gt]: 0 },
    };

    const sid =
      storeId != null && storeId !== "" && Number.isFinite(Number(storeId))
        ? Number(storeId)
        : null;

    if (sid && multiStockOn()) {
      where[Op.or] = [{ storeId: sid }, { storeId: null }];
    }

    const order = sid && multiStockOn()
      ? [
          [
            sequelize.literal(
              `CASE WHEN \`storeId\` = ${sid} THEN 0 WHEN \`storeId\` IS NULL THEN 1 ELSE 2 END`,
            ),
            "ASC",
          ],
          ["expiresAt", "ASC"],
          ["id", "ASC"],
        ]
      : [
          ["expiresAt", "ASC"],
          ["id", "ASC"],
        ];

    const batches = await InventoryBatch.findAll({
      where,
      order,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    let left = qtyNeeded;
    const touched = [];

    for (const batch of batches) {
      if (left <= 0.0001) break;
      const rem = round4(batch.quantityRemaining);
      if (rem <= 0) continue;
      const take = round4(Math.min(rem, left));
      const next = round4(rem - take);
      batch.quantityRemaining = next;
      if (next <= 0.0001) {
        batch.quantityRemaining = 0;
        batch.status = "depleted";
      }
      await batch.save({ transaction: t });
      touched.push({ id: batch.id, took: take, remaining: batch.quantityRemaining });
      left = round4(left - take);
    }

    return { consumed: round4(qtyNeeded - left), batches: touched, shortfall: left };
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/** Cierra lote a mano: remaining=0, depleted. No toca stock del producto ni del local. */
export async function closeBatchManual(batchId, { transaction } = {}) {
  const run = async (t) => {
    const batch = await InventoryBatch.findByPk(batchId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!batch) {
      const err = new Error("Lote no encontrado");
      err.statusCode = 404;
      throw err;
    }
    batch.quantityRemaining = 0;
    batch.status = "depleted";
    await batch.save({ transaction: t });
    return batch;
  };
  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/**
 * Divide un lote y mueve stock a otro local (solo multistock).
 * Crea un lote nuevo con las mismas fechas; traslada StoreStock.
 */
export async function splitBatchToStore({
  batchId,
  toStoreId,
  quantity,
  transaction,
} = {}) {
  if (!multiStockOn()) {
    const err = new Error("Dividir lote solo está disponible con multistock activado.");
    err.statusCode = 400;
    throw err;
  }

  await ensureBatchStoreIdColumn();
  const qty = round4(quantity);
  if (!(qty > 0)) {
    const err = new Error("La cantidad a dividir debe ser mayor a 0.");
    err.statusCode = 400;
    throw err;
  }

  const run = async (t) => {
    const batch = await InventoryBatch.findByPk(batchId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!batch) {
      const err = new Error("Lote no encontrado");
      err.statusCode = 404;
      throw err;
    }
    if (batch.status === "depleted" || toNum(batch.quantityRemaining) <= 0) {
      const err = new Error("El lote ya está cerrado / sin stock.");
      err.statusCode = 400;
      throw err;
    }

    const fromStoreId = batch.storeId != null ? Number(batch.storeId) : null;
    if (!fromStoreId) {
      const err = new Error(
        "Este lote no tiene local asignado. Asigná un local al editarlo o recibilo en un local antes de dividir.",
      );
      err.statusCode = 400;
      throw err;
    }

    const destId = Number(toStoreId);
    if (!Number.isFinite(destId) || destId <= 0) {
      const err = new Error("Indicá el local destino.");
      err.statusCode = 400;
      throw err;
    }
    if (destId === fromStoreId) {
      const err = new Error("El local destino debe ser distinto al origen.");
      err.statusCode = 400;
      throw err;
    }

    const dest = await Store.findByPk(destId, { transaction: t });
    if (!dest || !storeHoldsInventory(dest.locationKind)) {
      const err = new Error("El destino debe ser Bodega o sucursal propia activa.");
      err.statusCode = 400;
      throw err;
    }

    const rem = round4(batch.quantityRemaining);
    if (qty > rem + 1e-9) {
      const err = new Error(`Solo hay ${rem} en este lote.`);
      err.statusCode = 400;
      throw err;
    }

    const nextRem = round4(rem - qty);
    batch.quantityRemaining = nextRem;
    if (nextRem <= 0.0001) {
      batch.quantityRemaining = 0;
      batch.status = "depleted";
    }
    await batch.save({ transaction: t });

    const codeBase = String(batch.code || "").trim();
    const newCode = codeBase
      ? `${codeBase}-P${destId}`
      : `L${batch.id}-P${destId}`;

    const created = await InventoryBatch.create(
      {
        productId: batch.productId,
        storeId: destId,
        code: newCode.slice(0, 80),
        quantityInitial: qty,
        quantityRemaining: qty,
        expiresAt: batch.expiresAt,
        manufacturedAt: batch.manufacturedAt,
        receivedAt: new Date(),
        notes: `Dividido desde lote #${batch.id}${batch.notes ? ` · ${batch.notes}` : ""}`.slice(
          0,
          2000,
        ),
        status: "active",
        createdBy: batch.createdBy,
      },
      { transaction: t },
    );

    await transferStoreStock({
      fromStoreId,
      toStoreId: destId,
      productId: batch.productId,
      quantity: qty,
      transaction: t,
    });

    return { source: batch, created };
  };

  if (transaction) return run(transaction);
  return sequelize.transaction(run);
}

/** Asigna storeId a un lote sin mover stock (corrección / setup). */
export async function assignBatchStore(batchId, storeId, { transaction } = {}) {
  await ensureBatchStoreIdColumn();
  const batch = await InventoryBatch.findByPk(batchId, { transaction });
  if (!batch) throw Object.assign(new Error("Lote no encontrado"), { statusCode: 404 });
  if (storeId == null || storeId === "") {
    batch.storeId = null;
  } else {
    batch.storeId = Number(storeId);
  }
  await batch.save({ transaction });
  return batch;
}
