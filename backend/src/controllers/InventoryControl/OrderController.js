import { verifyJWT, getHeaderToken } from "../../libs/jwt.js";

import { InventoryMovement, InventoryProduct, Store } from "../../models/Inventory.js";
import { Customer, Order, OrderItem } from "../../models/Orders.js";
import { Income, ItemGroupItem, Payment } from "../../models/Finance.js";
import { findOpenShiftForAccount } from "./ShiftController.js";
import { format } from 'date-fns';
import { de, es } from 'date-fns/locale';

import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { logger } from "../../log/LogActivity.js";
import { parsePagination, sendPaginated } from "../../utils/pagination.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import {
  adjustStoreStock,
  getDefaultStockStoreId,
  getStoreStockQty,
  storeHoldsInventory,
} from "../../services/storeStockService.js";
import { getAppSettingsSync } from "../../services/appSettingsService.js";
import { consumeBatchesFefo } from "../../services/batchStockService.js";
import {
  ensurePaymentScheduleSchema,
  replaceCustomerInstallments,
  syncCustomerInstallmentsPreservingPaid,
  loadCustomerInstallmentsMap,
  attachInstallmentsToRows,
} from "../../services/orderPaymentScheduleService.js";
import {
  resolveCustomerItemIncomeDate,
  syncOrderItemIncomeDate,
  syncGroupFinanceDates,
} from "../../utils/customerOrderFinanceUtils.js";
import {
  canFinanceCascadeCorrection,
  cleanupOrderItemFinance,
  cleanupCustomerOrderFinance,
} from "../../utils/financeCascadeUtils.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

let orderItemDeliverSchemaReady = false;
let orderItemPackSchemaReady = false;
let orderSellerSchemaReady = false;

async function ensureOrderSellerSchema() {
  if (orderSellerSchemaReady) return;
  try {
    const [found] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_orders` LIKE 'sellerAccountId'",
    );
    if (!Array.isArray(found) || found.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_orders` ADD COLUMN `sellerAccountId` INT NULL",
      );
    }
    orderSellerSchemaReady = true;
  } catch (e) {
    console.warn("ensureOrderSellerSchema:", e?.message || e);
  }
}

async function ensureOrderItemDeliverSchema() {
  if (orderItemDeliverSchemaReady) return;
  try {
    const [found] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_order_items` LIKE 'deliveredStoreId'",
    );
    if (!Array.isArray(found) || found.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_order_items` ADD COLUMN `deliveredStoreId` INT NULL",
      );
    }
  } catch (e) {
    console.warn("ensureOrderItemDeliverSchema:", e?.message || e);
  }
  orderItemDeliverSchemaReady = true;
}

async function ensureOrderItemPackSchema() {
  if (orderItemPackSchemaReady) return;
  const cols = [
    ["packKey", "VARCHAR(64) NULL"],
    ["packName", "VARCHAR(120) NULL"],
    ["lotCode", "VARCHAR(80) NULL"],
    ["expiresAt", "DATE NULL"],
    ["manufacturedAt", "DATE NULL"],
  ];
  for (const [name, ddl] of cols) {
    try {
      const [found] = await sequelize.query(
        `SHOW COLUMNS FROM \`ERP_order_items\` LIKE '${name}'`,
      );
      if (!Array.isArray(found) || found.length === 0) {
        await sequelize.query(
          `ALTER TABLE \`ERP_order_items\` ADD COLUMN \`${name}\` ${ddl}`,
        );
      }
    } catch (e) {
      console.warn(`ensureOrderItemPackSchema ${name}:`, e?.message || e);
    }
  }
  orderItemPackSchemaReady = true;
}

function parseDayOnly(raw) {
  if (raw == null || raw === "") return null;
  const s = String(raw).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function itemPackLotFields(row = {}) {
  const packKey =
    row.packKey != null && String(row.packKey).trim()
      ? String(row.packKey).trim().slice(0, 64)
      : null;
  const packName =
    row.packName != null && String(row.packName).trim()
      ? String(row.packName).trim().slice(0, 120)
      : null;
  const lotCode =
    row.lotCode != null && String(row.lotCode).trim()
      ? String(row.lotCode).trim().slice(0, 80)
      : null;
  const expiresAt = parseDayOnly(row.expiresAt);
  const manufacturedAt = parseDayOnly(row.manufacturedAt);
  if (manufacturedAt && expiresAt && manufacturedAt > expiresAt) {
    throw new Error("La fecha de elaboración no puede ser posterior al vencimiento");
  }
  return { packKey, packName, lotCode, expiresAt, manufacturedAt };
}

function buildCustomerItemPayload(orderId, row) {
  const productId = Number(row.productId);
  const quantity = num(row.quantity);
  const price = num(row.price ?? row.unitPrice);
  if (!productId || quantity <= 0) throw new Error("Ítem inválido en el pedido");
  if (!Number.isFinite(price) || price < 0) throw new Error("Precio inválido en el pedido");
  return {
    orderId,
    productId,
    quantity,
    price,
    ...itemPackLotFields(row),
  };
}

/** null = stock general; número = local inventariable. */
async function resolveDeliverStoreId(body, { transaction, requireExplicit = false } = {}) {
  const multi = getAppSettingsSync()?.multiStockEnabled !== false;
  if (!multi) return null;
  let sid =
    body?.storeId != null && body.storeId !== "" ? Number(body.storeId) : null;
  if (!Number.isFinite(sid) || sid <= 0) {
    if (requireExplicit) {
      throw new Error("Con multistock debes indicar Bodega o sucursal de donde sale el stock.");
    }
    sid = await getDefaultStockStoreId({ transaction });
  }
  const store = await Store.findByPk(sid, { transaction });
  if (!store || !storeHoldsInventory(store.locationKind)) {
    throw new Error("El local de entrega debe ser Bodega o sucursal propia.");
  }
  return Number(store.id);
}

/** Total cobrable de una línea (cantidad − dañado − regalo) × precio. */
function orderItemBillableTotal(item) {
  const qty = num(item?.quantity);
  const billable = Math.max(0, qty - num(item?.damagedQty) - num(item?.giftQty));
  return Number((billable * num(item?.price)).toFixed(2));
}

const CAJA_POS_TAG = "[CAJA_POS]";
const SALE_CREDITO_TAG = "[CREDITO]";

/**
 * Pedidos del calendario/listado:
 * - pedidos manuales (sin [CAJA_POS])
 * - ventas de caja a crédito ([CREDITO] o paymentMethod credito)
 * Se excluyen ventas de caja al contado (efectivo/transferencia).
 */
const pedidosListNotesWhere = {
  [Op.or]: [
    { notes: null },
    { notes: { [Op.notLike]: `%${CAJA_POS_TAG}%` } },
    { notes: { [Op.like]: `%${SALE_CREDITO_TAG}%` } },
    { paymentMethod: "credito" },
  ],
};

/** POST /orders/pos/checkout — venta desde caja con turno abierto. */
export const posCheckout = async (req, res) => {
  try {
    await ensureOrderItemPackSchema();
    await ensureOrderSellerSchema();
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const { accountId } = user;

    const {
      customerId,
      notes,
      items,
      paymentMethod,
      saleType,
      documentType,
      cashRegisterId,
      paymentInstallments,
    } = req.body;
    if (!customerId || !Array.isArray(items) || items.length === 0) {
      notifyFail("order.pos_checkout_failed", "Faltan customerId o items.", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Faltan customerId o items." });
    }

    const notesText = String(notes || "");
    if (!notesText.includes(CAJA_POS_TAG)) {
      notifyFail("order.pos_checkout_failed", "Pedido POS inválido (falta marca de caja).", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Pedido POS inválido (falta marca de caja)." });
    }

    const isCredit = saleType === "credito";
    await ensurePaymentScheduleSchema();
    const docType = ["factura", "nota_venta", "documento", "consumidor_final"].includes(
      String(documentType || ""),
    )
      ? String(documentType)
      : "consumidor_final";
    const shift = await findOpenShiftForAccount(accountId);
    if (!shift) {
      notifyFail("order.pos_checkout_failed", "Abre un turno de caja antes de registrar ventas en el punto de venta.", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({
        message: "Abre un turno de caja antes de registrar ventas en el punto de venta.",
      });
    }

    let resolvedRegisterId = shift.activeCashRegisterId || null;
    if (cashRegisterId != null && cashRegisterId !== "") {
      const wanted = Number(cashRegisterId);
      if (Number.isFinite(wanted)) {
        const { CashRegister } = await import("../../models/CashRegister.js");
        const reg = await CashRegister.findByPk(wanted);
        if (!reg || !reg.isActive || (shift.storeId && reg.storeId !== shift.storeId)) {
          notifyFail("order.pos_checkout_failed", "Caja no válida para este turno", {
            req,
            httpStatus: 400,
          });
          return res.status(400).json({ message: "La caja no pertenece al local del turno." });
        }
        resolvedRegisterId = reg.id;
      }
    }

    const result = await sequelize.transaction(async (t) => {
      const now = new Date();
      const order = await Order.create(
        {
          customerId: Number(customerId),
          notes: notesText,
          date: now,
          status: isCredit ? "pendiente" : "pagado",
          shiftId: shift.id,
          cashRegisterId: resolvedRegisterId,
          sellerAccountId: accountId != null ? Number(accountId) : null,
          paymentMethod: isCredit ? "credito" : paymentMethod || "efectivo",
          paidAt: isCredit ? null : now,
          documentType: docType,
        },
        { transaction: t },
      );

      let orderTotal = 0;
      for (const row of items) {
        const productId = Number(row.productId);
        const qty = Number(row.quantity);
        const price = Number(row.price);
        if (!Number.isFinite(productId) || !Number.isFinite(qty) || qty <= 0) {
          throw new Error("Ítem inválido en el carrito.");
        }
        if (!Number.isFinite(price) || price < 0) {
          throw new Error("Precio inválido en el carrito.");
        }
        orderTotal += Number((price * qty).toFixed(2));

        const product = await InventoryProduct.findByPk(productId, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!product) throw new Error(`Producto #${productId} no encontrado.`);

        // Crédito y contado: el producto ya salió de caja → rebajar stock y marcar entregado.
        // En crédito solo falta cobro (paidAt null → calendario amarillo).
        const stockStoreId = shift.storeId || (await getDefaultStockStoreId({ transaction: t }));
        if (!shift.storeId) {
          throw new Error(
            "El turno no tiene local asignado. Cierra y abre turno en una sucursal propia para vender con stock.",
          );
        }
        const available = await getStoreStockQty(stockStoreId, productId, { transaction: t });
        const autoFill = getAppSettingsSync()?.ordersAllowDeliverStockAdjust !== false;
        if (available < qty) {
          if (!autoFill) {
            throw new Error(
              `Stock insuficiente en este local para ${product.name}. Disponible: ${available}`,
            );
          }
          const deficit = qty - available;
          await adjustStoreStock(stockStoreId, productId, deficit, {
            transaction: t,
            allowNegative: false,
          });
          await InventoryMovement.create(
            {
              productId: product.id,
              quantity: deficit,
              type: "entrada",
              reason: "AJUSTE_ENTRADA",
              referenceType: "order",
              referenceId: order.id,
              date: now,
              createdBy: accountId,
              description: `Autocompletar stock POS · ${product.name} · local #${stockStoreId}`,
            },
            { transaction: t },
          );
        }
        await adjustStoreStock(stockStoreId, productId, -qty, {
          transaction: t,
          allowNegative: false,
        });
        await product.reload({ transaction: t });

        await consumeBatchesFefo({
          productId,
          quantity: qty,
          storeId: stockStoreId,
          transaction: t,
        });

        await InventoryMovement.create(
          {
            productId: product.id,
            quantity: qty,
            type: "salida",
            reason: "SALIDA_VENTA",
            referenceType: "order",
            referenceId: order.id,
            date: now,
            createdBy: accountId,
            description: `Venta POS · pedido #${order.id} · local #${stockStoreId}${
              isCredit ? " · crédito" : ""
            }`,
          },
          { transaction: t },
        );

        const orderItem = await OrderItem.create(
          {
            orderId: order.id,
            productId,
            quantity: qty,
            price,
            soldQty: qty,
            deliveredAt: now,
            paidAt: isCredit ? null : now,
          },
          { transaction: t },
        );

        if (!isCredit) {
          const amount = Number((price * qty).toFixed(2));
          const concept = `Venta POS ${product.name} x${qty} (Ord #${order.id})`;
          await Income.create(
            {
              date: now,
              amount,
              concept,
              category: "Venta",
              referenceType: "order_item",
              referenceId: orderItem.id,
              createdBy: accountId,
            },
            { transaction: t },
          );
        }
      }

      if (isCredit && Array.isArray(paymentInstallments) && paymentInstallments.length > 0) {
        const scheduledTotal = paymentInstallments.reduce(
          (sum, row) => sum + Number(row?.amount || 0),
          0,
        );
        if (Math.abs(scheduledTotal - orderTotal) > 0.009) {
          throw new Error("La suma de las cuotas debe coincidir con el total de la venta.");
        }
        await replaceCustomerInstallments(order.id, paymentInstallments, { transaction: t });
      }

      return order;
    });

    notifyOk("order.pos_checkout", "Cobro en caja POS", { orderId: result.id });
    res.status(201).json({ ok: true, orderId: result.id, order: result });
  } catch (error) {
    console.error("posCheckout:", error);
    notifyFail("order.pos_checkout_failed", error.message || "Error en checkout POS", {
      error,
      req,
      httpStatus: 400,
    });
    res.status(400).json({ message: error.message || "Error en checkout POS" });
  }
};

const CAJA_POS_TAG_EXPORT = "[CAJA_POS]";

/** GET /orders/pos/sales — ventas de caja para facturación e impresión. */
export const getPosSales = async (req, res) => {
  try {
    await ensureOrderItemPackSchema();
    await ensureOrderSellerSchema();
    const limit = Math.min(Number(req.query.limit) || 200, 500);
    const orders = await Order.findAll({
      where: {
        [Op.or]: [
          { notes: { [Op.like]: `%${CAJA_POS_TAG_EXPORT}%` } },
          { documentType: { [Op.ne]: null } },
        ],
      },
      include: [
        { model: Customer, as: "ERP_customer" },
        {
          model: OrderItem,
          as: "ERP_order_items",
          include: [{ model: InventoryProduct, as: "ERP_inventory_product" }],
        },
      ],
      order: [["id", "DESC"]],
      limit,
    });

    const orderIds = orders.map((o) => o.id).filter(Boolean);
    const sellerIds = [
      ...new Set(
        orders
          .map((o) => Number(o.sellerAccountId))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ];

    let invoiceByOrderId = new Map();
    try {
      const { ElectronicInvoice } = await import("../../models/SriBilling.js");
      await ElectronicInvoice.sync();
      try {
        const [found] = await sequelize.query(
          "SHOW COLUMNS FROM `electronic_invoices` LIKE 'iceTotal'",
        );
        if (!Array.isArray(found) || found.length === 0) {
          await sequelize.query(
            "ALTER TABLE `electronic_invoices` ADD COLUMN `iceTotal` DECIMAL(14,4) NOT NULL DEFAULT 0",
          );
        }
      } catch (e) {
        console.warn("getPosSales iceTotal:", e?.message || e);
      }
      if (orderIds.length) {
        const invoices = await ElectronicInvoice.findAll({
          where: { orderId: { [Op.in]: orderIds }, documentType: "01" },
          order: [["id", "DESC"]],
        });
        for (const inv of invoices) {
          const oid = Number(inv.orderId);
          if (!invoiceByOrderId.has(oid)) invoiceByOrderId.set(oid, inv);
        }
      }
    } catch (e) {
      console.warn("getPosSales invoices:", e?.message || e);
    }

    let sellerByAccountId = new Map();
    if (sellerIds.length) {
      try {
        const { Account } = await import("../../models/Account.js");
        const { Users } = await import("../../models/Users.js");
        const accounts = await Account.findAll({
          where: { id: { [Op.in]: sellerIds } },
          include: [{ model: Users, required: false }],
        });
        for (const acc of accounts) {
          const u = acc.users || acc.user || null;
          const person = u
            ? [u.firstName, u.firstLastName].filter(Boolean).join(" ").trim()
            : "";
          const label = (person || acc.username || `Cuenta #${acc.id}`).toUpperCase();
          sellerByAccountId.set(Number(acc.id), label);
        }
      } catch (e) {
        console.warn("getPosSales sellers:", e?.message || e);
      }
    }

    let defaultEst = "001";
    let defaultEmi = "001";
    let defaultEnv = "pruebas";
    try {
      const { SriBillingSettings } = await import("../../models/SriBilling.js");
      const settings = await SriBillingSettings.findByPk(1);
      if (settings) {
        defaultEst = String(settings.establishmentCode || "001").padStart(3, "0");
        defaultEmi = String(settings.emissionPointCode || "001").padStart(3, "0");
        defaultEnv = settings.environment || "pruebas";
      }
    } catch {
      /* ignore */
    }

    const sriStatusLabel = (st) => {
      const map = {
        draft: "Borrador",
        signed: "Firmado",
        sent: "Enviado",
        authorized: "Autorizado",
        rejected: "Rechazado",
        cancelled: "Anulado",
      };
      return map[String(st || "").toLowerCase()] || st || "—";
    };
    const envLabel = (env) =>
      String(env || "").toLowerCase() === "produccion" ? "PRODUCCIÓN" : "PRUEBAS";

    const data = orders.map((order) => {
      const items = (order.ERP_order_items || []).map((item) => {
        const qty = Number(item.soldQty || 0) > 0 ? Number(item.soldQty) : Number(item.quantity || 0);
        const price = Number(item.price || 0);
        const product = item.ERP_inventory_product;
        const taxRate = Number(product?.taxRate || 0);
        const lineTotal = Number((qty * price).toFixed(2));
        let subtotal = lineTotal;
        let iva = 0;
        if (taxRate > 0) {
          subtotal = Number((lineTotal / (1 + taxRate / 100)).toFixed(2));
          iva = Number((lineTotal - subtotal).toFixed(2));
        }
        return {
          id: item.id,
          productId: item.productId,
          name: product?.name || `Producto #${item.productId}`,
          quantity: qty,
          price,
          taxRate,
          subtotal,
          iva,
          lineTotal,
        };
      });
      const total = items.reduce((acc, it) => acc + it.lineTotal, 0);
      const subtotal = items.reduce((acc, it) => acc + it.subtotal, 0);
      const iva = items.reduce((acc, it) => acc + it.iva, 0);
      const customer = order.ERP_customer;
      const inv = invoiceByOrderId.get(Number(order.id)) || null;
      const sellerAccountId =
        order.sellerAccountId != null ? Number(order.sellerAccountId) : null;
      const sellerName =
        (sellerAccountId && sellerByAccountId.get(sellerAccountId)) || "—";

      const establishmentCode = inv
        ? String(inv.establishmentCode || defaultEst).padStart(3, "0")
        : defaultEst;
      const emissionPointCode = inv
        ? String(inv.emissionPointCode || defaultEmi).padStart(3, "0")
        : defaultEmi;
      const sequential = inv?.sequential != null ? Number(inv.sequential) : null;
      const environment = inv?.environment || defaultEnv;
      const ice = inv?.iceTotal != null ? Number(inv.iceTotal) : 0;

      return {
        id: order.id,
        date: order.date,
        paidAt: order.paidAt,
        status: order.status,
        notes: order.notes,
        paymentMethod: order.paymentMethod,
        documentType: order.documentType || inferDocumentTypeFromNotes(order.notes),
        sellerAccountId,
        sellerName,
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              firstName: customer.firstName,
              secondName: customer.secondName,
              firstLastName: customer.firstLastName,
              secondLastName: customer.secondLastName,
              identType: customer.identType,
              cedula: customer.cedula,
              phone: customer.phone,
              email: customer.email,
              address: customer.address,
            }
          : null,
        items,
        subtotal: inv?.subtotal != null ? Number(inv.subtotal) : Number(subtotal.toFixed(2)),
        ice: Number(Number(ice || 0).toFixed(2)),
        iva: inv?.taxTotal != null ? Number(inv.taxTotal) : Number(iva.toFixed(2)),
        total: inv?.total != null ? Number(inv.total) : Number(total.toFixed(2)),
        sri: inv
          ? {
              invoiceId: inv.id,
              status: inv.status,
              statusLabel: sriStatusLabel(inv.status),
              environment,
              environmentLabel: envLabel(environment),
              establishmentCode,
              emissionPointCode,
              estabPtoEmi: `${establishmentCode}-${emissionPointCode}`,
              sequential,
              sequentialLabel:
                sequential != null ? String(sequential).padStart(9, "0") : "—",
              accessKey: inv.accessKey || null,
              authorizationNumber: inv.authorizationNumber || null,
              authorizedAt: inv.authorizedAt || null,
            }
          : {
              invoiceId: null,
              status: null,
              statusLabel: "Sin SRI",
              environment,
              environmentLabel: envLabel(environment),
              establishmentCode,
              emissionPointCode,
              estabPtoEmi: `${establishmentCode}-${emissionPointCode}`,
              sequential: null,
              sequentialLabel: "—",
              accessKey: null,
              authorizationNumber: null,
              authorizedAt: null,
            },
      };
    });

    res.json(data);
  } catch (error) {
    console.error("getPosSales:", error);
    res.status(500).json({ message: "Error al obtener ventas de caja" });
  }
};

function inferDocumentTypeFromNotes(notes) {
  const n = String(notes || "").toLowerCase();
  if (n.includes("consumidor final") || n.includes("mostrador sin datos")) {
    return "consumidor_final";
  }
  return "documento";
}

// Cantidad COBRABLE (venta real)
// - Si existe soldQty => usar soldQty
// - Si no existe => usar quantity (compatibilidad)


// Para detectar si un pedido es de “panadería/consignación”
// Recomendado: un campo boolean en Order o Customer.
// Fallback temporal: notes contiene "#PANADERIA"
const isConsignmentOrder = (itemWithOrder) => {
  const o = itemWithOrder?.ERP_order || itemWithOrder?.ERP_order_items?.ERP_order;
  const c = o?.ERP_customer;
  if (o?.isConsignment === true) return true;
  // if (c?.isBakery === true) return true;
  if (typeof o?.notes === "string" && o.notes.includes("#PANADERIA")) return true;
  return false;
};


// helpers seguros
const toNumOrNull = (v) => {
  if (v === undefined) return undefined;      // no vino => no tocar
  if (v === null) return null;               // vino null => null explícito (si aplica)
  if (v === "") return undefined;            // string vacío => NO tocar (evita pisar con 0)
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined; // si es NaN => no tocar
};

const getBillableQty = (item) => {
  // cobrable = soldQty si existe (>=0), si no, quantity
  const sold = Number(item.soldQty || 0);
  if (sold > 0) return sold;
  return Number(item.quantity || 0);
};

export const updateOrderItem = async (req, res) => {
  const { itemId } = req.params;

  const {
    quantity,
    price,
    soldQty,
    damagedQty,
    giftQty,
    replacedQty,
    paidAt,
    deliveredAt,
  } = req.body;

  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const isDashboardCorrection =
      req.body?.programmerDashboard === true || req.body?.programmerDashboard === "true";
    if (isDashboardCorrection) {
      if (user?.loginRol !== "Programador") {
        notifyFail("order_item.programmer_corrected_failed", "No tenés permiso para esta acción", {
          req,
          httpStatus: 403,
        });
        return res.status(403).json({
          message: "No tenés permiso para esta acción",
        });
      }
      return programmerDashboardOrderItemCorrection(req, res);
    }

    console.log("[updateOrderItem] itemId:", itemId);
    console.log("[updateOrderItem] body:", req.body);

    const result = await sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(itemId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!item) return { status: 404, body: { message: "Ítem no encontrado" } };

      // -------------------------
      // Helpers INLINE (solo aquí)
      // -------------------------
      const toNumber = (v) => {
        if (v === undefined) return undefined; // no tocar
        if (v === null) return null;           // permitir null para fechas (no para qty)
        if (v === "") return undefined;        // no pisar con vacío
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
      };

      const toNonNeg = (v) => {
        const n = toNumber(v);
        if (n === undefined) return undefined;
        if (n === null) return 0;
        return Math.max(0, n);
      };

      const parseDateToggle = (v) => {
        if (v === undefined) return undefined; // no tocar
        if (v === null) return null;           // limpiar
        if (v === true || v === "now") return new Date();
        const d = new Date(v);
        return isNaN(d.getTime()) ? "__INVALID__" : d;
      };

      // -------------------------
      // Payload de UPDATE (solo campos válidos)
      // -------------------------
      const payload = {};

      const q = toNonNeg(quantity);
      if (q !== undefined) payload.quantity = q;

      const p = toNonNeg(price);
      if (p !== undefined) payload.price = p;

      const s = toNonNeg(soldQty);
      if (s !== undefined) payload.soldQty = s;

      const d = toNonNeg(damagedQty);
      if (d !== undefined) payload.damagedQty = d;

      const g = toNonNeg(giftQty);
      if (g !== undefined) payload.giftQty = g;

      const r = toNonNeg(replacedQty);
      if (r !== undefined) payload.replacedQty = r;

      const paidParsed = parseDateToggle(paidAt);
      if (paidParsed === "__INVALID__") {
        return { status: 400, body: { message: "paidAt inválido" } };
      }
      if (paidParsed !== undefined) payload.paidAt = paidParsed;

      const delParsed = parseDateToggle(deliveredAt);
      if (delParsed === "__INVALID__") {
        return { status: 400, body: { message: "deliveredAt inválido" } };
      }
      if (delParsed !== undefined) payload.deliveredAt = delParsed;

      console.log("[updateOrderItem] payload:", payload);

      if (Object.keys(payload).length === 0) {
        return { status: 200, body: { message: "Nada para actualizar (payload vacío)", item } };
      }

      // -------------------------
      // Validación de coherencia
      // -------------------------
      const nextQuantity = payload.quantity ?? item.quantity;
      const nextSold = payload.soldQty ?? item.soldQty;
      const nextDamaged = payload.damagedQty ?? item.damagedQty;
      const nextGift = payload.giftQty ?? item.giftQty;
      const nextReplaced = payload.replacedQty ?? item.replacedQty;

      const totalSalida =
        Number(nextSold || 0) +
        Number(nextDamaged || 0) +
        Number(nextGift || 0) +
        Number(nextReplaced || 0);

      if (totalSalida > Number(nextQuantity || 0) + 1e-9) {
        return {
          status: 400,
          body: { message: "La suma (vendido+dañado+yapa+cambiado) no puede ser mayor que quantity" },
        };
      }

      // -------------------------
      // UPDATE FORZADO (siempre genera UPDATE cuando hay payload)
      // -------------------------
      await OrderItem.update(payload, {
        where: { id: item.id },
        transaction: t,
      });

      const updated = await OrderItem.findByPk(item.id, { transaction: t });

      // -------------------------
      // Income sync (solo si toca dinero)
      // -------------------------
      const touchedMoney =
        ("paidAt" in payload) ||
        ("price" in payload) ||
        ("soldQty" in payload) ||
        ("quantity" in payload);

      if (touchedMoney) {
        const existingIncome = await Income.findOne({
          where: { referenceType: "order_item", referenceId: updated.id },
          transaction: t,
        });

        const billableQty = Number(updated.soldQty || 0) > 0
          ? Number(updated.soldQty || 0)
          : Number(updated.quantity || 0);

        // Si el ítem está en un grupo de cobranzas con abonos, el income es group_payment
        // (no crear/actualizar "Pago ítem #" para no sumar el doble).
        const groupLink = await ItemGroupItem.findOne({
          where: { orderItemId: updated.id },
          transaction: t,
        });
        let groupHasPayments = false;
        if (groupLink?.groupId) {
          const payCount = await Payment.count({
            where: { groupId: groupLink.groupId, status: "completed" },
            transaction: t,
          });
          groupHasPayments = payCount > 0;
        }

        if (groupHasPayments) {
          if (existingIncome) await existingIncome.destroy({ transaction: t });
          if ("paidAt" in payload && payload.paidAt && groupLink?.groupId) {
            await syncGroupFinanceDates(groupLink.groupId, payload.paidAt, t);
          }
        } else if (updated.paidAt) {
          const order = await Order.findByPk(updated.orderId, {
            attributes: ["id", "date"],
            transaction: t,
          });
          const incomeDate = resolveCustomerItemIncomeDate({ orderItem: updated, order });
          const amount = Number((Number(updated.price || 0) * billableQty).toFixed(2));
          const concept = `Pago ítem #${updated.id} (Order #${updated.orderId})`;

          if (existingIncome) {
            await existingIncome.update(
              { amount, date: incomeDate, concept, category: "Venta" },
              { transaction: t }
            );
          } else {
            await Income.create(
              {
                date: incomeDate,
                amount,
                concept,
                category: "Venta",
                referenceType: "order_item",
                referenceId: updated.id,
                createdBy: user.accountId,
              },
              { transaction: t }
            );
          }
        } else {
          if (existingIncome) await existingIncome.destroy({ transaction: t });
        }
      }

      // -------------------------
      // Estado del pedido (pagado si todos pagados)
      // -------------------------
      const allItems = await OrderItem.findAll({
        where: { orderId: updated.orderId },
        attributes: ["paidAt"],
        transaction: t,
      });

      const allPaid = allItems.length > 0 && allItems.every((i) => !!i.paidAt);

      const order = await Order.findByPk(updated.orderId, { transaction: t });
      if (order) {
        order.status = allPaid ? "pagado" : "pendiente";
        await order.save({ transaction: t });
      }

      return { status: 200, body: { message: "Ítem actualizado ✅", item: updated } };
    });

    if (result.status >= 400) {
      notifyFail(
        "order_item.update_failed",
        result.body?.message || "Error al actualizar ítem",
        { req, httpStatus: result.status, extra: { itemId } },
      );
    } else {
      notifyOk("order_item.updated", `Ítem pedido #${itemId}`, { itemId: Number(itemId) });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("updateOrderItem:", error);
    notifyFail("order_item.update_failed", "Error al actualizar ítem", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: "Error al actualizar ítem",
      error: String(error?.message || error),
    });
  }
};


/**
 * @deprecated Mantenimiento one-off: copia order.date → item.deliveredAt para un cliente fijo.
 * Solo accesible en desarrollo vía GET /orders/cmd (Programador). No usar en producción.
 */
export const command = async (req, res) => {
  const customerId = 19;

  try {
    const result = await sequelize.transaction(async (t) => {
      // 1) Traer órdenes del cliente (solo id y date)
      const orders = await Order.findAll({
        where: { customerId },
        attributes: ["id", "date"],
        order: [["id", "ASC"]],
        transaction: t,
      });

      if (!orders.length) {
        return {
          ok: true,
          customerId,
          updatedItems: 0,
          note: "El cliente no tiene órdenes.",
        };
      }

      // 2) Para cada orden: setear ERP_orders_items.deliveredAt = ERP_orders.date
      //    (solo donde deliveredAt está NULL, para no pisar datos ya puestos)
      let updatedItems = 0;

      for (const o of orders) {
        const orderDate = o.date; // ✅ la fecha que quieres copiar
        if (!orderDate) continue;

        const [count] = await OrderItem.update(
          { deliveredAt: orderDate },
          {
            where: {
              orderId: o.id,
              deliveredAt: null, // ✅ solo items sin deliveredAt
            },
            transaction: t,
          }
        );

        updatedItems += Number(count || 0);
      }

      return {
        ok: true,
        customerId,
        updatedItems,
        note: "Se copió ERP_orders.date a ERP_orders_items.deliveredAt (solo donde estaba NULL).",
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("command set items.deliveredAt from orders.date:", error);
    return res.status(500).json({
      mensaje: "Error actualizando deliveredAt en items",
      error: String(error?.message || error),
    });
  }
};

export const closeOrderItemLogistics = async (req, res) => {
  const { itemId } = req.params;
  const { soldQty, damagedQty, giftQty, replacedQty } = req.body;

  const token = getHeaderToken(req);
  let user = null;
  try { user = await verifyJWT(token); }
  catch {
    notifyFail("order_item.update_failed", "No autorizado", { req, httpStatus: 401 });
    return res.status(401).json({ message: "No autorizado" });
  }

  try {
    const result = await sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(itemId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!item) return { status: 404, body: { message: "Ítem no encontrado" } };

      const delivered = num(item.quantity);

      const oldSold = num(item.soldQty);
      const oldDam = num(item.damagedQty);
      const oldGift = num(item.giftQty);
      const oldRep  = num(item.replacedQty);

      const newSold = Math.max(0, num(soldQty));
      const newDam  = Math.max(0, num(damagedQty));
      const newGift = Math.max(0, num(giftQty));
      const newRep  = Math.max(0, num(replacedQty));

      if ((newSold + newDam + newGift + newRep) > delivered) {
        return { status: 400, body: { message: "La suma (vendido+dañado+yapa+reemplazo) no puede ser mayor que lo entregado" } };
      }

      // deltas (para no duplicar movements)
      const dSold = newSold - oldSold;
      const dDam  = newDam  - oldDam;
      const dGift = newGift - oldGift;
      const dRep  = newRep  - oldRep;

      // ⚠️ Recomendación: no permitir bajar (deltas negativos) sin permiso
      const anyNegative = [dSold, dDam, dGift, dRep].some(d => d < 0);
      if (anyNegative) {
        return { status: 400, body: { message: "No se permite reducir valores del cierre. Use un ajuste con autorización." } };
      }

      // ✅ aquí SÍ descontamos stock (salidas reales)
      const product = await InventoryProduct.findByPk(item.productId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!product) return { status: 404, body: { message: "Producto no encontrado" } };

      const totalDeltaOut = dSold + dDam + dGift + dRep;
      if (num(product.stock) < totalDeltaOut) {
        return { status: 400, body: { message: "Stock insuficiente para registrar el cierre" } };
      }

      // bajar stock por total salidas
      product.stock = num(product.stock) - totalDeltaOut;
      await product.save({ transaction: t });

      await consumeBatchesFefo({
        productId: product.id,
        quantity: totalDeltaOut,
        storeId: null,
        transaction: t,
      });

      const createMov = async (qty, reason, desc) => {
        if (qty <= 0) return;
        await InventoryMovement.create({
          productId: item.productId,
          quantity: qty,
          type: "salida",
          reason,
          referenceType: "order_item",
          referenceId: item.id,
          date: new Date(),
          createdBy: user.accountId,
          description: desc,
        }, { transaction: t });
      };

      await createMov(dSold, "SALIDA_VENTA", `Cierre vendido (orderItem #${item.id})`);
      await createMov(dDam,  "SALIDA_DANIADO", `Cierre dañado (orderItem #${item.id})`);
      await createMov(dGift, "SALIDA_YAPA", `Cierre yapa (orderItem #${item.id})`);
      await createMov(dRep,  "SALIDA_REEMPLAZO", `Cierre reemplazo (orderItem #${item.id})`);

      // guardar campos en el item
      await item.update(
        { soldQty: newSold, damagedQty: newDam, giftQty: newGift, replacedQty: newRep },
        { transaction: t }
      );

      return { status: 200, body: { message: "Cierre/logística guardado", item } };
    });

    if (result.status >= 400) {
      notifyFail(
        "order_item.update_failed",
        result.body?.message || "Error en cierre/logística",
        { req, httpStatus: result.status, extra: { itemId } },
      );
    } else {
      notifyOk("order_item.updated", `Cierre ítem pedido #${itemId}`, { itemId: Number(itemId) });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("closeOrderItemLogistics:", error);
    notifyFail("order_item.update_failed", "Error en cierre/logística", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error", error: String(error?.message || error) });
  }
};


export const markItemAsPaid = async (req, res) => {
  const { itemId } = req.params;
  const { paidAt: paidAtBody } = req.body || {};

  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const result = await sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(itemId, {
        include: [
          { model: InventoryProduct, as: "ERP_inventory_product", attributes: ["id", "name"] },
          { model: Order, as: "ERP_order", include: [{ model: Customer, as: "ERP_customer", attributes: ["id", "name"] }] },
        ],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!item) return { status: 404, body: { message: "Item not found" } };
      if (item.paidAt) return { status: 400, body: { message: "Este ítem ya está pagado" } };

      // ✅ Cobrar por vendido (soldQty). Si no existe soldQty, cobra por quantity (compat).
      const billableQty = getBillableQty(item);

      const payDate = resolveCustomerItemIncomeDate({
        explicitDate: paidAtBody,
        orderItem: item,
        order: item.ERP_order,
      });
      item.paidAt = payDate;
      await item.save({ transaction: t });

      const itemTotal = Number((num(item.price) * billableQty).toFixed(2));

      const productName = item.ERP_inventory_product?.name || "Producto";
      const customerName = item.ERP_order?.ERP_customer?.name || "Cliente";

      const concept = `Venta ${productName} x${billableQty} a ${customerName} (Ord #${item.orderId}) $${num(item.price).toFixed(2)}`;

      // Si ya hay abono de grupo de cobranzas, no crear income por ítem (doble conteo).
      const groupLink = await ItemGroupItem.findOne({
        where: { orderItemId: item.id },
        transaction: t,
      });
      let groupHasPayments = false;
      if (groupLink?.groupId) {
        const payCount = await Payment.count({
          where: { groupId: groupLink.groupId, status: "completed" },
          transaction: t,
        });
        groupHasPayments = payCount > 0;
      }

      let income = null;
      if (groupHasPayments) {
        await Income.destroy({
          where: { referenceType: "order_item", referenceId: item.id },
          transaction: t,
        });
      } else {
        const [row, created] = await Income.findOrCreate({
          where: { referenceType: "order_item", referenceId: item.id },
          defaults: {
            date: payDate,
            amount: itemTotal,
            concept,
            category: "Venta",
            createdBy: user.accountId,
            referenceType: "order_item",
            referenceId: item.id,
          },
          transaction: t,
        });
        income = row;
        if (!created) {
          await income.update(
            { amount: itemTotal, date: payDate, concept, category: "Venta" },
            { transaction: t }
          );
        }
      }

      // Recalcula estado del pedido
      const allItems = await OrderItem.findAll({
        where: { orderId: item.orderId },
        attributes: ["paidAt"],
        transaction: t,
      });

      const allPaid = allItems.length > 0 && allItems.every((i) => !!i.paidAt);

      const order = await Order.findByPk(item.orderId, { transaction: t });
      if (order) {
        order.status = allPaid ? "pagado" : "pendiente";
        await order.save({ transaction: t });
      }

      return { status: 200, body: { message: "Ítem marcado como pagado", item, income } };
    });

    if (result.status >= 400) {
      notifyFail(
        "order_item.mark_paid_failed",
        result.body?.message || "Error al marcar ítem como pagado",
        { req, httpStatus: result.status, extra: { itemId } },
      );
    } else {
      notifyOk("order_item.mark_paid", `Ítem pagado #${itemId}`, { itemId: Number(itemId) });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("markItemAsPaid:", error);
    notifyFail("order_item.mark_paid_failed", "Error al marcar ítem como pagado", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error", error: String(error?.message || error) });
  }
};








export const unmarkItemAsPaid = async (req, res) => {
  const { itemId } = req.params;

  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    if (!canFinanceCascadeCorrection(user)) {
      notifyFail("order_item.update_failed", "No tiene permiso para anular cobros", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: "Solo Admin (con config activa) o Programador pueden anular un cobro",
      });
    }

    const result = await sequelize.transaction(async (t) => {
      const item = await OrderItem.findByPk(itemId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!item) return { status: 404, body: { message: "Item not found" } };

      if (!item.paidAt) return { status: 400, body: { message: "Este ítem no está pagado" } };

      item.paidAt = null;
      await item.save({ transaction: t });

      await cleanupOrderItemFinance(item.id, t);

      const allItems = await OrderItem.findAll({
        where: { orderId: item.orderId },
        attributes: ["paidAt"],
        transaction: t,
      });

      const allPaid = allItems.length > 0 && allItems.every((i) => !!i.paidAt);

      const order = await Order.findByPk(item.orderId, { transaction: t });
      if (order) {
        order.status = allPaid ? "pagado" : "pendiente";
        await order.save({ transaction: t });
      }

      return { status: 200, body: { message: "Pago revertido", item } };
    });

    if (result.status >= 400) {
      notifyFail(
        "order_item.update_failed",
        result.body?.message || "Error al revertir pago del ítem",
        { req, httpStatus: result.status, extra: { itemId } },
      );
    } else {
      notifyOk("order_item.updated", `Pago ítem revertido #${itemId}`, { itemId: Number(itemId) });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("unmarkItemAsPaid:", error);
    notifyFail("order_item.update_failed", "Error al revertir pago del ítem", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error", error: String(error?.message || error) });
  }
};


export const markItemAsDelivered = async (req, res) => {
  try {
    await ensureOrderItemDeliverSchema();
    const { itemId } = req.params;
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const item = await OrderItem.findByPk(itemId, {
      include: [
        { model: Order, as: "ERP_order", include: [{ model: Customer, as: "ERP_customer", attributes: ["id", "name"] }] }
      ]
    });

    if (!item) {
      notifyFail("order_item.mark_delivered_failed", "Item not found", {
        req,
        httpStatus: 404,
        extra: { itemId },
      });
      return res.status(404).json({ message: "Item not found" });
    }
    if (item.deliveredAt) {
      notifyFail("order_item.mark_delivered_failed", "Este ítem ya fue marcado como entregado", {
        req,
        httpStatus: 400,
        extra: { itemId },
      });
      return res.status(400).json({ message: "Este ítem ya fue marcado como entregado" });
    }

    // ✅ si es panadería/consignación: NO descontar stock aquí
    const consignment = isConsignmentOrder(item);
    if (consignment) {
      item.deliveredAt = new Date();
      await item.save();
      notifyOk("order_item.mark_delivered", `Ítem entregado #${itemId}`, { itemId: Number(itemId) });
      return res.json({
        message: "Ítem entregado (consignación). La salida real se registra con el cierre (vendido/dañado/yapa).",
        item
      });
    }

    const qty = num(item.quantity);
    const multi = getAppSettingsSync()?.multiStockEnabled !== false;

    await sequelize.transaction(async (t) => {
      const deliverStoreId = await resolveDeliverStoreId(req.body || {}, {
        transaction: t,
        requireExplicit: multi,
      });

      const product = await InventoryProduct.findByPk(item.productId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!product) {
        throw Object.assign(new Error("Producto no encontrado"), { status: 404 });
      }

      if (deliverStoreId) {
        const available = await getStoreStockQty(deliverStoreId, product.id, { transaction: t });
        if (available < qty) {
          throw Object.assign(
            new Error(
              `Stock insuficiente en este local para entregar. Disponible: ${available}, pedido: ${qty}`,
            ),
            { status: 400 },
          );
        }
        await adjustStoreStock(deliverStoreId, product.id, -qty, {
          transaction: t,
          allowNegative: false,
        });
      } else {
        if (num(product.stock) < qty) {
          throw Object.assign(new Error("Stock insuficiente para entregar este ítem"), {
            status: 400,
          });
        }
        await product.update({ stock: num(product.stock) - qty }, { transaction: t });
      }

      await consumeBatchesFefo({
        productId: product.id,
        quantity: qty,
        storeId: deliverStoreId || null,
        transaction: t,
      });

      await InventoryMovement.create(
        {
          productId: item.productId,
          quantity: qty,
          type: "salida",
          reason: "SALIDA_VENTA",
          referenceType: "order_item",
          referenceId: item.id,
          date: new Date(),
          createdBy: user.accountId,
          description: deliverStoreId
            ? `Entrega pedido (orderItem #${item.id}) · local #${deliverStoreId}`
            : `Entrega venta normal (orderItem #${item.id})`,
        },
        { transaction: t },
      );

      item.deliveredAt = new Date();
      if (deliverStoreId) item.deliveredStoreId = deliverStoreId;
      await item.save({ transaction: t });

      const allItems = await OrderItem.findAll({
        where: { orderId: item.orderId },
        transaction: t,
      });
      const allDelivered = allItems.every((i) => !!i.deliveredAt);
      if (allDelivered) {
        const order = await Order.findByPk(item.orderId, { transaction: t });
        if (order && order.status !== "pagado") {
          order.status = "entregado";
          await order.save({ transaction: t });
        }
      }
    });

    await item.reload();
    notifyOk("order_item.mark_delivered", `Ítem entregado #${itemId}`, { itemId: Number(itemId) });
    res.json({ message: "Item delivered, stock updated, and movement recorded", item });
  } catch (error) {
    console.error("Error delivering item:", error);
    const status = error?.status || 500;
    notifyFail("order_item.mark_delivered_failed", error.message || "Error delivering item", {
      error,
      req,
      httpStatus: status,
    });
    res.status(status).json({
      message: error.message || "Error delivering item",
      error: String(error?.message || error),
    });
  }
};

// Crear un nuevo cliente
export const createCustomer = async (req, res) => {
  try {
    const customer = await Customer.create(req.body);
    notifyOk("customer.created", "Cliente creado", { customerId: customer.id });
    res.status(201).json(customer);
  } catch (error) {
    notifyFail("customer.create_failed", "Error al crear cliente", { error, req, httpStatus: 500 });
    res.status(500).json({ message: 'Error al crear cliente', error });
  }
};

// Crear un nuevo pedido
export const createOrder = async (req, res) => {
  try {
    await ensureOrderSellerSchema();
    await ensureOrderItemPackSchema();
    await ensurePaymentScheduleSchema();
    const { customerId, notes, date, items, paymentInstallments } = req.body;

    if (!customerId || !items || items.length === 0) {
      notifyFail("order.create_failed", "Faltan datos del pedido", { req, httpStatus: 400 });
      return res.status(400).json({ message: 'Faltan datos del pedido' });
    }

    const order = await Order.create({
      customerId,
      notes,
      date: date, // usa la fecha enviada, o la actual si no viene
    });

    const createdItems = await Promise.all(
      items.map((item) => OrderItem.create(buildCustomerItemPayload(order.id, item)))
    );

    if (Array.isArray(paymentInstallments)) {
      await replaceCustomerInstallments(order.id, paymentInstallments || []);
    }

    notifyOk("order.created", `Pedido #${order.id}`, { orderId: order.id, customerId });
    res.status(201).json({
      message: "Pedido registrado correctamente",
      order,
      items: createdItems,
    });
  } catch (error) {
    console.error("createOrder:", error);
    notifyFail("order.create_failed", "Error al crear pedido", { error, req, httpStatus: 500 });
    res.status(500).json({ message: error?.message || "Error al crear pedido" });
  }
};


export const markOrderAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByPk(id);

    if (!order) {
      notifyFail("order.mark_paid_failed", `Pedido #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    if (order.status === 'pagado') {
      notifyFail("order.mark_paid_failed", "El pedido ya está marcado como pagado", {
        req,
        httpStatus: 400,
        extra: { orderId: id },
      });
      return res.status(400).json({ message: 'El pedido ya está marcado como pagado' });
    }

    order.status = 'pagado';
    await order.save();

    notifyOk("order.mark_paid", `Pedido pagado #${id}`, { orderId: Number(id) });
    res.json({ message: 'Pedido marcado como pagado', order });
  } catch (error) {
    notifyFail("order.mark_paid_failed", "Error al marcar pedido como pagado", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: 'Error al marcar pedido como pagado', error });
  }
};

export const unmarkOrderAsPaid = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const { id } = req.params;

    if (!canFinanceCascadeCorrection(user)) {
      notifyFail("order.unmark_paid_failed", "No tiene permiso para anular cobros", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: "Solo Admin (con config activa) o Programador pueden anular cobros",
      });
    }

    const result = await sequelize.transaction(async (t) => {
      const order = await Order.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!order) return { status: 404, body: { message: "Pedido no encontrado" } };

      await cleanupCustomerOrderFinance(order.id, t);
      await OrderItem.update({ paidAt: null }, { where: { orderId: order.id }, transaction: t });
      order.status = "pendiente";
      await order.save({ transaction: t });

      return { status: 200, body: { message: "Cobro anulado (ingresos vinculados eliminados)", order } };
    });

    if (result.status >= 400) {
      notifyFail("order.unmark_paid_failed", result.body?.message || "Error al anular cobro", {
        req,
        httpStatus: result.status,
        extra: { orderId: id },
      });
    } else {
      notifyOk("order.unmark_paid", `Cobro anulado pedido #${id}`, { orderId: Number(id) });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    notifyFail("order.unmark_paid_failed", "Error al anular cobro del pedido", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error al anular cobro", error: String(error?.message || error) });
  }
};

export const deleteOrderItem = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const item = await OrderItem.findByPk(req.params.id);
    if (!item) {
      notifyFail("order_item.delete_failed", `Ítem #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Ítem no encontrado" });
    }

    if (item.paidAt && !canFinanceCascadeCorrection(user)) {
      notifyFail("order_item.delete_failed", "No se puede eliminar un ítem ya cobrado", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: "Anule el cobro primero o use Admin/Programador con correcciones financieras activas",
      });
    }

    await sequelize.transaction(async (t) => {
      await cleanupOrderItemFinance(item.id, t);
      await item.destroy({ transaction: t });
    });

    notifyOk("order_item.deleted", `Ítem pedido #${req.params.id}`, { itemId: Number(req.params.id) });
    res.json({ message: "Ítem eliminado correctamente (ingreso vinculado eliminado si existía)" });
  } catch (error) {
    notifyFail("order_item.delete_failed", "Error al eliminar ítem", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al eliminar ítem", error });
  }
};
export const deleteOrder = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const order = await Order.findByPk(req.params.id, {
      include: [{ model: OrderItem, as: "ERP_order_items", attributes: ["id", "paidAt"] }],
    });
    if (!order) {
      notifyFail("order.delete_failed", `Pedido #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Orden no encontrado" });
    }

    const items = order.ERP_order_items || [];
    const hasPaid = items.some((i) => i.paidAt) || order.status === "pagado";
    if (hasPaid && !canFinanceCascadeCorrection(user)) {
      notifyFail("order.delete_failed", "No se puede eliminar un pedido con cobros", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: "Anule los cobros primero o use Admin/Programador con correcciones financieras activas",
      });
    }

    await sequelize.transaction(async (t) => {
      await cleanupCustomerOrderFinance(order.id, t);
      await order.destroy({ transaction: t });
    });

    notifyOk("order.deleted", `Pedido #${req.params.id}`, { orderId: Number(req.params.id) });
    res.json({ message: "Orden eliminada (ingresos/abonos vinculados eliminados si existían)" });
  } catch (error) {
    notifyFail("order.delete_failed", "Error al eliminar Orden", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al eliminar Orden", error });
  }
};
// Editar un pedido y su cliente
export const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { customerId, notes, date, items, paymentInstallments } = req.body ?? {};

    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const order = await Order.findByPk(id);
    if (!order) {
      notifyFail("order.update_failed", `Pedido #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    const isPrivileged = ['Administrador', 'Programador'].includes(user?.loginRol);
    if (['entregado', 'pagado'].includes(order.status) && !isPrivileged) {
      notifyFail("order.update_failed", `No tiene permisos para editar pedidos ${order.status}`, {
        req,
        httpStatus: 403,
        extra: { orderId: id },
      });
      return res.status(403).json({
        message: `No tiene permisos para editar pedidos ${order.status}`,
      });
    }

    const updates = {};

    if (typeof customerId !== 'undefined') {
      if (customerId === null || Number.isNaN(Number(customerId))) {
        notifyFail("order.update_failed", "customerId inválido", { req, httpStatus: 400, extra: { orderId: id } });
        return res.status(400).json({ message: 'customerId inválido' });
      }
      updates.customerId = customerId;
    }

    if (typeof notes !== 'undefined') {
      updates.notes = String(notes);
    }

    if (typeof date !== 'undefined') {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        notifyFail("order.update_failed", "Formato de fecha inválido", { req, httpStatus: 400, extra: { orderId: id } });
        return res.status(400).json({ message: 'Formato de fecha inválido' });
      }
      updates.date = parsed;
    }

    const hasItems = Array.isArray(items);
    const hasPaymentInstallments = paymentInstallments !== undefined;
    if (!hasItems && Object.keys(updates).length === 0 && !hasPaymentInstallments) {
      notifyFail("order.update_failed", "No se enviaron campos válidos para actualizar", {
        req,
        httpStatus: 400,
        extra: { orderId: id },
      });
      return res.status(400).json({ message: 'No se enviaron campos válidos para actualizar' });
    }

    if (hasItems) {
      await ensureOrderItemPackSchema();
      if (items.length === 0) {
        notifyFail("order.update_failed", "El pedido debe tener al menos un producto", {
          req,
          httpStatus: 400,
          extra: { orderId: id },
        });
        return res.status(400).json({ message: 'El pedido debe tener al menos un producto' });
      }
    }

    await sequelize.transaction(async (transaction) => {
      if (Object.keys(updates).length > 0) {
        await order.update(updates, { transaction });
      }

      if (!hasItems) return;

      const existing = await OrderItem.findAll({
        where: { orderId: order.id },
        transaction,
      });
      const byId = new Map(existing.map((it) => [Number(it.id), it]));
      const keepIds = new Set();

      for (const row of items) {
        const payload = buildCustomerItemPayload(order.id, row);
        const rowId = row?.id != null ? Number(row.id) : null;
        const found = Number.isFinite(rowId) ? byId.get(rowId) : null;
        if (found) {
          await found.update(payload, { transaction });
          keepIds.add(Number(found.id));
        } else {
          const created = await OrderItem.create(payload, { transaction });
          keepIds.add(Number(created.id));
        }
      }

      for (const it of existing) {
        if (!keepIds.has(Number(it.id))) {
          await it.destroy({ transaction });
        }
      }
    });

    if (paymentInstallments !== undefined) {
      const orderWithItems = await Order.findByPk(id, {
        include: [{ model: OrderItem, as: "ERP_order_items" }],
      });
      const [formatted] = await formatOrdersList([orderWithItems]);
      await syncCustomerInstallmentsPreservingPaid(
        id,
        paymentInstallments,
        formatted?.paidAmount || 0,
      );
    }

    notifyOk("order.updated", `Pedido #${id}`, { orderId: Number(id) });
    return res.json({ message: "Pedido actualizado correctamente", order });
  } catch (error) {
    console.error('Error al actualizar pedido:', error);
    notifyFail("order.update_failed", "Error al actualizar pedido", { error, req, httpStatus: 500 });
    return res.status(500).json({
      message: error?.message || 'Error al actualizar pedido',
      error: String(error?.message || error),
    });
  }
};

/** POST /orders/:orderId/items — agregar línea a pedido existente (solo Admin / Programador). */
export const addOrderItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId, quantity, price } = req.body ?? {};

    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const isPrivileged = ['Administrador', 'Programador'].includes(user?.loginRol);
    if (!isPrivileged) {
      notifyFail("order_item.create_failed", "No tenés permiso para agregar productos a un pedido existente", {
        req,
        httpStatus: 403,
      });
      return res.status(403).json({
        message: 'No tenés permiso para agregar productos a un pedido existente',
      });
    }

    const order = await Order.findByPk(orderId);
    if (!order) {
      notifyFail("order_item.create_failed", `Pedido #${orderId} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    const pid = Number(productId);
    const qty = Number(quantity);
    const pr = Number(price);
    if (!Number.isFinite(pid) || pid <= 0) {
      notifyFail("order_item.create_failed", "productId inválido", { req, httpStatus: 400, extra: { orderId } });
      return res.status(400).json({ message: 'productId inválido' });
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      notifyFail("order_item.create_failed", "Cantidad inválida", { req, httpStatus: 400, extra: { orderId } });
      return res.status(400).json({ message: 'Cantidad inválida' });
    }
    if (!Number.isFinite(pr) || pr < 0) {
      notifyFail("order_item.create_failed", "Precio inválido", { req, httpStatus: 400, extra: { orderId } });
      return res.status(400).json({ message: 'Precio inválido' });
    }

    const product = await InventoryProduct.findByPk(pid);
    if (!product) {
      notifyFail("order_item.create_failed", "Producto no encontrado", { req, httpStatus: 404, extra: { orderId } });
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const item = await OrderItem.create({
      orderId: order.id,
      productId: pid,
      quantity: qty,
      price: pr,
    });

    notifyOk("order_item.created", `Ítem pedido #${orderId}`, {
      orderId: order.id,
      itemId: item.id,
    });
    return res.status(201).json({ message: 'Ítem agregado', item });
  } catch (error) {
    console.error('addOrderItem:', error);
    notifyFail("order_item.create_failed", "Error al agregar ítem al pedido", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: 'Error al agregar ítem al pedido',
      error: String(error?.message || error),
    });
  }
};






// Cambiar el estado del pedido
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = await Order.findByPk(id);
    if (!order) {
      notifyFail("order.status_change_failed", `Pedido #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    order.status = status;
    await order.save();
    notifyOk("order.status_changed", `Estado pedido #${id}`, { orderId: Number(id), status });
    res.json({ message: 'Estado actualizado', order });
  } catch (error) {
    notifyFail("order.status_change_failed", "Error al actualizar estado del pedido", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: 'Error al actualizar estado del pedido', error });
  }
};

/**
 * PATCH /orders/order-items/:itemId/programmer-dashboard
 * Solo Programador: entrega/pago con fecha elegida y stock directo.
 * Sin movimientos de inventario ni ingresos automáticos; queda en Logs.
 */
export const programmerDashboardOrderItemCorrection = async (req, res) => {
  const { itemId } = req.params;
  const { deliveredAt, paidAt, stock, minStock, productId } = req.body ?? {};

  const parseDateField = (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "__INVALID__" : d;
  };

  try {
    const item = await OrderItem.findByPk(itemId);
    if (!item) {
      notifyFail("order_item.programmer_corrected_failed", "Ítem no encontrado", {
        req,
        httpStatus: 404,
        extra: { itemId },
      });
      return res.status(404).json({ message: "Ítem no encontrado" });
    }

    const itemPayload = {};
    const logParts = [];

    const delParsed = parseDateField(deliveredAt);
    if (delParsed === "__INVALID__") {
      notifyFail("order_item.programmer_corrected_failed", "Fecha de entrega inválida", {
        req,
        httpStatus: 400,
        extra: { itemId },
      });
      return res.status(400).json({ message: "Fecha de entrega inválida" });
    }
    if (delParsed !== undefined) {
      itemPayload.deliveredAt = delParsed;
      const prev = item.deliveredAt ? new Date(item.deliveredAt).toISOString() : "—";
      const next = delParsed ? delParsed.toISOString() : "—";
      logParts.push(`entrega ${prev} → ${next}`);
    }

    const paidParsed = parseDateField(paidAt);
    if (paidParsed === "__INVALID__") {
      notifyFail("order_item.programmer_corrected_failed", "Fecha de pago inválida", {
        req,
        httpStatus: 400,
        extra: { itemId },
      });
      return res.status(400).json({ message: "Fecha de pago inválida" });
    }
    if (paidParsed !== undefined) {
      itemPayload.paidAt = paidParsed;
      const prev = item.paidAt ? new Date(item.paidAt).toISOString() : "—";
      const next = paidParsed ? paidParsed.toISOString() : "—";
      logParts.push(`pago ${prev} → ${next}`);
    }

    let productRow = null;
    const pid = productId != null ? Number(productId) : null;
    const stockTouched = stock !== undefined && stock !== null && stock !== "";
    const minTouched = minStock !== undefined && minStock !== null && minStock !== "";

    if ((stockTouched || minTouched) && pid) {
      productRow = await InventoryProduct.findByPk(pid);
      if (!productRow) {
        notifyFail("order_item.programmer_corrected_failed", "Producto no encontrado", {
          req,
          httpStatus: 404,
          extra: { itemId },
        });
        return res.status(404).json({ message: "Producto no encontrado" });
      }
    }

    const productUpdates = {};
    if (productRow && stockTouched) {
      const n = Number(stock);
      if (!Number.isFinite(n) || n < 0) {
        notifyFail("order_item.programmer_corrected_failed", "Stock inválido", {
          req,
          httpStatus: 400,
          extra: { itemId },
        });
        return res.status(400).json({ message: "Stock inválido" });
      }
      productUpdates.stock = n;
    }
    if (productRow && minTouched) {
      const n = Number(minStock);
      if (!Number.isFinite(n) || n < 0) {
        notifyFail("order_item.programmer_corrected_failed", "Stock mínimo inválido", {
          req,
          httpStatus: 400,
          extra: { itemId },
        });
        return res.status(400).json({ message: "Stock mínimo inválido" });
      }
      productUpdates.minStock = n;
    }

    if (
      !Object.keys(itemPayload).length &&
      !Object.keys(productUpdates).length
    ) {
      notifyFail("order_item.programmer_corrected_failed", "No hay cambios para registrar", {
        req,
        httpStatus: 400,
        extra: { itemId },
      });
      return res.status(400).json({ message: "No hay cambios para registrar" });
    }

    await sequelize.transaction(async (t) => {
      if (Object.keys(itemPayload).length) {
        await OrderItem.update(itemPayload, {
          where: { id: item.id },
          transaction: t,
        });

        const allItems = await OrderItem.findAll({
          where: { orderId: item.orderId },
          attributes: ["paidAt"],
          transaction: t,
        });
        const allPaid =
          allItems.length > 0 && allItems.every((i) => !!i.paidAt);
        const order = await Order.findByPk(item.orderId, { transaction: t });
        if (order) {
          order.status = allPaid ? "pagado" : "pendiente";
          await order.save({ transaction: t });
        }

        if (paidParsed !== undefined && paidParsed) {
          await syncOrderItemIncomeDate(item.id, paidParsed, t);
          const groupLink = await ItemGroupItem.findOne({
            where: { orderItemId: item.id },
            transaction: t,
          });
          if (groupLink?.groupId) {
            await syncGroupFinanceDates(groupLink.groupId, paidParsed, t);
          }
        }
      }

      if (productRow && Object.keys(productUpdates).length) {
        const prevStock = Number(productRow.stock ?? 0);
        const prevMin = Number(productRow.minStock ?? 0);
        await productRow.update(productUpdates, { transaction: t });
        await productRow.reload({ transaction: t });
        logParts.push(
          `stock "${productRow.name}" ${prevStock} → ${Number(productRow.stock ?? 0)}, min ${prevMin} → ${Number(productRow.minStock ?? 0)}`,
        );
      }
    });

    const updatedItem = await OrderItem.findByPk(item.id, {
      include: [
        {
          model: InventoryProduct,
          as: "ERP_inventory_product",
          attributes: ["id", "name", "stock", "minStock"],
        },
      ],
    });

    logger({
      httpMethod: "PATCH",
      endPoint: `/orders/order-items/${itemId}/programmer-dashboard`,
      action: "Corrección dashboard estados de pedido",
      description: `Pedido #${item.orderId}, ítem #${itemId}. ${logParts.join("; ")}. Sin movimientos de inventario ni ingresos automáticos.`,
      system: req.headers["user-agent"] || "dashboard",
    });

    const formatted = updatedItem
      ? {
          ...updatedItem.toJSON(),
          paidAt: updatedItem.paidAt
            ? format(new Date(updatedItem.paidAt), "dd/MM/yyyy HH:mm:ss", { locale: es })
            : null,
          deliveredAt: updatedItem.deliveredAt
            ? format(new Date(updatedItem.deliveredAt), "dd/MM/yyyy HH:mm:ss", {
                locale: es,
              })
            : null,
          productStock: Number(
            updatedItem.ERP_inventory_product?.stock ?? productRow?.stock ?? 0,
          ),
          productMinStock: Number(
            updatedItem.ERP_inventory_product?.minStock ?? productRow?.minStock ?? 0,
          ),
        }
      : null;

    notifyOk("order_item.programmer_corrected", `Corrección ítem #${itemId}`, {
      itemId: Number(itemId),
      orderId: item.orderId,
    });
    return res.json({
      message: "Cambios registrados (solo Logs, sin movimientos ni ingresos)",
      item: formatted,
    });
  } catch (error) {
    console.error("programmerDashboardOrderItemCorrection:", error);
    notifyFail("order_item.programmer_corrected_failed", "Error al registrar corrección", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: "Error al registrar corrección",
      error: error.message,
    });
  }
};

export const getOrderStatusWorkbench = async (req, res) => {
  try {
    await ensureOrderItemPackSchema();
    const orders = await Order.findAll({
      where: pedidosListNotesWhere,
      include: [
        { model: Customer, as: "ERP_customer" },
        {
          model: OrderItem,
          as: "ERP_order_items",
          include: [
            {
              model: InventoryProduct,
              as: "ERP_inventory_product",
              attributes: ["id", "name", "stock", "minStock"],
            },
          ],
        },
      ],
      order: [["date", "DESC"]],
    });

    const formatted = (await formatOrdersList(orders)).map((order) => ({
      ...order,
      ERP_order_items: order.ERP_order_items.map((item) => ({
        ...item,
        productName: item.ERP_inventory_product?.name ?? null,
        productStock: Number(item.ERP_inventory_product?.stock ?? 0),
        productMinStock: Number(item.ERP_inventory_product?.minStock ?? 0),
      })),
    }));

    let unpaid = 0;
    let paidUndelivered = 0;
    let unpaidUndelivered = 0;
    let deliveredUnpaid = 0;

    for (const order of formatted) {
      const items = order.ERP_order_items || [];
      if (!items.length) continue;
      const allPaid = items.every((i) => !!i.paidAt);
      const allDelivered = items.every((i) => !!i.deliveredAt);
      if (!allPaid) unpaid += 1;
      if (allPaid && !allDelivered) paidUndelivered += 1;
      if (!allPaid && !allDelivered) unpaidUndelivered += 1;
      if (allDelivered && !allPaid) deliveredUnpaid += 1;
    }

    const overview = [
      { id: "unpaidOrders", label: "No Pagados", value: unpaid },
      { id: "paidUndeliveredOrders", label: "Pagados no Entregados", value: paidUndelivered },
      { id: "unpaidUndeliveredOrders", label: "No Pagados ni Entregados", value: unpaidUndelivered },
      { id: "deliveredUnpaidOrders", label: "Entregados no Pagados", value: deliveredUnpaid },
    ];

    res.json({ orders: formatted, overview });
  } catch (error) {
    console.error("getOrderStatusWorkbench:", error);
    res.status(500).json({ message: "Error al cargar estados de pedido" });
  }
};

// Obtener pedidos con items y cliente. Query opcional: ?from=YYYY-MM-DD&to=YYYY-MM-DD
/**
 * Formatea pedidos de cliente e incluye paidAmount/remainingAmount según abonos
 * de grupos de cobranzas (misma lógica que proveedores: progreso por monto).
 */
async function formatOrdersList(orders) {
  const list = Array.isArray(orders) ? orders : [];
  const baseRows = list.map((order) => {
    const itemsSrc = order.ERP_order_items || [];
    const formattedItems = itemsSrc.map((item) => {
      const raw = typeof item.toJSON === "function" ? item.toJSON() : { ...item };
      return {
        ...raw,
        paidAt: item.paidAt
          ? format(new Date(item.paidAt), "dd/MM/yyyy HH:mm:ss", { locale: es })
          : null,
        deliveredAt: item.deliveredAt
          ? format(new Date(item.deliveredAt), "dd/MM/yyyy HH:mm:ss", { locale: es })
          : null,
      };
    });

    const orderJson = typeof order.toJSON === "function" ? order.toJSON() : { ...order };
    return {
      ...orderJson,
      orderKind: "customer",
      date: format(new Date(order.date), "dd/MM/yyyy HH:mm:ss", { locale: es }),
      createdAt: format(new Date(order.createdAt), "dd/MM/yyyy HH:mm:ss", { locale: es }),
      updatedAt: format(new Date(order.updatedAt), "dd/MM/yyyy HH:mm:ss", { locale: es }),
      ERP_order_items: formattedItems,
    };
  });

  const allItemIds = [];
  const itemBillableById = new Map();
  const orderIdByItemId = new Map();

  for (const row of baseRows) {
    for (const it of row.ERP_order_items || []) {
      const id = Number(it.id);
      if (!Number.isFinite(id)) continue;
      allItemIds.push(id);
      itemBillableById.set(id, orderItemBillableTotal(it));
      orderIdByItemId.set(id, Number(row.id));
    }
  }

  /** groupId -> paidAmount (pagos completed) */
  const paidByGroupId = new Map();
  /** groupId -> Map<itemId, billable> (todos los ítems del grupo) */
  const groupItemTotals = new Map();

  if (allItemIds.length > 0) {
    const linkRows = await ItemGroupItem.findAll({
      where: { orderItemId: { [Op.in]: allItemIds } },
      attributes: ["groupId", "orderItemId"],
    });
    const groupIds = [
      ...new Set(
        linkRows
          .map((r) => Number(r.groupId))
          .filter((gid) => Number.isFinite(gid))
      ),
    ];

    if (groupIds.length > 0) {
      const [allGroupLinks, payments] = await Promise.all([
        ItemGroupItem.findAll({
          where: { groupId: { [Op.in]: groupIds } },
          attributes: ["groupId", "orderItemId"],
        }),
        Payment.findAll({
          where: { groupId: { [Op.in]: groupIds }, status: "completed" },
          attributes: ["groupId", "amount"],
        }),
      ]);

      const missingItemIds = [
        ...new Set(
          allGroupLinks
            .map((r) => Number(r.orderItemId))
            .filter((id) => Number.isFinite(id) && !itemBillableById.has(id))
        ),
      ];
      if (missingItemIds.length > 0) {
        const extraItems = await OrderItem.findAll({
          where: { id: { [Op.in]: missingItemIds } },
          attributes: ["id", "quantity", "price", "damagedQty", "giftQty"],
        });
        for (const it of extraItems) {
          itemBillableById.set(Number(it.id), orderItemBillableTotal(it));
        }
      }

      for (const r of allGroupLinks) {
        const gid = Number(r.groupId);
        const iid = Number(r.orderItemId);
        if (!Number.isFinite(gid) || !Number.isFinite(iid)) continue;
        if (!groupItemTotals.has(gid)) groupItemTotals.set(gid, new Map());
        groupItemTotals.get(gid).set(iid, num(itemBillableById.get(iid) || 0));
      }

      for (const p of payments) {
        const gid = Number(p.groupId);
        if (!Number.isFinite(gid)) continue;
        paidByGroupId.set(
          gid,
          Number(((paidByGroupId.get(gid) || 0) + num(p.amount)).toFixed(2))
        );
      }
    }
  }

  /** Abono atribuido a cada pedido (proporción del grupo + ítems pagados fuera de grupo). */
  const paidByOrderId = new Map();

  for (const [gid, itemMap] of groupItemTotals.entries()) {
    const groupTotal = Number(
      [...itemMap.values()].reduce((s, v) => s + num(v), 0).toFixed(2)
    );
    const groupPaid = num(paidByGroupId.get(gid) || 0);
    if (groupTotal <= 0 || groupPaid <= 0) continue;

    const shareByOrder = new Map();
    for (const [iid, lineTotal] of itemMap.entries()) {
      const oid = orderIdByItemId.get(iid);
      if (!Number.isFinite(oid)) continue;
      shareByOrder.set(oid, Number(((shareByOrder.get(oid) || 0) + num(lineTotal)).toFixed(2)));
    }
    const entries = [...shareByOrder.entries()];
    let allocated = 0;
    entries.forEach(([oid, share], idx) => {
      const alloc =
        idx === entries.length - 1
          ? Number((groupPaid - allocated).toFixed(2))
          : Number(((groupPaid * share) / groupTotal).toFixed(2));
      if (idx < entries.length - 1) {
        allocated = Number((allocated + alloc).toFixed(2));
      }
      paidByOrderId.set(
        oid,
        Number(((paidByOrderId.get(oid) || 0) + alloc).toFixed(2))
      );
    });
  }

  const rowsWithPaid = baseRows.map((row) => {
    const items = row.ERP_order_items || [];
    const totalAmount = Number(
      items.reduce((s, it) => s + orderItemBillableTotal(it), 0).toFixed(2)
    );

    let paidAmount = num(paidByOrderId.get(Number(row.id)) || 0);

    // Piso: ítems ya marcados como pagados (legacy / cierre de grupo).
    const paidAtFloor = Number(
      items
        .filter((it) => !!it.paidAt)
        .reduce((s, it) => s + orderItemBillableTotal(it), 0)
        .toFixed(2)
    );
    if (paidAmount <= 0.009 && items.length > 0 && items.every((it) => !!it.paidAt)) {
      paidAmount = totalAmount;
    } else {
      paidAmount = Number(Math.max(paidAmount, paidAtFloor).toFixed(2));
    }
    paidAmount = Number(Math.min(paidAmount, totalAmount).toFixed(2));
    const remainingAmount = Number(Math.max(0, totalAmount - paidAmount).toFixed(2));

    return {
      ...row,
      totalAmount,
      paidAmount,
      remainingAmount,
    };
  });

  await ensurePaymentScheduleSchema();
  const instMap = await loadCustomerInstallmentsMap(baseRows.map((r) => r.id));
  return attachInstallmentsToRows(rowsWithPaid, instMap);
}

function parseRangeDate(value, endOfDay = false) {
  if (!value || typeof value !== "string") return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  return d;
}

export const getAllOrders = async (req, res) => {
  try {
    await ensureOrderSellerSchema();
    await ensureOrderItemPackSchema();
    await ensurePaymentScheduleSchema();
    const fromDate = parseRangeDate(req.query.from, false);
    const toDate = parseRangeDate(req.query.to, true);
    const pagination = parsePagination(req, { defaultPageSize: 100 });

    const where = {
      ...pedidosListNotesWhere,
    };
    if (fromDate || toDate) {
      where.date = {};
      if (fromDate) where.date[Op.gte] = fromDate;
      if (toDate) where.date[Op.lte] = toDate;
    }

    const include = [
      {
        model: Customer,
        as: "ERP_customer",
      },
      {
        model: OrderItem,
        as: "ERP_order_items",
        include: [
          {
            model: InventoryProduct,
            as: "ERP_inventory_product",
          },
        ],
      },
    ];

    if (pagination.all) {
      const orders = await Order.findAll({
        where,
        include,
        order: [["date", "DESC"]],
      });
      return res.json(await formatOrdersList(orders));
    }

    const { count, rows } = await Order.findAndCountAll({
      where,
      include,
      order: [["date", "DESC"]],
      offset: pagination.offset,
      limit: pagination.limit,
      distinct: true,
    });

    return sendPaginated(res, {
      rows: await formatOrdersList(rows),
      total: count,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  } catch (error) {
    console.error("getAllOrders:", error);
    res.status(500).json({ message: "Error al obtener pedidos" });
  }
};


