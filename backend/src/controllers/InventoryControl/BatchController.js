import { addDays, format, parseISO, isValid } from "date-fns";
import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { InventoryBatch, InventoryProduct, InventoryMovement, Store } from "../../models/Inventory.js";
import { Expense } from "../../models/Finance.js";
import { verifyJWT, getHeaderToken } from "../../libs/jwt.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import { onInventoryStockChanged } from "../../services/notificationService.js";
import { nowApp } from "../../utils/appDateTime.js";
import { getAppSettingsSync } from "../../services/appSettingsService.js";
import {
  adjustStoreStock,
  getDefaultStockStoreId,
  getStoreStockQty,
  storeHoldsInventory,
} from "../../services/storeStockService.js";
import {
  ensureBatchStoreIdColumn,
  closeBatchManual,
  splitBatchToStore,
} from "../../services/batchStockService.js";

let schemaReady = false;

export async function ensureInventoryBatchesSchema() {
  if (schemaReady) return;
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'ERP_inventory_batches'");
    if (!Array.isArray(tables) || tables.length === 0) {
      await InventoryBatch.sync();
    }
  } catch (e) {
    const code = e?.parent?.code || e?.original?.code || "";
    const msg = String(e?.parent?.sqlMessage || e?.message || e);
    // Índices ya creados: no tumbar listado/recepción de lotes.
    if (code !== "ER_DUP_KEYNAME" && !msg.includes("Duplicate key name")) {
      console.warn("ensureInventoryBatchesSchema sync:", msg);
    }
  }
  // Columna agregada después del release inicial.
  try {
    const [cols] = await sequelize.query("SHOW COLUMNS FROM `ERP_inventory_batches` LIKE 'manufacturedAt'");
    if (!Array.isArray(cols) || cols.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_inventory_batches` ADD COLUMN `manufacturedAt` DATE NULL AFTER `expiresAt`",
      );
    }
  } catch (e) {
    console.warn("ensureInventoryBatchesSchema manufacturedAt:", e?.message || e);
  }
  await ensureBatchStoreIdColumn();
  schemaReady = true;
}

function toNum(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function round4(n) {
  return Number(Number(n || 0).toFixed(4));
}

function todayKey() {
  return format(nowApp(), "yyyy-MM-dd");
}

/** Parsea YYYY-MM-DD; vacío → null. */
function parseDayOnly(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).slice(0, 10);
  const d = parseISO(s);
  return isValid(d) ? s : null;
}

function shelfLifeDays(manufacturedAt, expiresAt) {
  if (!manufacturedAt || !expiresAt) return null;
  const a = parseISO(String(manufacturedAt).slice(0, 10));
  const b = parseISO(String(expiresAt).slice(0, 10));
  if (!isValid(a) || !isValid(b)) return null;
  const days = Math.round((b.getTime() - a.getTime()) / 86400000);
  return Number.isFinite(days) ? days : null;
}

function alertFlags(batch, warnDays = 30) {
  const remaining = toNum(batch.quantityRemaining);
  const expiresAt = String(batch.expiresAt || "").slice(0, 10);
  const today = todayKey();
  const warnUntil = format(addDays(parseISO(today), warnDays), "yyyy-MM-dd");
  const depleted = remaining <= 0.0001 || batch.status === "depleted";
  const expired = !depleted && expiresAt && expiresAt < today;
  const expiring = !depleted && !expired && expiresAt && expiresAt <= warnUntil;
  return {
    depleted,
    expired,
    expiring,
    alert: expired ? "expired" : expiring ? "expiring" : depleted ? "depleted" : "ok",
  };
}

function shapeBatch(row, warnDays = 30) {
  const plain = typeof row.toJSON === "function" ? row.toJSON() : row;
  const flags = alertFlags(plain, warnDays);
  const product = plain.product || plain.ERP_inventory_product || null;
  const store = plain.store || plain.ERP_store || null;
  const manufacturedAt = plain.manufacturedAt
    ? String(plain.manufacturedAt).slice(0, 10)
    : null;
  const expiresAt = String(plain.expiresAt || "").slice(0, 10);
  return {
    id: plain.id,
    productId: plain.productId,
    productName: product?.name || `(producto #${plain.productId})`,
    productType: product?.type || null,
    storeId: plain.storeId ?? null,
    storeName: store?.name || null,
    code: plain.code || null,
    quantityInitial: round4(plain.quantityInitial),
    quantityRemaining: round4(plain.quantityRemaining),
    expiresAt,
    manufacturedAt,
    shelfLifeDays: shelfLifeDays(manufacturedAt, expiresAt),
    receivedAt: plain.receivedAt,
    notes: plain.notes || null,
    status: plain.status,
    createdBy: plain.createdBy ?? null,
    createdAt: plain.createdAt,
    updatedAt: plain.updatedAt,
    ...flags,
  };
}

/**
 * Alertas de vencimiento para el dashboard (lotes con stock).
 * Incluye vigentes (gris/verde) para el velocímetro de vida útil.
 */
export async function computeBatchesDashboardAlerts(warnDays = 30) {
  const days = Math.min(90, Math.max(1, Number(warnDays) || 30));
  await ensureInventoryBatchesSchema();

  const rows = await InventoryBatch.findAll({
    where: {
      status: "active",
      quantityRemaining: { [Op.gt]: 0 },
    },
    include: [
      {
        model: InventoryProduct,
        as: "product",
        attributes: ["id", "name", "type"],
      },
    ],
    order: [
      ["expiresAt", "ASC"],
      ["id", "ASC"],
    ],
    limit: 300,
  });

  const expired = [];
  const expiring = [];
  const ok = [];
  for (const row of rows) {
    const shaped = shapeBatch(row, days);
    if (shaped.depleted) continue;
    if (shaped.expired) expired.push(shaped);
    else if (shaped.expiring) expiring.push(shaped);
    else ok.push(shaped);
  }
  return { expired, expiring, ok, warnDays: days };
}

/**
 * GET /inventory/batches/summary?warnDays=30
 */
export const getBatchesSummary = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const warnDays = Math.min(90, Math.max(1, parseInt(req.query.warnDays, 10) || 30));
    const rows = await InventoryBatch.findAll({
      attributes: ["id", "quantityRemaining", "expiresAt", "status"],
      raw: true,
    });
    const summary = { active: 0, expiring: 0, expired: 0, depleted: 0, total: rows.length };
    for (const row of rows) {
      const f = alertFlags(row, warnDays);
      if (f.depleted) summary.depleted += 1;
      else if (f.expired) summary.expired += 1;
      else if (f.expiring) summary.expiring += 1;
      else summary.active += 1;
    }
    return res.json({ warnDays, ...summary });
  } catch (error) {
    console.error("getBatchesSummary:", error);
    return res.status(500).json({ message: "Error al cargar resumen de lotes" });
  }
};

/**
 * GET /inventory/batches?productId=&alert=expired|expiring|active|depleted|all&warnDays=30
 */
export const getBatches = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const warnDays = Math.min(90, Math.max(1, parseInt(req.query.warnDays, 10) || 30));
    const productId = req.query.productId ? Number(req.query.productId) : null;
    const alert = String(req.query.alert || "all");

    const where = {};
    if (Number.isFinite(productId) && productId > 0) where.productId = productId;

    const rows = await InventoryBatch.findAll({
      where,
      include: [
        {
          model: InventoryProduct,
          as: "product",
          attributes: ["id", "name", "type", "stock", "unitId"],
        },
        {
          model: Store,
          as: "store",
          attributes: ["id", "name", "locationKind"],
          required: false,
        },
      ],
      order: [
        ["expiresAt", "ASC"],
        ["id", "ASC"],
      ],
    });

    let shaped = rows.map((r) => shapeBatch(r, warnDays));
    if (alert === "expired") shaped = shaped.filter((b) => b.expired);
    else if (alert === "expiring") shaped = shaped.filter((b) => b.expiring);
    else if (alert === "active") shaped = shaped.filter((b) => b.alert === "ok");
    else if (alert === "depleted") shaped = shaped.filter((b) => b.depleted);
    else if (alert === "open") shaped = shaped.filter((b) => !b.depleted);

    return res.json(shaped);
  } catch (error) {
    console.error("getBatches:", error);
    return res.status(500).json({ message: "Error al listar lotes", error: error.message });
  }
};

/**
 * POST /inventory/batches
 * body: { productId, quantity, expiresAt, manufacturedAt?, code?, notes?, unitCost?, createExpense?, receivedAt? }
 * Crea lote, sube stock del producto y registra movimiento de entrada.
 */
export const createBatch = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const productId = Number(req.body?.productId);
    const quantity = toNum(req.body?.quantity);
    const expiresAt = parseDayOnly(req.body?.expiresAt);
    const manufacturedAt = parseDayOnly(req.body?.manufacturedAt);
    const code = String(req.body?.code || "").trim() || null;
    const notes = String(req.body?.notes || "").trim() || null;
    const unitCost = req.body?.unitCost != null && req.body?.unitCost !== ""
      ? toNum(req.body.unitCost)
      : null;
    const createExpense = Boolean(req.body?.createExpense);
    /** assign = solo fechas sobre stock ya existente; add = suma stock (entrada). */
    const stockModeRaw = String(req.body?.stockMode || req.body?.mode || "add")
      .trim()
      .toLowerCase();
    const stockMode = stockModeRaw === "assign" || stockModeRaw === "existing"
      ? "assign"
      : "add";
    const receivedAtRaw = req.body?.receivedAt;
    const receivedAt = receivedAtRaw
      ? new Date(receivedAtRaw)
      : nowApp();
    const multi = Boolean(getAppSettingsSync()?.multiStockEnabled);
    let resolvedStoreId =
      req.body?.storeId != null && req.body.storeId !== ""
        ? Number(req.body.storeId)
        : null;

    if (!Number.isFinite(productId) || productId < 1) {
      notifyFail("batch.create_failed", "Producto inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Producto inválido" });
    }
    if (!(quantity > 0)) {
      notifyFail("batch.create_failed", "Cantidad inválida", { req, httpStatus: 400 });
      return res.status(400).json({ message: "La cantidad debe ser mayor a 0" });
    }
    if (!expiresAt) {
      notifyFail("batch.create_failed", "Fecha de vencimiento requerida", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Fecha de vencimiento requerida (YYYY-MM-DD)" });
    }
    if (req.body?.manufacturedAt && !manufacturedAt) {
      return res.status(400).json({ message: "Fecha de elaboración inválida" });
    }
    if (manufacturedAt && manufacturedAt > expiresAt) {
      return res.status(400).json({
        message: "La fecha de elaboración no puede ser posterior al vencimiento",
      });
    }

    const result = await sequelize.transaction(async (t) => {
      const product = await InventoryProduct.findByPk(productId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product) {
        const err = new Error("Producto no encontrado");
        err.statusCode = 404;
        throw err;
      }

      if (multi) {
        if (!Number.isFinite(resolvedStoreId) || resolvedStoreId <= 0) {
          resolvedStoreId = await getDefaultStockStoreId({ transaction: t });
        }
        const store = await Store.findByPk(resolvedStoreId, { transaction: t });
        if (!store || !storeHoldsInventory(store.locationKind)) {
          const err = new Error("Indicá Bodega o sucursal propia para el lote.");
          err.statusCode = 400;
          throw err;
        }
      } else {
        resolvedStoreId = null;
      }

      const batch = await InventoryBatch.create(
        {
          productId,
          storeId: resolvedStoreId,
          code,
          quantityInitial: round4(quantity),
          quantityRemaining: round4(quantity),
          expiresAt,
          manufacturedAt,
          receivedAt: Number.isNaN(receivedAt.getTime()) ? nowApp() : receivedAt,
          notes,
          status: "active",
          createdBy: user?.accountId ?? null,
        },
        { transaction: t },
      );

      if (stockMode === "assign") {
        // Solo registra el lote sobre stock que ya existe. No suma ni crea entrada de compra.
        let available = toNum(product.stock);
        if (resolvedStoreId) {
          available = await getStoreStockQty(resolvedStoreId, productId, { transaction: t });
        }
        if (quantity > available + 1e-9) {
          const err = new Error(
            `No hay suficiente stock sin lote para asignar. Disponible: ${available}, pedido: ${quantity}.`,
          );
          err.statusCode = 400;
          throw err;
        }
      } else {
        if (resolvedStoreId) {
          await adjustStoreStock(resolvedStoreId, productId, quantity, {
            transaction: t,
            allowNegative: false,
          });
        } else {
          product.stock = round4(toNum(product.stock) + quantity);
          await product.save({ transaction: t });
        }

        const priceTotal =
          unitCost != null && unitCost >= 0 ? round4(unitCost * quantity) : null;

        await InventoryMovement.create(
          {
            productId,
            quantity,
            type: "entrada",
            reason: createExpense && priceTotal != null ? "ENTRADA_COMPRA" : "ENTRADA_OTRA",
            description: code
              ? `Entrada lote ${code} (vence ${expiresAt})`
              : `Entrada lote #${batch.id} (vence ${expiresAt})`,
            price: priceTotal,
            referenceType: "inventory_batch",
            referenceId: batch.id,
            createdBy: user?.accountId ?? null,
            date: Number.isNaN(receivedAt.getTime()) ? nowApp() : receivedAt,
          },
          { transaction: t },
        );

        if (createExpense && priceTotal != null && priceTotal > 0) {
          await Expense.create(
            {
              date: Number.isNaN(receivedAt.getTime()) ? nowApp() : receivedAt,
              amount: priceTotal,
              concept: `Compra lote ${code || `#${batch.id}`} — ${product.name}`,
              category: "Compras",
              referenceId: product.id,
              referenceType: "inventory_entry",
              createdBy: user?.accountId ?? null,
            },
            { transaction: t },
          );
        }
      }

      return { batch, product, stockMode };
    });

    if (result.stockMode !== "assign") {
      onInventoryStockChanged(productId).catch(() => {});
    }

    const shaped = shapeBatch(
      await InventoryBatch.findByPk(result.batch.id, {
        include: [
          { model: InventoryProduct, as: "product", attributes: ["id", "name", "type", "stock"] },
          { model: Store, as: "store", attributes: ["id", "name", "locationKind"], required: false },
        ],
      }),
    );

    notifyOk("batch.created", `Lote #${shaped.id} — ${shaped.productName}`, { batch: shaped });
    return res.status(201).json(shaped);
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("createBatch:", error);
    notifyFail("batch.create_failed", error.message || "Error al crear lote", {
      error,
      req,
      httpStatus: status,
    });
    return res.status(status).json({ message: error.message || "Error al crear lote" });
  }
};

/**
 * PUT /inventory/batches/:id
 * Metadatos + cantidad restante del lote (no borra el producto).
 * Ajustar quantityRemaining NO mueve el stock del producto (ya se controla aparte / ventas).
 */
export const updateBatch = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const id = Number(req.params.id);
    const batch = await InventoryBatch.findByPk(id);
    if (!batch) {
      return res.status(404).json({ message: "Lote no encontrado" });
    }

    if (req.body?.code !== undefined) {
      batch.code = String(req.body.code || "").trim() || null;
    }
    if (req.body?.notes !== undefined) {
      batch.notes = String(req.body.notes || "").trim() || null;
    }
    if (req.body?.expiresAt !== undefined) {
      const expiresAt = parseDayOnly(req.body.expiresAt);
      if (!expiresAt) {
        return res.status(400).json({ message: "Fecha de vencimiento inválida" });
      }
      batch.expiresAt = expiresAt;
    }
    if (req.body?.manufacturedAt !== undefined) {
      if (req.body.manufacturedAt === null || req.body.manufacturedAt === "") {
        batch.manufacturedAt = null;
      } else {
        const manufacturedAt = parseDayOnly(req.body.manufacturedAt);
        if (!manufacturedAt) {
          return res.status(400).json({ message: "Fecha de elaboración inválida" });
        }
        batch.manufacturedAt = manufacturedAt;
      }
    }

    if (req.body?.quantityRemaining !== undefined && req.body?.quantityRemaining !== "") {
      const nextQty = round4(req.body.quantityRemaining);
      if (!Number.isFinite(nextQty) || nextQty < 0) {
        return res.status(400).json({ message: "Cantidad inválida" });
      }
      batch.quantityRemaining = nextQty;
      const initial = round4(batch.quantityInitial);
      if (nextQty > initial) {
        batch.quantityInitial = nextQty;
      }
      batch.status = nextQty <= 0.0001 ? "depleted" : "active";
    }

    if (req.body?.storeId !== undefined) {
      if (req.body.storeId === null || req.body.storeId === "") {
        batch.storeId = null;
      } else {
        const sid = Number(req.body.storeId);
        if (!Number.isFinite(sid) || sid <= 0) {
          return res.status(400).json({ message: "Local inválido" });
        }
        const store = await Store.findByPk(sid);
        if (!store || !storeHoldsInventory(store.locationKind)) {
          return res.status(400).json({ message: "El local debe ser Bodega o sucursal propia." });
        }
        batch.storeId = sid;
      }
    }

    const nextExpires = String(batch.expiresAt || "").slice(0, 10);
    const nextMfg = batch.manufacturedAt
      ? String(batch.manufacturedAt).slice(0, 10)
      : null;
    if (nextMfg && nextExpires && nextMfg > nextExpires) {
      return res.status(400).json({
        message: "La fecha de elaboración no puede ser posterior al vencimiento",
      });
    }

    await batch.save();
    const shaped = shapeBatch(
      await InventoryBatch.findByPk(id, {
        include: [
          { model: InventoryProduct, as: "product", attributes: ["id", "name", "type", "stock"] },
          { model: Store, as: "store", attributes: ["id", "name", "locationKind"], required: false },
        ],
      }),
    );
    notifyOk("batch.updated", `Lote #${id} actualizado`, { batch: shaped });
    return res.json(shaped);
  } catch (error) {
    console.error("updateBatch:", error);
    notifyFail("batch.update_failed", "Error al actualizar lote", { error, req, httpStatus: 500 });
    return res.status(500).json({ message: "Error al actualizar lote" });
  }
};

/**
 * POST /inventory/batches/:id/close
 * Cierra el lote (agotado) sin tocar stock del producto.
 */
export const closeBatch = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const id = Number(req.params.id);
    const batch = await closeBatchManual(id);
    const shaped = shapeBatch(
      await InventoryBatch.findByPk(batch.id, {
        include: [
          { model: InventoryProduct, as: "product", attributes: ["id", "name", "type", "stock"] },
          { model: Store, as: "store", attributes: ["id", "name"], required: false },
        ],
      }),
    );
    notifyOk("batch.closed", `Lote #${id} cerrado`, { batch: shaped });
    return res.json(shaped);
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("closeBatch:", error);
    notifyFail("batch.close_failed", error.message || "Error al cerrar lote", {
      error,
      req,
      httpStatus: status,
    });
    return res.status(status).json({ message: error.message || "Error al cerrar lote" });
  }
};

/**
 * POST /inventory/batches/:id/split
 * body: { toStoreId, quantity } — divide lote y traslada stock (solo multistock).
 */
export const splitBatch = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const id = Number(req.params.id);
    const toStoreId = Number(req.body?.toStoreId);
    const quantity = req.body?.quantity;

    const { source, created } = await splitBatchToStore({
      batchId: id,
      toStoreId,
      quantity,
    });

    onInventoryStockChanged(source.productId).catch(() => {});

    const include = [
      { model: InventoryProduct, as: "product", attributes: ["id", "name", "type", "stock"] },
      { model: Store, as: "store", attributes: ["id", "name", "locationKind"], required: false },
    ];
    const sourceShaped = shapeBatch(await InventoryBatch.findByPk(source.id, { include }));
    const createdShaped = shapeBatch(await InventoryBatch.findByPk(created.id, { include }));

    notifyOk("batch.split", `Lote #${id} dividido → #${created.id}`, {
      source: sourceShaped,
      created: createdShaped,
    });
    return res.json({ source: sourceShaped, created: createdShaped });
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("splitBatch:", error);
    notifyFail("batch.split_failed", error.message || "Error al dividir lote", {
      error,
      req,
      httpStatus: status,
    });
    return res.status(status).json({ message: error.message || "Error al dividir lote" });
  }
};

/**
 * POST /inventory/batches/:id/write-off
 * Da de baja el saldo restante por caducidad (SALIDA_CADUCADO) y deja el lote en historial.
 */
export const writeOffBatch = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const id = Number(req.params.id);

    const shaped = await sequelize.transaction(async (t) => {
      const batch = await InventoryBatch.findByPk(id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!batch) {
        const err = new Error("Lote no encontrado");
        err.statusCode = 404;
        throw err;
      }
      const qty = round4(batch.quantityRemaining);
      if (!(qty > 0)) {
        const err = new Error("El lote ya está agotado");
        err.statusCode = 400;
        throw err;
      }

      const product = await InventoryProduct.findByPk(batch.productId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product) {
        const err = new Error("Producto no encontrado");
        err.statusCode = 404;
        throw err;
      }

      product.stock = round4(Math.max(0, toNum(product.stock) - qty));
      await product.save({ transaction: t });

      batch.quantityRemaining = 0;
      batch.status = "depleted";
      await batch.save({ transaction: t });

      await InventoryMovement.create(
        {
          productId: batch.productId,
          quantity: qty,
          type: "salida",
          reason: "SALIDA_CADUCADO",
          description: `Baja por caducidad lote ${batch.code || `#${batch.id}`} (vencía ${batch.expiresAt})`,
          price: null,
          referenceType: "inventory_batch",
          referenceId: batch.id,
          createdBy: user?.accountId ?? null,
          date: nowApp(),
        },
        { transaction: t },
      );

      return batch.productId;
    });

    onInventoryStockChanged(shaped).catch(() => {});

    const out = shapeBatch(
      await InventoryBatch.findByPk(id, {
        include: [{ model: InventoryProduct, as: "product", attributes: ["id", "name", "type", "stock"] }],
      }),
    );
    notifyOk("batch.write_off", `Lote #${id} dado de baja por caducidad`, { batch: out });
    return res.json(out);
  } catch (error) {
    const status = error?.statusCode || 500;
    console.error("writeOffBatch:", error);
    notifyFail("batch.write_off_failed", error.message || "Error al dar de baja", {
      error,
      req,
      httpStatus: status,
    });
    return res.status(status).json({ message: error.message || "Error al dar de baja" });
  }
};

/**
 * DELETE /inventory/batches/:id
 * Elimina solo el registro del lote (fechas/cantidad). No borra el producto ni toca su stock.
 */
export const deleteBatch = async (req, res) => {
  try {
    await ensureInventoryBatchesSchema();
    const id = Number(req.params.id);
    const batch = await InventoryBatch.findByPk(id);
    if (!batch) return res.status(404).json({ message: "Lote no encontrado" });

    await batch.destroy();
    notifyOk("batch.deleted", `Lote #${id} eliminado`, { batchId: id });
    return res.json({ message: "Lote eliminado", id });
  } catch (error) {
    console.error("deleteBatch:", error);
    notifyFail("batch.delete_failed", "Error al eliminar lote", { error, req, httpStatus: 500 });
    return res.status(500).json({ message: "Error al eliminar lote" });
  }
};
