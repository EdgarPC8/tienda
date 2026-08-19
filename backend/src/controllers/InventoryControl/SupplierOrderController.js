import { Op } from "sequelize";
import { format } from "date-fns";
import { toAppDateTime, nowApp } from "../../utils/appDateTime.js";
import { es } from "date-fns/locale";
import { sequelize } from "../../database/connection.js";
import {
  Supplier,
  SupplierOrder,
  SupplierOrderItem,
} from "../../models/Orders.js";
import { InventoryProduct, InventoryMovement, InventoryBatch, Store } from "../../models/Inventory.js";
import { Expense, SupplierOrderPayment } from "../../models/Finance.js";
import { getHeaderToken, verifyJWT } from "../../libs/jwt.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import { ensureInventoryBatchesSchema } from "./BatchController.js";
import { getAppSettingsSync } from "../../services/appSettingsService.js";
import {
  adjustStoreStock,
  ensureBodegaStore,
  ensureStoreLocationKindEnum,
  getDefaultStockStoreId,
  storeHoldsInventory,
} from "../../services/storeStockService.js";
import {
  ensurePaymentScheduleSchema,
  replaceSupplierInstallments,
  syncSupplierInstallmentsPreservingPaid,
  loadSupplierInstallmentsMap,
  attachInstallmentsToRows,
} from "../../services/orderPaymentScheduleService.js";
import {
  resolveSupplierOrderPayDate,
  resolveSupplierOrderReceiveDate,
  syncSupplierOrderFinanceDates,
} from "../../utils/supplierOrderFinanceUtils.js";
import {
  canFinanceCascadeCorrection,
  cleanupSupplierOrderFinance,
} from "../../utils/financeCascadeUtils.js";

const toNum = (v, d = 0) => {
  const n = Number(v ?? d);
  return Number.isFinite(n) ? n : d;
};

let supplierItemLotSchemaReady = false;

async function ensureSupplierOrderItemLotSchema() {
  if (supplierItemLotSchemaReady) return;
  const cols = [
    ["packKey", "VARCHAR(64) NULL"],
    ["packName", "VARCHAR(120) NULL"],
    ["lotCode", "VARCHAR(80) NULL"],
    ["expiresAt", "DATE NULL"],
    ["manufacturedAt", "DATE NULL"],
    ["inventoryBatchId", "INT NULL"],
  ];
  for (const [name, ddl] of cols) {
    try {
      const [found] = await sequelize.query(
        `SHOW COLUMNS FROM \`ERP_supplier_order_items\` LIKE '${name}'`,
      );
      if (!Array.isArray(found) || found.length === 0) {
        await sequelize.query(
          `ALTER TABLE \`ERP_supplier_order_items\` ADD COLUMN \`${name}\` ${ddl}`,
        );
      }
    } catch (e) {
      console.warn(`ensureSupplierOrderItemLotSchema ${name}:`, e?.message || e);
    }
  }
  try {
    const [found] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_supplier_orders` LIKE 'receivedStoreId'",
    );
    if (!Array.isArray(found) || found.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_supplier_orders` ADD COLUMN `receivedStoreId` INT NULL",
      );
    }
  } catch (e) {
    console.warn("ensureSupplierOrder receivedStoreId:", e?.message || e);
  }
  try {
    const [found] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_supplier_orders` LIKE 'invoiceNumber'",
    );
    if (!Array.isArray(found) || found.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_supplier_orders` ADD COLUMN `invoiceNumber` VARCHAR(80) NULL",
      );
    }
  } catch (e) {
    console.warn("ensureSupplierOrder invoiceNumber:", e?.message || e);
  }
  try {
    await sequelize.query(
      "ALTER TABLE `ERP_supplier_order_items` MODIFY COLUMN `unitPrice` DECIMAL(14,6) NOT NULL DEFAULT 0",
    );
  } catch (e) {
    console.warn("ensureSupplierOrder unitPrice precision:", e?.message || e);
  }
  try {
    const [found] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_supplier_order_items` LIKE 'discount'",
    );
    if (!Array.isArray(found) || found.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_supplier_order_items` ADD COLUMN `discount` DECIMAL(14,6) NOT NULL DEFAULT 0",
      );
    }
  } catch (e) {
    console.warn("ensureSupplierOrder discount:", e?.message || e);
  }
  supplierItemLotSchemaReady = true;
}

/** null = stock general (sin multistock). Número = local inventariable. */
async function resolveReceiveStoreId(body, { transaction, requireExplicit = false } = {}) {
  const multi = getAppSettingsSync()?.multiStockEnabled !== false;
  if (!multi) return null;

  let sid =
    body?.storeId != null && body.storeId !== ""
      ? Number(body.storeId)
      : null;
  if (!Number.isFinite(sid) || sid <= 0) {
    if (requireExplicit) {
      throw new Error("Con multistock debes indicar Bodega o una sucursal para recibir.");
    }
    sid = await getDefaultStockStoreId({ transaction });
  }
  const store = await Store.findByPk(sid, { transaction });
  if (!store || !storeHoldsInventory(store.locationKind)) {
    throw new Error("El local de recepción debe ser Bodega o sucursal propia.");
  }
  return Number(store.id);
}

async function applyReceiveQty({ product, qty, storeId, transaction }) {
  if (storeId) {
    await adjustStoreStock(storeId, product.id, qty, {
      transaction,
      allowNegative: qty < 0,
    });
    return;
  }
  await product.update({ stock: toNum(product.stock) + qty }, { transaction });
}

function parseDayOnly(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Campos de paca/lote por línea (pedido proveedor). */
function itemPackLotFields(row = {}) {
  const packKey = row.packKey != null && String(row.packKey).trim()
    ? String(row.packKey).trim().slice(0, 64)
    : null;
  const packName = row.packName != null && String(row.packName).trim()
    ? String(row.packName).trim().slice(0, 120)
    : null;
  const lotCode = row.lotCode != null && String(row.lotCode).trim()
    ? String(row.lotCode).trim().slice(0, 80)
    : null;
  const expiresAt = parseDayOnly(row.expiresAt);
  const manufacturedAt = parseDayOnly(row.manufacturedAt);
  if (manufacturedAt && expiresAt && manufacturedAt > expiresAt) {
    throw new Error("La fecha de elaboración no puede ser posterior al vencimiento");
  }
  return { packKey, packName, lotCode, expiresAt, manufacturedAt };
}

function buildItemCreatePayload(orderId, row) {
  const productId = Number(row.productId);
  const quantity = toNum(row.quantity);
  if (!productId || quantity <= 0) throw new Error("Ítem inválido en el pedido");
  const lot = itemPackLotFields(row);
  return {
    orderId,
    productId,
    quantity,
    unitPrice: toNum(row.unitPrice ?? row.price, 0),
    discount: Math.max(0, toNum(row.discount, 0)),
    taxRate: Math.max(0, toNum(row.taxRate, 0)),
    ...lot,
  };
}

function parseRangeDate(value, endOfDay = false) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

function formatSupplierOrderBase(order) {
  return {
    ...order.toJSON(),
    orderKind: "supplier",
    date: format(new Date(order.date), "dd/MM/yyyy HH:mm:ss", { locale: es }),
    receivedAt: order.receivedAt
      ? format(new Date(order.receivedAt), "dd/MM/yyyy HH:mm:ss", { locale: es })
      : null,
    paidAt: order.paidAt
      ? format(new Date(order.paidAt), "dd/MM/yyyy HH:mm:ss", { locale: es })
      : null,
    createdAt: format(new Date(order.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: es }),
    updatedAt: format(new Date(order.updatedAt), "dd/MM/yyyy HH:mm:ss", { locale: es }),
  };
}

const orderIncludes = [
  { model: Supplier, as: "ERP_supplier" },
  {
    model: SupplierOrderItem,
    as: "ERP_supplier_order_items",
    include: [{ model: InventoryProduct, as: "ERP_inventory_product" }],
  },
];

function lineNet(it) {
  const gross = toNum(it.quantity) * toNum(it.unitPrice);
  const disc = Math.max(0, toNum(it.discount, 0));
  return Math.max(0, gross - disc);
}

function orderTotal(items = []) {
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  let sub = 0;
  let iva = 0;
  for (const it of items) {
    const line = lineNet(it);
    sub += line;
    iva += line * (toNum(it.taxRate) / 100);
  }
  return round2(round2(sub) + round2(iva));
}

/** Incluye total / abonado / saldo para abonos parciales desde el calendario. */
async function formatSupplierOrdersList(orders) {
  const list = Array.isArray(orders) ? orders : [];
  try {
    await SupplierOrderPayment.sync();
  } catch {
    /* ignore */
  }

  const ids = list.map((o) => o.id).filter(Boolean);
  const paidByOrderId = new Map();
  const paymentsByOrderId = new Map();

  if (ids.length > 0) {
    const payments = await SupplierOrderPayment.findAll({
      where: { supplierOrderId: { [Op.in]: ids }, status: "completed" },
      attributes: ["id", "supplierOrderId", "date", "amount", "method", "note", "status"],
      order: [["date", "DESC"]],
    });
    for (const p of payments) {
      const oid = Number(p.supplierOrderId);
      paidByOrderId.set(oid, Number(((paidByOrderId.get(oid) || 0) + toNum(p.amount)).toFixed(2)));
      if (!paymentsByOrderId.has(oid)) paymentsByOrderId.set(oid, []);
      paymentsByOrderId.get(oid).push({
        id: p.id,
        date: p.date ? format(new Date(p.date), "dd/MM/yyyy HH:mm:ss", { locale: es }) : null,
        amount: Number(toNum(p.amount).toFixed(2)),
        method: p.method || "efectivo",
        note: p.note || "",
        status: p.status,
      });
    }
  }

  const rowsWithPaid = list.map((order) => {
    const base = formatSupplierOrderBase(order);
    const total = orderTotal(order.ERP_supplier_order_items || []);
    let paid = toNum(paidByOrderId.get(Number(order.id)) || 0);
    if (order.paidAt && paid <= 0 && total > 0) paid = total;
    const remaining =
      order.paidAt && paid >= total - 0.009
        ? 0
        : Number(Math.max(0, total - paid).toFixed(2));

    return {
      ...base,
      totalAmount: total,
      paidAmount: paid,
      remainingAmount: remaining,
      payments: paymentsByOrderId.get(Number(order.id)) || [],
    };
  });

  await ensurePaymentScheduleSchema();
  const instMap = await loadSupplierInstallmentsMap(list.map((o) => o.id));
  return attachInstallmentsToRows(rowsWithPaid, instMap);
}

export const getSupplierOrders = async (req, res) => {
  try {
    await ensureSupplierOrderItemLotSchema();
    await ensurePaymentScheduleSchema();
    const fromDate = parseRangeDate(req.query.from, false);
    const toDate = parseRangeDate(req.query.to, true);
    const where = {};
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date[Op.gte] = fromDate;
      if (toDate) where.date[Op.lte] = toDate;
    }

    const rows = await SupplierOrder.findAll({
      where,
      include: orderIncludes,
      order: [["date", "DESC"]],
    });
    res.json(await formatSupplierOrdersList(rows));
  } catch (error) {
    console.error("getSupplierOrders:", error);
    res.status(500).json({ message: "Error al obtener pedidos a proveedor" });
  }
};

export const createSupplierOrder = async (req, res) => {
  try {
    await ensureSupplierOrderItemLotSchema();
    await ensurePaymentScheduleSchema();
    const token = getHeaderToken(req);
    await verifyJWT(token);
    const { supplierId, date, notes, items = [], paymentInstallments, invoiceNumber } =
      req.body || {};

    if (!supplierId || !date || !Array.isArray(items) || items.length === 0) {
      notifyFail("supplier_order.create_failed", "Proveedor, fecha e ítems son requeridos", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Proveedor, fecha e ítems son requeridos" });
    }

    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      notifyFail("supplier_order.create_failed", "Proveedor no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }

    const invoiceNumberClean = String(invoiceNumber || "").trim().slice(0, 80) || null;

    const orderId = await sequelize.transaction(async (t) => {
      const order = await SupplierOrder.create(
        {
          supplierId: Number(supplierId),
          date: new Date(date),
          notes: notes || null,
          invoiceNumber: invoiceNumberClean,
          status: "pendiente",
        },
        { transaction: t }
      );

      for (const row of items) {
        const payload = buildItemCreatePayload(order.id, row);
        const product = await InventoryProduct.findByPk(payload.productId, { transaction: t });
        if (!product) throw new Error(`Producto #${payload.productId} no encontrado`);
        await SupplierOrderItem.create(payload, { transaction: t });
      }
      return order.id;
    });

    if (Array.isArray(paymentInstallments)) {
      await replaceSupplierInstallments(orderId, paymentInstallments || []);
    }

    const full = await SupplierOrder.findByPk(orderId, { include: orderIncludes });
    notifyOk("supplier_order.created", "Pedido a proveedor creado", { supplierOrderId: orderId });
    res.status(201).json((await formatSupplierOrdersList([full]))[0]);
  } catch (error) {
    console.error("createSupplierOrder:", error);
    notifyFail("supplier_order.create_failed", error.message || "Error al crear pedido a proveedor", {
      error,
      req,
      httpStatus: 400,
    });
    res.status(400).json({ message: error.message || "Error al crear pedido a proveedor" });
  }
};

export const updateSupplierOrder = async (req, res) => {
  try {
    await ensureSupplierOrderItemLotSchema();
    await ensurePaymentScheduleSchema();
    const { id } = req.params;
    const { supplierId, date, notes, items, receivedAt, paidAt, paymentInstallments, invoiceNumber } =
      req.body || {};
    const order = await SupplierOrder.findByPk(id);
    if (!order) {
      notifyFail("supplier_order.update_failed", `Pedido proveedor #${id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const isReceived = Boolean(order.receivedAt);
    // Corrección manual de fechas (Programador): no re-dispara movimientos de stock.
    const hasDateOverride = receivedAt !== undefined || paidAt !== undefined;
    const hasPaymentInstallments = paymentInstallments !== undefined;
    const user = await verifyJWT(getHeaderToken(req));
    const isProgramador = user?.loginRol === "Programador";
    if (hasDateOverride) {
      if (!isProgramador) {
        notifyFail("supplier_order.update_failed", "No tenés permiso para editar las fechas de entrega y pago", {
          req,
          httpStatus: 403,
        });
        return res
          .status(403)
          .json({ message: "No tenés permiso para editar las fechas de entrega y pago" });
      }
    }

    /** Programador: editar ítems/precios de pedido recibido con saldo (modal completo). */
    const wantsReceivedItemsEdit =
      isReceived &&
      !hasDateOverride &&
      Array.isArray(items) &&
      items.length > 0 &&
      isProgramador;

    if (isReceived && !hasDateOverride && !wantsReceivedItemsEdit && !hasPaymentInstallments) {
      notifyFail("supplier_order.update_failed", "No se puede editar un pedido ya recibido", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "No se puede editar un pedido ya recibido" });
    }

    if (wantsReceivedItemsEdit) {
      const fullForPay = await SupplierOrder.findByPk(id, { include: orderIncludes });
      const [formatted] = await formatSupplierOrdersList([fullForPay]);
      if (toNum(formatted?.remainingAmount) <= 0.009) {
        notifyFail(
          "supplier_order.update_failed",
          "No se puede editar un pedido proveedor ya liquidado",
          { req, httpStatus: 400 }
        );
        return res.status(400).json({
          message: "No se puede editar un pedido proveedor ya liquidado",
        });
      }

      await sequelize.transaction(async (t) => {
        const oldItems = await SupplierOrderItem.findAll({
          where: { orderId: order.id },
          transaction: t,
        });
        const oldQtyByProduct = new Map();
        for (const it of oldItems) {
          const pid = Number(it.productId);
          oldQtyByProduct.set(pid, toNum(oldQtyByProduct.get(pid)) + toNum(it.quantity));
        }

        const normalized = [];
        const newQtyByProduct = new Map();
        for (const row of items) {
          const payload = buildItemCreatePayload(order.id, row);
          if (payload.unitPrice < 0) throw new Error("Precio unitario inválido");
          normalized.push(payload);
          newQtyByProduct.set(
            payload.productId,
            toNum(newQtyByProduct.get(payload.productId)) + payload.quantity
          );
        }

        const allProductIds = new Set([
          ...oldQtyByProduct.keys(),
          ...newQtyByProduct.keys(),
        ]);
        for (const productId of allProductIds) {
          const delta =
            toNum(newQtyByProduct.get(productId)) - toNum(oldQtyByProduct.get(productId));
          if (delta === 0) continue;
          const product = await InventoryProduct.findByPk(productId, { transaction: t });
          if (!product) throw new Error(`Producto #${productId} no encontrado`);
          const stockStoreId =
            order.receivedStoreId != null
              ? Number(order.receivedStoreId)
              : await resolveReceiveStoreId({}, { transaction, requireExplicit: false });
          await applyReceiveQty({
            product,
            qty: delta,
            storeId: stockStoreId,
            transaction: t,
          });
          await InventoryMovement.create(
            {
              productId,
              type: delta > 0 ? "entrada" : "salida",
              reason: delta > 0 ? "ENTRADA_COMPRA" : "AJUSTE_SALIDA",
              quantity: Math.abs(delta),
              description:
                delta > 0
                  ? `Ajuste recepción pedido proveedor #${order.id}`
                  : `Ajuste reducción pedido proveedor #${order.id}`,
              price: 0,
              referenceType: "supplier_order",
              referenceId: order.id,
              createdBy: user.accountId,
              date: order.receivedAt || nowApp(),
            },
            { transaction: t }
          );
        }

        await order.update(
          {
            ...(supplierId != null ? { supplierId: Number(supplierId) } : {}),
            ...(date ? { date: new Date(date) } : {}),
            ...(notes !== undefined ? { notes: notes || null } : {}),
            ...(invoiceNumber !== undefined
              ? { invoiceNumber: String(invoiceNumber || "").trim().slice(0, 80) || null }
              : {}),
          },
          { transaction: t }
        );

        await SupplierOrderItem.destroy({ where: { orderId: order.id }, transaction: t });
        for (const row of normalized) {
          await SupplierOrderItem.create(row, { transaction: t });
        }
      });

      const full = await SupplierOrder.findByPk(id, { include: orderIncludes });
      if (paymentInstallments !== undefined) {
        const [formattedPay] = await formatSupplierOrdersList([full]);
        await syncSupplierInstallmentsPreservingPaid(
          id,
          paymentInstallments,
          formattedPay?.paidAmount || 0,
        );
      }
      notifyOk("supplier_order.updated", `Pedido proveedor #${id} (corrección post-recibo)`, {
        supplierOrderId: Number(id),
      });
      return res.json((await formatSupplierOrdersList([full]))[0]);
    }

    await sequelize.transaction(async (t) => {
      await order.update(
        {
          ...(!isReceived && supplierId != null ? { supplierId: Number(supplierId) } : {}),
          ...(!isReceived && date ? { date: new Date(date) } : {}),
          ...(!isReceived && notes !== undefined ? { notes: notes || null } : {}),
          ...(invoiceNumber !== undefined
            ? { invoiceNumber: String(invoiceNumber || "").trim().slice(0, 80) || null }
            : {}),
          ...(receivedAt !== undefined ? { receivedAt: receivedAt ? new Date(receivedAt) : null } : {}),
          ...(paidAt !== undefined ? { paidAt: paidAt ? new Date(paidAt) : null } : {}),
        },
        { transaction: t }
      );

      if (paidAt !== undefined && paidAt) {
        await syncSupplierOrderFinanceDates(Number(id), paidAt, t);
      }

      if (!isReceived && Array.isArray(items)) {
        await SupplierOrderItem.destroy({ where: { orderId: order.id }, transaction: t });
        for (const row of items) {
          const payload = buildItemCreatePayload(order.id, row);
          await SupplierOrderItem.create(payload, { transaction: t });
        }
      }
    });

    if (date && paidAt === undefined) {
      const paidCheck = await SupplierOrder.findByPk(id);
      if (paidCheck?.paidAt) {
        await sequelize.transaction(async (t) => {
          await syncSupplierOrderFinanceDates(Number(id), date, t);
          await paidCheck.update({ paidAt: new Date(date) }, { transaction: t });
        });
      }
    }

    const full = await SupplierOrder.findByPk(id, { include: orderIncludes });
    if (paymentInstallments !== undefined) {
      const [formattedPay] = await formatSupplierOrdersList([full]);
      await syncSupplierInstallmentsPreservingPaid(
        id,
        paymentInstallments,
        formattedPay?.paidAmount || 0,
      );
    }
    notifyOk("supplier_order.updated", `Pedido proveedor #${id}`, { supplierOrderId: Number(id) });
    res.json((await formatSupplierOrdersList([full]))[0]);
  } catch (error) {
    console.error("updateSupplierOrder:", error);
    notifyFail("supplier_order.update_failed", error.message || "Error al actualizar pedido", {
      error,
      req,
      httpStatus: 400,
    });
    res.status(400).json({ message: error.message || "Error al actualizar pedido" });
  }
};

/** POST /supplier-orders/:id/items — agregar línea a pedido proveedor pendiente. */
export const addSupplierOrderItem = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const isPrivileged = ["Administrador", "Programador"].includes(user?.loginRol);
    if (!isPrivileged) {
      notifyFail("supplier_order.item_add_failed", "No tenés permiso para agregar productos al pedido", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: "No tenés permiso para agregar productos al pedido",
      });
    }

    const order = await SupplierOrder.findByPk(req.params.id);
    if (!order) {
      notifyFail("supplier_order.item_add_failed", `Pedido proveedor #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Pedido no encontrado" });
    }
    if (order.receivedAt) {
      notifyFail("supplier_order.item_add_failed", "No se pueden agregar productos a un pedido ya recibido", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "No se pueden agregar productos a un pedido ya recibido" });
    }

    const productId = Number(req.body?.productId);
    const quantity = toNum(req.body?.quantity);
    const unitPrice = toNum(req.body?.unitPrice ?? req.body?.price, -1);
    if (!productId || quantity <= 0) {
      notifyFail("supplier_order.item_add_failed", "Producto y cantidad válidos son requeridos", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Producto y cantidad válidos son requeridos" });
    }
    if (unitPrice < 0) {
      notifyFail("supplier_order.item_add_failed", "Precio unitario inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Precio unitario inválido" });
    }

    const product = await InventoryProduct.findByPk(productId);
    if (!product) {
      notifyFail("supplier_order.item_add_failed", "Producto no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const item = await SupplierOrderItem.create({
      orderId: order.id,
      productId,
      quantity,
      unitPrice: unitPrice >= 0 ? unitPrice : toNum(product.distributorPrice ?? product.price, 0),
      discount: Math.max(0, toNum(req.body?.discount, 0)),
      taxRate: Math.max(0, toNum(req.body?.taxRate, 0)),
    });

    const full = await SupplierOrder.findByPk(order.id, { include: orderIncludes });
    notifyOk("supplier_order.item_added", `Ítem pedido proveedor #${req.params.id}`, {
      supplierOrderId: order.id,
      itemId: item.id,
    });
    res.status(201).json({
      message: "Producto agregado al pedido",
      item,
      order: (await formatSupplierOrdersList([full]))[0],
    });
  } catch (error) {
    console.error("addSupplierOrderItem:", error);
    notifyFail("supplier_order.item_add_failed", error.message || "Error al agregar producto", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message || "Error al agregar producto" });
  }
};

export const deleteSupplierOrder = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const order = await SupplierOrder.findByPk(req.params.id);
    if (!order) {
      notifyFail("supplier_order.delete_failed", `Pedido proveedor #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Pedido no encontrado" });
    }

    const hasFinance = Boolean(order.paidAt || order.receivedAt);
    if (hasFinance && !canFinanceCascadeCorrection(user)) {
      notifyFail("supplier_order.delete_failed", "No se puede eliminar un pedido con pago o recepción", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: "Anule el pago primero o use Admin/Programador con correcciones financieras activas",
      });
    }

    await sequelize.transaction(async (t) => {
      if (hasFinance) {
        await cleanupSupplierOrderFinance(order.id, t);
      }
      await order.destroy({ transaction: t });
    });

    notifyOk("supplier_order.deleted", `Pedido proveedor #${req.params.id}`, {
      supplierOrderId: Number(req.params.id),
    });
    res.json({ message: "Pedido a proveedor eliminado (gastos/abonos vinculados eliminados si existían)" });
  } catch (error) {
    console.error("deleteSupplierOrder:", error);
    notifyFail("supplier_order.delete_failed", `Error al eliminar pedido #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar pedido" });
  }
};

export const unmarkSupplierOrderPaid = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    if (!canFinanceCascadeCorrection(user)) {
      notifyFail("supplier_order.unmark_paid_failed", "No tiene permiso para anular pagos", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: "Solo Admin (con config activa) o Programador pueden anular un pago a proveedor",
      });
    }

    const order = await SupplierOrder.findByPk(req.params.id, { include: orderIncludes });
    if (!order) {
      notifyFail("supplier_order.unmark_paid_failed", `Pedido proveedor #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Pedido no encontrado" });
    }
    if (!order.paidAt) {
      return res.status(400).json({ message: "El pedido no está marcado como pagado" });
    }

    await sequelize.transaction(async (t) => {
      await cleanupSupplierOrderFinance(order.id, t);
      order.paidAt = null;
      order.paymentMethod = null;
      order.financeExpenseId = null;
      await order.save({ transaction: t });
    });

    const full = await SupplierOrder.findByPk(order.id, { include: orderIncludes });
    notifyOk("supplier_order.unmark_paid", `Pago anulado pedido proveedor #${req.params.id}`, {
      supplierOrderId: order.id,
    });
    res.json((await formatSupplierOrdersList([full]))[0]);
  } catch (error) {
    console.error("unmarkSupplierOrderPaid:", error);
    notifyFail("supplier_order.unmark_paid_failed", "Error al anular pago del pedido", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al anular pago del pedido" });
  }
};

export const markSupplierOrderReceived = async (req, res) => {
  try {
    await ensureSupplierOrderItemLotSchema();
    await ensureInventoryBatchesSchema();
    await ensureStoreLocationKindEnum();
    // Corrige locales llamados "Bodega*" mal tipados como vitrina.
    await ensureBodegaStore();
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const order = await SupplierOrder.findByPk(req.params.id, {
      include: [{ model: SupplierOrderItem, as: "ERP_supplier_order_items" }],
    });
    if (!order) {
      notifyFail("supplier_order.mark_received_failed", `Pedido proveedor #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Pedido no encontrado" });
    }
    if (order.receivedAt) {
      notifyFail("supplier_order.mark_received_failed", "El pedido ya fue marcado como recibido", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "El pedido ya fue marcado como recibido" });
    }

    const receivedAt = resolveSupplierOrderReceiveDate({
      receivedAt: req.body?.receivedAt,
      order,
    });

    await sequelize.transaction(async (t) => {
      const receiveStoreId = await resolveReceiveStoreId(req.body || {}, {
        transaction: t,
        requireExplicit: getAppSettingsSync()?.multiStockEnabled !== false,
      });
      const items = order.ERP_supplier_order_items || [];

      // Agrupar líneas con vencimiento → 1 lote por (producto + paca + lote + fechas).
      const batchGroups = new Map();
      const plainItems = [];

      for (const item of items) {
        const qty = toNum(item.quantity);
        if (qty <= 0) continue;
        const expiresAt = parseDayOnly(item.expiresAt);
        if (expiresAt) {
          const key = [
            item.productId,
            item.packKey || "",
            item.lotCode || "",
            expiresAt,
            parseDayOnly(item.manufacturedAt) || "",
          ].join("|");
          if (!batchGroups.has(key)) {
            batchGroups.set(key, {
              productId: item.productId,
              packKey: item.packKey || null,
              packName: item.packName || null,
              lotCode: item.lotCode || null,
              expiresAt,
              manufacturedAt: parseDayOnly(item.manufacturedAt),
              quantity: 0,
              unitPriceSum: 0,
              itemIds: [],
            });
          }
          const g = batchGroups.get(key);
          g.quantity += qty;
          g.unitPriceSum += lineNet(item);
          g.itemIds.push(item.id);
        } else {
          plainItems.push(item);
        }
      }

      for (const g of batchGroups.values()) {
        const product = await InventoryProduct.findByPk(g.productId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!product) continue;

        const batch = await InventoryBatch.create(
          {
            productId: g.productId,
            storeId: receiveStoreId || null,
            code: g.lotCode,
            quantityInitial: g.quantity,
            quantityRemaining: g.quantity,
            expiresAt: g.expiresAt,
            manufacturedAt: g.manufacturedAt,
            receivedAt,
            notes: g.packName
              ? `Paca «${g.packName}» · pedido proveedor #${order.id}`
              : `Pedido proveedor #${order.id}`,
            status: "active",
            createdBy: user.accountId,
          },
          { transaction: t },
        );

        await applyReceiveQty({
          product,
          qty: g.quantity,
          storeId: receiveStoreId,
          transaction: t,
        });

        await InventoryMovement.create(
          {
            productId: product.id,
            type: "entrada",
            reason: "ENTRADA_COMPRA",
            quantity: g.quantity,
            description: g.lotCode
              ? `Recepción pedido #${order.id} · lote ${g.lotCode} (vence ${g.expiresAt})`
              : `Recepción pedido #${order.id} · lote #${batch.id} (vence ${g.expiresAt})`,
            price: g.unitPriceSum,
            referenceType: "inventory_batch",
            referenceId: batch.id,
            createdBy: user.accountId,
            date: receivedAt,
          },
          { transaction: t },
        );

        await SupplierOrderItem.update(
          { inventoryBatchId: batch.id },
          { where: { id: { [Op.in]: g.itemIds } }, transaction: t },
        );
      }

      for (const item of plainItems) {
        const product = await InventoryProduct.findByPk(item.productId, { transaction: t });
        if (!product) continue;
        const qty = toNum(item.quantity);
        if (qty <= 0) continue;

        await applyReceiveQty({
          product,
          qty,
          storeId: receiveStoreId,
          transaction: t,
        });

        await InventoryMovement.create(
          {
            productId: product.id,
            type: "entrada",
            reason: "ENTRADA_COMPRA",
            quantity: qty,
            description: `Recepción pedido proveedor #${order.id}`,
            price: lineNet(item),
            referenceType: "supplier_order",
            referenceId: order.id,
            createdBy: user.accountId,
            date: receivedAt,
          },
          { transaction: t },
        );
      }

      order.receivedAt = receivedAt;
      order.status = "recibido";
      if (receiveStoreId) order.receivedStoreId = receiveStoreId;
      await order.save({ transaction: t });
    });

    const full = await SupplierOrder.findByPk(order.id, { include: orderIncludes });
    notifyOk("supplier_order.mark_received", `Pedido recibido #${req.params.id}`, {
      supplierOrderId: order.id,
    });
    res.json((await formatSupplierOrdersList([full]))[0]);
  } catch (error) {
    console.error("markSupplierOrderReceived:", error);
    notifyFail("supplier_order.mark_received_failed", "Error al marcar pedido como recibido", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message || "Error al marcar pedido como recibido" });
  }
};

export const markSupplierOrderPaid = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const { paymentMethod = "efectivo", paidAt } = req.body || {};

    const order = await SupplierOrder.findByPk(req.params.id, {
      include: [
        { model: Supplier, as: "ERP_supplier" },
        { model: SupplierOrderItem, as: "ERP_supplier_order_items" },
      ],
    });
    if (!order) {
      notifyFail("supplier_order.mark_paid_failed", `Pedido proveedor #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Pedido no encontrado" });
    }
    if (order.paidAt) {
      notifyFail("supplier_order.mark_paid_failed", "El pedido ya fue marcado como pagado", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "El pedido ya fue marcado como pagado" });
    }

    const instMap = await loadSupplierInstallmentsMap([order.id]);
    const firstInstallmentDueDate = (instMap.get(order.id) || [])[0]?.dueDate || null;
    const payDate = resolveSupplierOrderPayDate({
      paidAt,
      order,
      installmentDueDate: firstInstallmentDueDate,
    });
    const total = orderTotal(order.ERP_supplier_order_items || []);
    const supplierName = order.ERP_supplier?.name || "Proveedor";

    await sequelize.transaction(async (t) => {
      await SupplierOrderPayment.sync();

      const alreadyPaid = await SupplierOrderPayment.sum("amount", {
        where: { supplierOrderId: order.id, status: "completed" },
        transaction: t,
      });
      const remaining = Math.max(0, Number((total - toNum(alreadyPaid)).toFixed(2)));
      if (remaining <= 0.009) {
        order.paidAt = payDate;
        order.paymentMethod = paymentMethod;
        await order.save({ transaction: t });
        return;
      }

      const expense = await Expense.create(
        {
          date: payDate,
          amount: Number(remaining.toFixed(2)),
          concept: `Pago pedido proveedor #${order.id} — ${supplierName}`,
          category: "Compras",
          referenceType: "supplier_order_payment",
          referenceId: order.id,
          counterpartyName: supplierName,
          createdBy: user.accountId,
          status: "paid",
        },
        { transaction: t }
      );

      await SupplierOrderPayment.create(
        {
          supplierOrderId: order.id,
          supplierId: order.supplierId,
          date: payDate,
          amount: Number(remaining.toFixed(2)),
          method: paymentMethod,
          note: `Liquidación pedido #${order.id}`,
          status: "completed",
          expenseId: expense.id,
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      order.paidAt = payDate;
      order.paymentMethod = paymentMethod;
      order.financeExpenseId = expense.id;
      await order.save({ transaction: t });
    });

    const full = await SupplierOrder.findByPk(order.id, { include: orderIncludes });
    notifyOk("supplier_order.mark_paid", `Pedido proveedor pagado #${req.params.id}`, {
      supplierOrderId: order.id,
    });
    res.json((await formatSupplierOrdersList([full]))[0]);
  } catch (error) {
    console.error("markSupplierOrderPaid:", error);
    notifyFail("supplier_order.mark_paid_failed", "Error al marcar pedido como pagado", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al marcar pedido como pagado" });
  }
};
