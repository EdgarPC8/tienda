/**
 * Cuentas por pagar a proveedores: abonos parciales ligados a pedidos.
 */
import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { getHeaderToken, verifyJWT } from "../../libs/jwt.js";
import { toAppDateTime, nowApp } from "../../utils/appDateTime.js";
import {
  Supplier,
  SupplierOrder,
  SupplierOrderItem,
} from "../../models/Orders.js";
import { InventoryProduct } from "../../models/Inventory.js";
import { Expense, SupplierOrderPayment, SupplierPack, SupplierPackItem } from "../../models/Finance.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import {
  ensurePaymentScheduleSchema,
  loadSupplierInstallmentsMap,
  attachInstallmentsToRows,
} from "../../services/orderPaymentScheduleService.js";
import { resolveSupplierOrderPayDate } from "../../utils/supplierOrderFinanceUtils.js";

const toNum = (v, d = 0) => {
  const n = Number(v ?? d);
  return Number.isFinite(n) ? n : d;
};

const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;
const round4 = (n) => Math.round((toNum(n) + Number.EPSILON) * 10000) / 10000;

function orderTotal(items = []) {
  let sub = 0;
  let iva = 0;
  for (const it of items) {
    const gross = toNum(it.quantity) * toNum(it.unitPrice);
    const disc = Math.max(0, toNum(it.discount));
    const line = Math.max(0, gross - disc);
    sub += line;
    iva += line * (toNum(it.taxRate) / 100);
  }
  return round2(round2(sub) + round2(iva));
}

function isoDateOnly(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

let schemaReady = false;

/** Asegura tablas de pacas + columna supplierPackId sin usar sync({ alter }) (rompe FKs en MySQL). */
async function ensureSupplierPayablesSchema() {
  if (schemaReady) return;
  try {
    await SupplierPack.sync();
    await SupplierPackItem.sync();
    await SupplierOrderPayment.sync();

    const [cols] = await sequelize.query(
      `SHOW COLUMNS FROM \`ERP_finance_supplier_order_payments\` LIKE 'supplierPackId'`
    );
    if (!Array.isArray(cols) || cols.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`ERP_finance_supplier_order_payments\`
         ADD COLUMN \`supplierPackId\` INT NULL
         COMMENT 'Paca/cartón de compra (opcional)'
         AFTER \`supplierId\``
      );
    }

    const [prevCols] = await sequelize.query(
      `SHOW COLUMNS FROM \`ERP_finance_supplier_pack_items\` LIKE 'previousUnitPrice'`
    );
    if (!Array.isArray(prevCols) || prevCols.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`ERP_finance_supplier_pack_items\`
         ADD COLUMN \`previousUnitPrice\` DECIMAL(10,4) NULL
         COMMENT 'Precio unitario antes de armar la paca'`
      );
    }

    const [kindCols] = await sequelize.query(
      `SHOW COLUMNS FROM \`ERP_finance_supplier_packs\` LIKE 'kind'`
    );
    if (!Array.isArray(kindCols) || kindCols.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`ERP_finance_supplier_packs\`
         ADD COLUMN \`kind\` ENUM('carton','order_group') NOT NULL DEFAULT 'carton'
         COMMENT 'carton=paca; order_group=grupo de pago por pedidos'`
      );
    }

    const [memberCols] = await sequelize.query(
      `SHOW COLUMNS FROM \`ERP_finance_supplier_packs\` LIKE 'memberOrderIds'`
    );
    if (!Array.isArray(memberCols) || memberCols.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`ERP_finance_supplier_packs\`
         ADD COLUMN \`memberOrderIds\` TEXT NULL
         COMMENT 'JSON de orderIds del grupo de pago'`
      );
    }

    // Columna del modelo SupplierOrder; sin esto el workbench rompe con ER_BAD_FIELD_ERROR.
    const [invoiceCols] = await sequelize.query(
      `SHOW COLUMNS FROM \`ERP_supplier_orders\` LIKE 'invoiceNumber'`
    );
    if (!Array.isArray(invoiceCols) || invoiceCols.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`ERP_supplier_orders\`
         ADD COLUMN \`invoiceNumber\` VARCHAR(80) NULL`
      );
    }

    const [fks] = await sequelize.query(
      `SELECT CONSTRAINT_NAME AS name
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'ERP_finance_supplier_order_payments'
         AND COLUMN_NAME = 'supplierPackId'
         AND REFERENCED_TABLE_NAME IS NOT NULL`
    );
    if (!Array.isArray(fks) || fks.length === 0) {
      try {
        await sequelize.query(
          `ALTER TABLE \`ERP_finance_supplier_order_payments\`
           ADD CONSTRAINT \`ERP_finance_supplier_order_payments_pack_fk\`
           FOREIGN KEY (\`supplierPackId\`)
           REFERENCES \`ERP_finance_supplier_packs\` (\`id\`)
           ON DELETE SET NULL
           ON UPDATE CASCADE`
        );
      } catch (fkErr) {
        // Columna ya usable aunque la FK no se cree (p. ej. permisos / motor).
        console.warn(
          "ensureSupplierPayablesSchema: FK supplierPackId no creada:",
          fkErr?.original?.sqlMessage || fkErr?.message || fkErr
        );
      }
    }

    schemaReady = true;
  } catch (error) {
    console.error("ensureSupplierPayablesSchema:", error);
    throw error;
  }
}

const orderIncludes = [
  { model: Supplier, as: "ERP_supplier" },
  {
    model: SupplierOrderItem,
    as: "ERP_supplier_order_items",
    include: [{ model: InventoryProduct, as: "ERP_inventory_product", attributes: ["id", "name"] }],
  },
];

async function paidSumForOrder(orderId, transaction) {
  const rows = await SupplierOrderPayment.findAll({
    where: { supplierOrderId: orderId, status: "completed" },
    attributes: ["amount"],
    transaction,
  });
  return round2(rows.reduce((s, r) => s + toNum(r.amount), 0));
}

async function syncOrderPaidFlag(order, total, paidSum, paymentMethod, payDate, transaction) {
  const remaining = round2(Math.max(0, total - paidSum));
  if (remaining <= 0.009) {
    order.paidAt = payDate || order.paidAt || nowApp();
    if (paymentMethod) order.paymentMethod = paymentMethod;
  } else {
    order.paidAt = null;
  }
  await order.save({ transaction });
  return remaining;
}

async function loadPacksForWorkbench() {
  const packs = await SupplierPack.findAll({
    where: { status: { [Op.ne]: "cancelled" } },
    include: [
      {
        model: SupplierPackItem,
        as: "items",
        include: [
          {
            model: SupplierOrderItem,
            as: "orderItem",
            include: [
              {
                model: InventoryProduct,
                as: "ERP_inventory_product",
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      },
    ],
    order: [["id", "DESC"]],
  });

  const packPayments = await SupplierOrderPayment.findAll({
    where: {
      supplierPackId: { [Op.ne]: null },
      status: "completed",
    },
    attributes: ["supplierPackId", "amount"],
  });
  const paidByPack = new Map();
  for (const p of packPayments) {
    const pid = Number(p.supplierPackId);
    paidByPack.set(pid, round2((paidByPack.get(pid) || 0) + toNum(p.amount)));
  }

  return packs.map((pack) => {
    const items = (pack.items || []).map((row) => {
      const oi = row.orderItem;
      return {
        id: row.id,
        supplierOrderItemId: row.supplierOrderItemId,
        supplierOrderId: row.supplierOrderId,
        quantity: toNum(row.quantity),
        allocatedUnitPrice: toNum(row.allocatedUnitPrice),
        allocatedLineTotal: toNum(row.allocatedLineTotal),
        previousUnitPrice:
          row.previousUnitPrice != null ? toNum(row.previousUnitPrice) : null,
        product:
          oi?.ERP_inventory_product?.name ||
          oi?.productName ||
          "(sin nombre)",
        productId: oi?.productId ?? null,
      };
    });
    const packAmount = toNum(pack.packAmount);
    const paidAmount = toNum(paidByPack.get(Number(pack.id)) || 0);
    const remainingAmount = round2(Math.max(0, packAmount - paidAmount));
    return {
      id: pack.id,
      supplierId: pack.supplierId,
      concept: pack.concept,
      kind: pack.kind === "order_group" ? "order_group" : "carton",
      packAmount,
      paidAmount,
      remainingAmount,
      status: remainingAmount <= 0.009 ? "closed" : pack.status,
      items,
      orderIds: (() => {
        const fromItems = items.map((i) => i.supplierOrderId);
        let fromMembers = [];
        try {
          const raw = pack.memberOrderIds;
          if (raw) {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (Array.isArray(parsed)) fromMembers = parsed.map((x) => Number(x));
          }
        } catch {
          /* ignore */
        }
        return [...new Set([...fromMembers, ...fromItems].filter((id) => id > 0))];
      })(),
    };
  });
}

export const getSupplierPayablesWorkbench = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const [suppliers, orders, payments, packs] = await Promise.all([
      Supplier.findAll({
        attributes: ["id", "name", "phone", "email"],
        order: [["name", "ASC"]],
      }),
      SupplierOrder.findAll({
        where: { status: { [Op.ne]: "cancelado" } },
        include: orderIncludes,
        order: [["date", "DESC"]],
      }),
      SupplierOrderPayment.findAll({
        attributes: [
          "id",
          "supplierOrderId",
          "supplierId",
          "supplierPackId",
          "date",
          "amount",
          "method",
          "note",
          "status",
          "expenseId",
          "createdAt",
        ],
        order: [["date", "DESC"]],
      }),
      loadPacksForWorkbench(),
    ]);

    const itemPackMap = new Map();
    for (const pack of packs) {
      for (const it of pack.items || []) {
        itemPackMap.set(Number(it.supplierOrderItemId), pack.id);
      }
    }

    const paidByOrderId = new Map();
    for (const p of payments) {
      if (p.status !== "completed") continue;
      const oid = Number(p.supplierOrderId);
      paidByOrderId.set(oid, round2((paidByOrderId.get(oid) || 0) + toNum(p.amount)));
    }

    const outOrders = orders.map((o) => {
      const items = o.ERP_supplier_order_items || [];
      const total = orderTotal(items);
      let paid = toNum(paidByOrderId.get(Number(o.id)) || 0);
      // Pedidos marcados pagados a la antigua (sin abonos): tratar como liquidados
      if (o.paidAt && paid <= 0 && total > 0) paid = total;
      const remaining = o.paidAt && paid >= total - 0.009
        ? 0
        : round2(Math.max(0, total - paid));

      return {
        id: o.id,
        supplierId: o.supplierId,
        date: isoDateOnly(o.date) || isoDateOnly(o.createdAt),
        notes: o.notes || "",
        status: o.status,
        receivedAt: o.receivedAt ? isoDateOnly(o.receivedAt) : null,
        paidAt: o.paidAt ? isoDateOnly(o.paidAt) : null,
        paymentMethod: o.paymentMethod || null,
        totalAmount: total,
        paidAmount: paid,
        remainingAmount: remaining,
        items: items.map((it) => ({
          id: it.id,
          productId: it.productId,
          product: it.ERP_inventory_product?.name || "(sin nombre)",
          quantity: toNum(it.quantity),
          unitPrice: toNum(it.unitPrice),
          taxRate: toNum(it.taxRate),
          packId: itemPackMap.get(Number(it.id)) || null,
          packKey: it.packKey || null,
          packName: it.packName || null,
          lotCode: it.lotCode || null,
          expiresAt: it.expiresAt ? isoDateOnly(it.expiresAt) : null,
          manufacturedAt: it.manufacturedAt ? isoDateOnly(it.manufacturedAt) : null,
          lineTotal: round2(
            toNum(it.quantity) * toNum(it.unitPrice) * (1 + toNum(it.taxRate) / 100)
          ),
        })),
      };
    });

    await ensurePaymentScheduleSchema();
    const instMap = await loadSupplierInstallmentsMap(outOrders.map((o) => o.id));
    const outOrdersWithCredit = attachInstallmentsToRows(outOrders, instMap);

    const debtBySupplier = new Map();
    for (const o of outOrdersWithCredit) {
      if (o.remainingAmount <= 0) continue;
      debtBySupplier.set(
        o.supplierId,
        round2((debtBySupplier.get(o.supplierId) || 0) + o.remainingAmount)
      );
    }

    const outSuppliers = suppliers
      .map((s) => {
        const suppOrders = outOrdersWithCredit.filter(
          (o) => Number(o.supplierId) === Number(s.id) && toNum(o.remainingAmount) > 0.009
        );
        let best = null;
        let bestAmt = null;
        let count = 0;
        for (const o of suppOrders) {
          if (o.nextCreditDue) {
            count += o.pendingCreditCount || 0;
            if (!best || String(o.nextCreditDue) < String(best)) {
              best = o.nextCreditDue;
              bestAmt = o.nextCreditAmount;
            }
          }
        }
        return {
          id: s.id,
          name: s.name,
          phone: s.phone ?? null,
          email: s.email ?? null,
          debtTotal: toNum(debtBySupplier.get(s.id) || 0),
          nextCreditDue: best,
          nextCreditAmount: bestAmt,
          pendingCreditCount: count,
        };
      })
      .sort((a, b) => {
        const diff = b.debtTotal - a.debtTotal;
        if (diff !== 0) return diff;
        return String(a.name || "").localeCompare(String(b.name || ""), "es");
      });

    const outPayments = payments.map((p) => ({
      id: p.id,
      supplierOrderId: p.supplierOrderId,
      supplierId: p.supplierId,
      supplierPackId: p.supplierPackId ?? null,
      date: isoDateOnly(p.date) || isoDateOnly(p.createdAt),
      amount: round2(p.amount),
      method: p.method || "efectivo",
      note: p.note || "",
      status: p.status,
      expenseId: p.expenseId,
    }));

    return res.json({
      suppliers: outSuppliers,
      orders: outOrdersWithCredit,
      payments: outPayments,
      packs: packs.filter((p) => p.status !== "cancelled"),
    });
  } catch (error) {
    console.error("getSupplierPayablesWorkbench:", error);
    return res.status(500).json({
      message: "Error cargando cuentas por pagar",
      error: String(error?.message || error),
    });
  }
};

export const paySupplierOrder = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const orderId = Number(req.params.orderId);
    const amount = round2(req.body?.amount);
    const method = String(req.body?.method || "efectivo").trim() || "efectivo";
    const note = req.body?.note != null ? String(req.body.note).trim() : "Abono a proveedor";
    const explicitPayDate = req.body?.date ? toAppDateTime(req.body.date) : null;

    if (!Number.isFinite(orderId) || orderId <= 0) {
      notifyFail("supplier_payable.paid_failed", "Pedido inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Pedido inválido" });
    }
    if (!(amount > 0)) {
      notifyFail("supplier_payable.paid_failed", "El monto del abono debe ser mayor a 0", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "El monto del abono debe ser mayor a 0" });
    }

    const result = await sequelize.transaction(async (t) => {
      const order = await SupplierOrder.findByPk(orderId, {
        include: orderIncludes,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!order) {
        return { status: 404, body: { message: "Pedido no encontrado" } };
      }
      if (order.status === "cancelado") {
        return { status: 400, body: { message: "El pedido está cancelado" } };
      }

      const instMap = await loadSupplierInstallmentsMap([order.id]);
      const firstInstallmentDueDate = (instMap.get(order.id) || [])[0]?.dueDate || null;
      const payDate =
        explicitPayDate ||
        resolveSupplierOrderPayDate({ order, installmentDueDate: firstInstallmentDueDate });

      const total = orderTotal(order.ERP_supplier_order_items || []);
      let paid = await paidSumForOrder(orderId, t);
      if (order.paidAt && paid <= 0 && total > 0) {
        return { status: 400, body: { message: "El pedido ya está marcado como pagado" } };
      }

      const remaining = round2(Math.max(0, total - paid));
      if (remaining <= 0.009) {
        return { status: 400, body: { message: "Este pedido ya no tiene saldo pendiente" } };
      }
      if (amount > remaining + 0.009) {
        return {
          status: 400,
          body: {
            message: `El abono ($${amount.toFixed(2)}) supera el saldo ($${remaining.toFixed(2)})`,
          },
        };
      }

      const supplierName = order.ERP_supplier?.name || "Proveedor";
      const expense = await Expense.create(
        {
          date: payDate,
          amount,
          concept: `Abono pedido proveedor #${order.id} — ${supplierName}`,
          category: "Compras",
          referenceType: "supplier_order_abono",
          referenceId: order.id,
          counterpartyName: supplierName,
          createdBy: user.accountId,
          status: "paid",
        },
        { transaction: t }
      );

      const payment = await SupplierOrderPayment.create(
        {
          supplierOrderId: order.id,
          supplierId: order.supplierId,
          date: payDate,
          amount,
          method,
          note: note || `Abono pedido #${order.id}`,
          status: "completed",
          expenseId: expense.id,
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      const newPaid = round2(paid + amount);
      const newRemaining = await syncOrderPaidFlag(
        order,
        total,
        newPaid,
        method,
        payDate,
        t
      );
      if (newRemaining <= 0.009) {
        order.financeExpenseId = expense.id;
        await order.save({ transaction: t });
      }

      return {
        status: 200,
        body: {
          paymentId: payment.id,
          orderId: order.id,
          amount,
          paidAmount: newPaid,
          remainingAmount: newRemaining,
          fullyPaid: newRemaining <= 0.009,
        },
      };
    });

    if (result.status >= 400) {
      notifyFail("supplier_payable.paid_failed", result.body?.message || "Error registrando abono a proveedor", {
        req,
        httpStatus: result.status,
        extra: { orderId },
      });
    } else {
      notifyOk("supplier_payable.paid", `Abono proveedor #${orderId}`, {
        orderId,
        paymentId: result.body?.paymentId,
        amount: result.body?.amount,
      });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("paySupplierOrder:", error);
    notifyFail("supplier_payable.paid_failed", "Error registrando abono a proveedor", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: "Error registrando abono a proveedor",
      error: String(error?.message || error),
    });
  }
};

export const updateSupplierOrderPayment = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(paymentId)) {
      notifyFail("supplier_payable.payment_update_failed", "Pago inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Pago inválido" });
    }

    const result = await sequelize.transaction(async (t) => {
      const payment = await SupplierOrderPayment.findByPk(paymentId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!payment) return { status: 404, body: { message: "Abono no encontrado" } };

      const order = await SupplierOrder.findByPk(payment.supplierOrderId, {
        include: orderIncludes,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!order) return { status: 404, body: { message: "Pedido no encontrado" } };

      const total = orderTotal(order.ERP_supplier_order_items || []);
      const othersPaid = round2(
        (await paidSumForOrder(order.id, t)) -
          (payment.status === "completed" ? toNum(payment.amount) : 0)
      );

      if (req.body?.amount != null) {
        const amount = round2(req.body.amount);
        if (!(amount > 0)) {
          return { status: 400, body: { message: "Monto inválido" } };
        }
        const remainingCap = round2(Math.max(0, total - othersPaid));
        if (amount > remainingCap + 0.009) {
          return {
            status: 400,
            body: { message: `El monto supera el saldo permitido ($${remainingCap.toFixed(2)})` },
          };
        }
        payment.amount = amount;
      }
      if (req.body?.date) payment.date = toAppDateTime(req.body.date);
      if (req.body?.method != null) payment.method = String(req.body.method).trim() || payment.method;
      if (req.body?.note != null) payment.note = String(req.body.note);
      if (req.body?.status === "completed" || req.body?.status === "cancelled") {
        payment.status = req.body.status;
      }
      await payment.save({ transaction: t });

      if (payment.expenseId) {
        const expense = await Expense.findByPk(payment.expenseId, { transaction: t });
        if (expense) {
          expense.amount = payment.amount;
          expense.date = payment.date;
          if (payment.status === "cancelled") expense.status = "pending";
          else expense.status = "paid";
          await expense.save({ transaction: t });
        }
      }

      const paid = await paidSumForOrder(order.id, t);
      await syncOrderPaidFlag(order, total, paid, payment.method, payment.date, t);

      return { status: 200, body: { ok: true, paymentId: payment.id } };
    });

    if (result.status >= 400) {
      notifyFail(
        "supplier_payable.payment_update_failed",
        result.body?.message || "Error actualizando abono",
        { req, httpStatus: result.status, extra: { paymentId } },
      );
    } else {
      notifyOk("supplier_payable.payment_updated", `Abono proveedor #${paymentId}`, { paymentId });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("updateSupplierOrderPayment:", error);
    notifyFail("supplier_payable.payment_update_failed", "Error actualizando abono", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error actualizando abono" });
  }
};

export const deleteSupplierOrderPayment = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const paymentId = Number(req.params.paymentId);
    if (!Number.isFinite(paymentId)) {
      notifyFail("supplier_payable.payment_delete_failed", "Pago inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Pago inválido" });
    }

    const result = await sequelize.transaction(async (t) => {
      const payment = await SupplierOrderPayment.findByPk(paymentId, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!payment) return { status: 404, body: { message: "Abono no encontrado" } };

      const order = await SupplierOrder.findByPk(payment.supplierOrderId, {
        include: orderIncludes,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      const expenseId = payment.expenseId;
      await payment.destroy({ transaction: t });
      if (expenseId) {
        await Expense.destroy({ where: { id: expenseId }, transaction: t });
      }

      if (order) {
        const total = orderTotal(order.ERP_supplier_order_items || []);
        const paid = await paidSumForOrder(order.id, t);
        await syncOrderPaidFlag(order, total, paid, null, null, t);
        if (order.financeExpenseId === expenseId) {
          order.financeExpenseId = null;
          await order.save({ transaction: t });
        }
      }

      return { status: 200, body: { ok: true } };
    });

    if (result.status >= 400) {
      notifyFail(
        "supplier_payable.payment_delete_failed",
        result.body?.message || "Error eliminando abono",
        { req, httpStatus: result.status, extra: { paymentId } },
      );
    } else {
      notifyOk("supplier_payable.payment_deleted", `Abono proveedor #${paymentId}`, { paymentId });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("deleteSupplierOrderPayment:", error);
    notifyFail("supplier_payable.payment_delete_failed", "Error eliminando abono", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error eliminando abono" });
  }
};

/**
 * POST /supplier-payables/packs
 * body:
 *  - carton (default): { supplierId, concept, packAmount, itemIds }
 *    Reparte packAmount en unitPrice.
 *  - order_group: { supplierId, concept?, orderIds, packAmount? }
 *    Agrupa pedidos para abonar juntos SIN cambiar precios.
 *    packAmount por defecto = suma de saldos de esos pedidos.
 */
export const createSupplierPack = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const supplierId = Number(req.body?.supplierId);
    const kind =
      String(req.body?.kind || "").trim() === "order_group" ? "order_group" : "carton";
    const defaultConcept =
      kind === "order_group" ? "Grupo de pago" : "Paca / cartón";
    const concept =
      String(req.body?.concept || defaultConcept).trim() || defaultConcept;

    let itemIds = Array.isArray(req.body?.itemIds)
      ? [...new Set(req.body.itemIds.map((id) => Number(id)).filter((id) => id > 0))]
      : [];
    const orderIdsIn = Array.isArray(req.body?.orderIds)
      ? [...new Set(req.body.orderIds.map((id) => Number(id)).filter((id) => id > 0))]
      : [];

    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return res.status(400).json({ message: "Proveedor inválido" });
    }

    const result = await sequelize.transaction(async (t) => {
      // --- Resolver líneas ---
      let items = [];
      let orderById = new Map();

      if (kind === "order_group") {
        if (orderIdsIn.length < 1) {
          return {
            status: 400,
            body: { message: "Seleccioná al menos un pedido para el grupo" },
          };
        }
        const orders = await SupplierOrder.findAll({
          where: {
            id: { [Op.in]: orderIdsIn },
            supplierId,
            status: { [Op.ne]: "cancelado" },
          },
          include: [
            {
              model: SupplierOrderItem,
              as: "ERP_supplier_order_items",
              include: [
                {
                  model: InventoryProduct,
                  as: "ERP_inventory_product",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (orders.length !== orderIdsIn.length) {
          return {
            status: 400,
            body: { message: "Algunos pedidos no existen o no son de este proveedor" },
          };
        }
        orderById = new Map(orders.map((o) => [Number(o.id), o]));

        const taken = await SupplierPackItem.findAll({
          attributes: ["supplierOrderItemId"],
          transaction: t,
        });
        const takenSet = new Set(taken.map((r) => Number(r.supplierOrderItemId)));

        for (const o of orders) {
          for (const it of o.ERP_supplier_order_items || []) {
            if (!takenSet.has(Number(it.id))) items.push(it);
          }
        }
        itemIds = items.map((it) => Number(it.id));
        // Continúa abajo con kind === "order_group" (puede no haber líneas libres)
      } else {
        if (itemIds.length < 1) {
          return {
            status: 400,
            body: { message: "Seleccioná al menos un producto para la paca" },
          };
        }
        const alreadyInPack = await SupplierPackItem.findAll({
          where: { supplierOrderItemId: { [Op.in]: itemIds } },
          transaction: t,
        });
        if (alreadyInPack.length > 0) {
          return {
            status: 400,
            body: {
              message: `Hay ${alreadyInPack.length} línea(s) que ya están en otra paca`,
            },
          };
        }

        items = await SupplierOrderItem.findAll({
          where: { id: { [Op.in]: itemIds } },
          include: [
            {
              model: InventoryProduct,
              as: "ERP_inventory_product",
              attributes: ["id", "name"],
            },
          ],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (items.length !== itemIds.length) {
          return { status: 400, body: { message: "Algunas líneas no existen" } };
        }

        const orderIds = [
          ...new Set(
            items.map((it) => Number(it.orderId)).filter((id) => Number.isFinite(id) && id > 0)
          ),
        ];
        const orders = await SupplierOrder.findAll({
          where: { id: { [Op.in]: orderIds } },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        orderById = new Map(orders.map((o) => [Number(o.id), o]));
        if (orderById.size !== orderIds.length) {
          return { status: 400, body: { message: "Algunos pedidos de las líneas no existen" } };
        }
        for (const it of items) {
          const order = orderById.get(Number(it.orderId));
          if (!order || Number(order.supplierId) !== supplierId) {
            return {
              status: 400,
              body: {
                message: `La línea #${it.id} (pedido #${it.orderId}) no pertenece a este proveedor`,
              },
            };
          }
          if (order.status === "cancelado") {
            return {
              status: 400,
              body: { message: `El pedido #${order.id} está cancelado` },
            };
          }
        }
      }

      // --- Monto del grupo/paca ---
      let packAmount = round2(req.body?.packAmount);
      if (kind === "order_group") {
        const paidByOrder = new Map();
        const orderIdList = [...orderById.keys()];
        if (orderIdList.length > 0) {
          const pays = await SupplierOrderPayment.findAll({
            where: {
              supplierOrderId: { [Op.in]: orderIdList },
              status: "completed",
            },
            attributes: ["supplierOrderId", "amount"],
            transaction: t,
          });
          for (const p of pays) {
            const oid = Number(p.supplierOrderId);
            paidByOrder.set(oid, round2((paidByOrder.get(oid) || 0) + toNum(p.amount)));
          }
        }

        let sumRemaining = 0;
        const remainingByOrder = new Map();
        for (const [oid, order] of orderById.entries()) {
          const allLines = order.ERP_supplier_order_items || [];
          const total = orderTotal(allLines);
          const paid = toNum(paidByOrder.get(oid) || 0);
          const rem = round2(Math.max(0, total - paid));
          remainingByOrder.set(oid, rem);
          sumRemaining = round2(sumRemaining + rem);
        }

        if (!(packAmount > 0)) {
          packAmount = sumRemaining;
        }
        if (!(packAmount > 0)) {
          return {
            status: 400,
            body: { message: "Los pedidos seleccionados no tienen saldo pendiente" },
          };
        }

        // Asignar montos por línea libre (solo para mostrar productos).
        // El abono real se desglosa por saldo de pedido (memberOrderIds).
        const allocations = [];
        let allocatedGlobal = 0;
        const orderKeys = [...remainingByOrder.keys()];
        for (let oi = 0; oi < orderKeys.length; oi++) {
          const oid = orderKeys[oi];
          const rem = remainingByOrder.get(oid) || 0;
          if (rem <= 0.009) continue;
          const orderShare =
            sumRemaining > 0 ? round2((packAmount * rem) / sumRemaining) : 0;
          const lines = items.filter((it) => Number(it.orderId) === oid);
          if (lines.length === 0) continue;
          const lineTotals = lines.map((it) => {
            const qty = toNum(it.quantity);
            const price = toNum(it.unitPrice);
            const tax = toNum(it.taxRate);
            return round2(qty * price * (1 + tax / 100));
          });
          const linesSum = round2(lineTotals.reduce((s, v) => s + v, 0));
          let allocOrder = 0;
          for (let i = 0; i < lines.length; i++) {
            const it = lines[i];
            const isLastLine = i === lines.length - 1;
            let lineTotal;
            if (isLastLine) {
              lineTotal = round2(orderShare - allocOrder);
            } else if (linesSum > 0) {
              lineTotal = round2((orderShare * lineTotals[i]) / linesSum);
            } else {
              lineTotal = 0;
            }
            allocOrder = round2(allocOrder + lineTotal);
            allocatedGlobal = round2(allocatedGlobal + lineTotal);
            const qty = toNum(it.quantity);
            allocations.push({
              it,
              qty,
              lineTotal,
              previousUnitPrice: toNum(it.unitPrice),
            });
          }
        }

        const memberOrderIds = orderKeys.filter(
          (oid) => toNum(remainingByOrder.get(oid)) > 0.009
        );
        if (memberOrderIds.length < 1) {
          return {
            status: 400,
            body: { message: "No hay saldo repartible en los pedidos elegidos" },
          };
        }

        const pack = await SupplierPack.create(
          {
            supplierId,
            concept,
            packAmount,
            kind: "order_group",
            memberOrderIds: JSON.stringify(memberOrderIds),
            status: "open",
            createdBy: user.accountId,
          },
          { transaction: t }
        );

        for (const row of allocations) {
          await SupplierPackItem.create(
            {
              packId: pack.id,
              supplierOrderId: row.it.orderId,
              supplierOrderItemId: row.it.id,
              quantity: row.qty,
              previousUnitPrice: row.previousUnitPrice,
              allocatedUnitPrice: row.previousUnitPrice,
              allocatedLineTotal: row.lineTotal,
            },
            { transaction: t }
          );
        }

        return {
          status: 201,
          body: {
            packId: pack.id,
            kind: "order_group",
            concept: pack.concept,
            packAmount,
            itemCount: allocations.length,
            orderIds: memberOrderIds,
          },
        };
      }

      // --- carton: reprecio ---
      if (!(packAmount > 0)) {
        return { status: 400, body: { message: "El valor de la paca debe ser mayor a 0" } };
      }

      const totalQty = round2(items.reduce((s, it) => s + toNum(it.quantity), 0));
      if (!(totalQty > 0)) {
        return { status: 400, body: { message: "La cantidad total de la paca debe ser > 0" } };
      }

      const unitPrice = round4(packAmount / totalQty);

      const pack = await SupplierPack.create(
        {
          supplierId,
          concept,
          packAmount,
          kind: "carton",
          status: "open",
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      let allocatedSum = 0;
      const allocations = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const qty = toNum(it.quantity);
        const isLast = i === items.length - 1;
        const lineTotal = isLast
          ? round2(packAmount - allocatedSum)
          : round2(qty * unitPrice);
        allocatedSum = round2(allocatedSum + lineTotal);
        const lineUnit = qty > 0 ? round4(lineTotal / qty) : unitPrice;
        allocations.push({ it, qty, lineTotal, lineUnit });
      }

      for (const row of allocations) {
        const tax = toNum(row.it.taxRate);
        const previousUnitPrice = toNum(row.it.unitPrice);
        const netUnit =
          tax > 0 ? round4(row.lineUnit / (1 + tax / 100)) : row.lineUnit;
        await row.it.update({ unitPrice: netUnit }, { transaction: t });
        await SupplierPackItem.create(
          {
            packId: pack.id,
            supplierOrderId: row.it.orderId,
            supplierOrderItemId: row.it.id,
            quantity: row.qty,
            previousUnitPrice,
            allocatedUnitPrice: netUnit,
            allocatedLineTotal: row.lineTotal,
          },
          { transaction: t }
        );
      }

      return {
        status: 201,
        body: {
          packId: pack.id,
          kind: "carton",
          concept: pack.concept,
          packAmount,
          unitPrice,
          totalQty,
          itemCount: items.length,
          orderIds: [...new Set(items.map((it) => it.orderId))],
        },
      };
    });

    if (result.status >= 400) {
      notifyFail("supplier_pack.create_failed", result.body?.message || "Error creando paca", {
        req,
        httpStatus: result.status,
      });
    } else {
      notifyOk(
        "supplier_pack.created",
        result.body?.kind === "order_group"
          ? `Grupo de pago #${result.body?.packId}`
          : `Paca #${result.body?.packId}`,
        { packId: result.body?.packId }
      );
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("createSupplierPack:", error);
    notifyFail("supplier_pack.create_failed", error.message || "Error creando paca", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: error.message || "Error creando paca" });
  }
};

async function paidSumForPack(packId, transaction) {
  const rows = await SupplierOrderPayment.findAll({
    where: { supplierPackId: packId, status: "completed" },
    attributes: ["amount"],
    transaction,
  });
  return round2(rows.reduce((s, r) => s + toNum(r.amount), 0));
}

/**
 * PUT /supplier-payables/packs/:packId
 * body: { concept?, packAmount? }
 * Recalcula precios solo si no hay abonos a la paca.
 */
export const updateSupplierPack = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const packId = Number(req.params.packId);
    if (!Number.isFinite(packId) || packId <= 0) {
      return res.status(400).json({ message: "Paca inválida" });
    }

    const hasConcept = req.body?.concept != null;
    const hasAmount = req.body?.packAmount != null && req.body.packAmount !== "";
    const concept = hasConcept
      ? String(req.body.concept).trim() || "Paca / cartón"
      : null;
    const packAmount = hasAmount ? round2(req.body.packAmount) : null;

    if (!hasConcept && !hasAmount) {
      return res.status(400).json({ message: "Nada para actualizar" });
    }
    if (hasAmount && !(packAmount > 0)) {
      return res.status(400).json({ message: "El valor de la paca debe ser mayor a 0" });
    }

    const result = await sequelize.transaction(async (t) => {
      const pack = await SupplierPack.findByPk(packId, {
        include: [{ model: SupplierPackItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!pack || pack.status === "cancelled") {
        return { status: 404, body: { message: "Paca no encontrada" } };
      }

      const alreadyPaid = await paidSumForPack(packId, t);
      if (hasAmount && alreadyPaid > 0.009) {
        return {
          status: 400,
          body: {
            message:
              "No se puede cambiar el valor: la paca ya tiene abonos. Desglosala o editá solo el nombre.",
          },
        };
      }

      if (hasConcept) pack.concept = concept;

      if (hasAmount) {
        const packItems = pack.items || [];
        if (packItems.length === 0) {
          return { status: 400, body: { message: "La paca no tiene líneas" } };
        }
        const isOrderGroup = pack.kind === "order_group";
        const itemIds = packItems.map((r) => Number(r.supplierOrderItemId));
        const orderItems = await SupplierOrderItem.findAll({
          where: { id: { [Op.in]: itemIds } },
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        const byId = new Map(orderItems.map((it) => [Number(it.id), it]));

        if (isOrderGroup) {
          const weights = packItems.map((r) => toNum(r.allocatedLineTotal));
          const weightSum = round2(weights.reduce((s, v) => s + v, 0));
          let allocatedSum = 0;
          for (let i = 0; i < packItems.length; i++) {
            const row = packItems[i];
            const isLast = i === packItems.length - 1;
            const lineTotal = isLast
              ? round2(packAmount - allocatedSum)
              : weightSum > 0
                ? round2((packAmount * weights[i]) / weightSum)
                : 0;
            allocatedSum = round2(allocatedSum + lineTotal);
            const qty = toNum(row.quantity);
            row.allocatedLineTotal = lineTotal;
            row.allocatedUnitPrice =
              row.previousUnitPrice != null
                ? toNum(row.previousUnitPrice)
                : toNum(row.allocatedUnitPrice);
            if (qty > 0 && row.previousUnitPrice == null) {
              // keep price; only totals matter for pay split
            }
            await row.save({ transaction: t });
          }
        } else {
          const totalQty = round2(
            packItems.reduce((s, r) => s + toNum(r.quantity), 0)
          );
          if (!(totalQty > 0)) {
            return { status: 400, body: { message: "Cantidad total inválida" } };
          }
          const unitPrice = round4(packAmount / totalQty);
          let allocatedSum = 0;

          for (let i = 0; i < packItems.length; i++) {
            const row = packItems[i];
            const oi = byId.get(Number(row.supplierOrderItemId));
            if (!oi) {
              return { status: 400, body: { message: "Falta una línea de la paca" } };
            }
            const qty = toNum(row.quantity);
            const isLast = i === packItems.length - 1;
            const lineTotal = isLast
              ? round2(packAmount - allocatedSum)
              : round2(qty * unitPrice);
            allocatedSum = round2(allocatedSum + lineTotal);
            const lineUnit = qty > 0 ? round4(lineTotal / qty) : unitPrice;
            const tax = toNum(oi.taxRate);
            const netUnit = tax > 0 ? round4(lineUnit / (1 + tax / 100)) : lineUnit;

            await oi.update({ unitPrice: netUnit }, { transaction: t });
            row.allocatedUnitPrice = netUnit;
            row.allocatedLineTotal = lineTotal;
            row.quantity = qty;
            await row.save({ transaction: t });
          }
        }

        pack.packAmount = packAmount;
        if (pack.status === "closed") pack.status = "open";
      }

      await pack.save({ transaction: t });
      return {
        status: 200,
        body: {
          packId: pack.id,
          concept: pack.concept,
          packAmount: toNum(pack.packAmount),
        },
      };
    });

    if (result.status >= 400) {
      notifyFail("supplier_pack.update_failed", result.body?.message || "Error editando paca", {
        req,
        httpStatus: result.status,
        extra: { packId },
      });
    } else {
      notifyOk("supplier_pack.updated", `Paca #${packId} actualizada`, { packId });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("updateSupplierPack:", error);
    notifyFail("supplier_pack.update_failed", error.message || "Error editando paca", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: error.message || "Error editando paca" });
  }
};

/**
 * POST /supplier-payables/packs/:packId/dissolve
 * Desglosa la paca: restaura precios anteriores y libera las líneas.
 */
export const dissolveSupplierPack = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const packId = Number(req.params.packId);
    if (!Number.isFinite(packId) || packId <= 0) {
      return res.status(400).json({ message: "Paca inválida" });
    }

    const result = await sequelize.transaction(async (t) => {
      const pack = await SupplierPack.findByPk(packId, {
        include: [{ model: SupplierPackItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!pack || pack.status === "cancelled") {
        return { status: 404, body: { message: "Paca no encontrada" } };
      }

      const alreadyPaid = await paidSumForPack(packId, t);
      if (alreadyPaid > 0.009) {
        return {
          status: 400,
          body: {
            message:
              "No se puede desglosar: la paca ya tiene abonos. Anulá los abonos primero.",
          },
        };
      }

      const packItems = pack.items || [];
      const itemIds = packItems.map((r) => Number(r.supplierOrderItemId));
      const orderItems =
        itemIds.length > 0
          ? await SupplierOrderItem.findAll({
              where: { id: { [Op.in]: itemIds } },
              transaction: t,
              lock: t.LOCK.UPDATE,
            })
          : [];
      const byId = new Map(orderItems.map((it) => [Number(it.id), it]));

      for (const row of packItems) {
        const oi = byId.get(Number(row.supplierOrderItemId));
        if (oi && row.previousUnitPrice != null) {
          await oi.update(
            { unitPrice: toNum(row.previousUnitPrice) },
            { transaction: t }
          );
        }
        await row.destroy({ transaction: t });
      }

      pack.status = "cancelled";
      await pack.save({ transaction: t });

      return {
        status: 200,
        body: {
          packId,
          dissolved: true,
          restoredItems: packItems.length,
        },
      };
    });

    if (result.status >= 400) {
      notifyFail("supplier_pack.dissolve_failed", result.body?.message || "Error desglosando", {
        req,
        httpStatus: result.status,
        extra: { packId },
      });
    } else {
      notifyOk("supplier_pack.dissolved", `Paca #${packId} desglosada`, { packId });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("dissolveSupplierPack:", error);
    notifyFail("supplier_pack.dissolve_failed", error.message || "Error desglosando", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: error.message || "Error desglosando paca" });
  }
};

/**
 * POST /supplier-payables/packs/:packId/pay
 * Un abono a la paca; se desglosa en pagos por pedido según el valor de sus líneas.
 */
export const paySupplierPack = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    await ensureSupplierPayablesSchema();

    const packId = Number(req.params.packId);
    const amount = round2(req.body?.amount);
    const method = String(req.body?.method || "efectivo").trim() || "efectivo";
    const note = req.body?.note != null ? String(req.body.note).trim() : "";
    const payDate = req.body?.date ? toAppDateTime(req.body.date) : nowApp();

    if (!Number.isFinite(packId) || packId <= 0) {
      return res.status(400).json({ message: "Paca inválida" });
    }
    if (!(amount > 0)) {
      return res.status(400).json({ message: "El monto del abono debe ser mayor a 0" });
    }

    const result = await sequelize.transaction(async (t) => {
      const pack = await SupplierPack.findByPk(packId, {
        include: [{ model: SupplierPackItem, as: "items" }],
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!pack || pack.status === "cancelled") {
        return { status: 404, body: { message: "Paca no encontrada" } };
      }

      const packItems = pack.items || [];
      const isOrderGroup = pack.kind === "order_group";

      let memberOrderIds = [];
      try {
        const raw = pack.memberOrderIds;
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (Array.isArray(parsed)) {
            memberOrderIds = parsed.map((x) => Number(x)).filter((id) => id > 0);
          }
        }
      } catch {
        /* ignore */
      }
      if (memberOrderIds.length < 1 && packItems.length > 0) {
        memberOrderIds = [
          ...new Set(packItems.map((r) => Number(r.supplierOrderId)).filter((id) => id > 0)),
        ];
      }

      if (!isOrderGroup && packItems.length === 0) {
        return { status: 400, body: { message: "La paca no tiene líneas" } };
      }
      if (isOrderGroup && memberOrderIds.length < 1) {
        return { status: 400, body: { message: "El grupo no tiene pedidos" } };
      }

      const alreadyPaid = round2(
        toNum(
          await SupplierOrderPayment.sum("amount", {
            where: { supplierPackId: packId, status: "completed" },
            transaction: t,
          })
        )
      );
      const packRemaining = round2(Math.max(0, toNum(pack.packAmount) - alreadyPaid));
      if (packRemaining <= 0.009) {
        return { status: 400, body: { message: "Esta paca ya está liquidada" } };
      }
      if (amount > packRemaining + 0.009) {
        return {
          status: 400,
          body: {
            message: `El abono ($${amount.toFixed(2)}) supera el saldo de la paca ($${packRemaining.toFixed(2)})`,
          },
        };
      }

      const shareByOrder = new Map();
      let shareSum = 0;

      if (isOrderGroup) {
        const orders = await SupplierOrder.findAll({
          where: { id: { [Op.in]: memberOrderIds } },
          include: [{ model: SupplierOrderItem, as: "ERP_supplier_order_items" }],
          transaction: t,
        });
        const paidRows = await SupplierOrderPayment.findAll({
          where: {
            supplierOrderId: { [Op.in]: memberOrderIds },
            status: "completed",
          },
          attributes: ["supplierOrderId", "amount"],
          transaction: t,
        });
        const paidByOrder = new Map();
        for (const p of paidRows) {
          const oid = Number(p.supplierOrderId);
          paidByOrder.set(oid, round2((paidByOrder.get(oid) || 0) + toNum(p.amount)));
        }
        for (const o of orders) {
          const total = orderTotal(o.ERP_supplier_order_items || []);
          const paid = toNum(paidByOrder.get(Number(o.id)) || 0);
          const rem = round2(Math.max(0, total - paid));
          if (rem > 0.009) {
            shareByOrder.set(Number(o.id), rem);
            shareSum = round2(shareSum + rem);
          }
        }
      } else {
        for (const row of packItems) {
          const oid = Number(row.supplierOrderId);
          const line = toNum(row.allocatedLineTotal);
          shareByOrder.set(oid, round2((shareByOrder.get(oid) || 0) + line));
          shareSum = round2(shareSum + line);
        }
      }

      if (!(shareSum > 0)) {
        return { status: 400, body: { message: "No se pudo desglosar el pago del grupo" } };
      }

      const supplier = await Supplier.findByPk(pack.supplierId, { transaction: t });
      const supplierName = supplier?.name || "Proveedor";

      const expense = await Expense.create(
        {
          date: payDate,
          amount,
          concept: isOrderGroup
            ? `Abono grupo #${pack.id} — ${pack.concept} — ${supplierName}`
            : `Abono paca #${pack.id} — ${pack.concept} — ${supplierName}`,
          category: "Compras",
          referenceType: "supplier_pack_abono",
          referenceId: pack.id,
          counterpartyName: supplierName,
          createdBy: user.accountId,
          status: "paid",
        },
        { transaction: t }
      );

      const orderIds = [...shareByOrder.keys()];
      const allocations = [];
      let allocated = 0;
      for (let i = 0; i < orderIds.length; i++) {
        const oid = orderIds[i];
        const isLast = i === orderIds.length - 1;
        const share = shareByOrder.get(oid);
        let part = isLast
          ? round2(amount - allocated)
          : round2((amount * share) / shareSum);
        if (part < 0) part = 0;
        allocated = round2(allocated + part);
        if (part > 0.009) allocations.push({ orderId: oid, amount: part });
      }

      const paymentIds = [];
      const breakdown = [];

      for (const alloc of allocations) {
        const order = await SupplierOrder.findByPk(alloc.orderId, {
          include: orderIncludes,
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (!order) continue;

        const total = orderTotal(order.ERP_supplier_order_items || []);
        let paid = await paidSumForOrder(order.id, t);
        if (order.paidAt && paid <= 0 && total > 0) paid = total;
        const remaining = round2(Math.max(0, total - paid));
        const payAmt = round2(Math.min(alloc.amount, remaining));
        if (!(payAmt > 0.009)) continue;

        const payment = await SupplierOrderPayment.create(
          {
            supplierOrderId: order.id,
            supplierId: pack.supplierId,
            supplierPackId: pack.id,
            date: payDate,
            amount: payAmt,
            method,
            note: note || `Abono paca #${pack.id} · desglose pedido #${order.id}`,
            status: "completed",
            expenseId: expense.id,
            createdBy: user.accountId,
          },
          { transaction: t }
        );
        paymentIds.push(payment.id);

        const newPaid = round2(paid + payAmt);
        const newRemaining = await syncOrderPaidFlag(
          order,
          total,
          newPaid,
          method,
          payDate,
          t
        );
        breakdown.push({
          orderId: order.id,
          amount: payAmt,
          paidAmount: newPaid,
          remainingAmount: newRemaining,
        });
      }

      const newPackPaid = round2(alreadyPaid + amount);
      const newPackRemaining = round2(Math.max(0, toNum(pack.packAmount) - newPackPaid));
      if (newPackRemaining <= 0.009 && pack.status !== "closed") {
        pack.status = "closed";
        await pack.save({ transaction: t });
      }

      return {
        status: 200,
        body: {
          packId: pack.id,
          amount,
          paidAmount: newPackPaid,
          remainingAmount: newPackRemaining,
          fullyPaid: newPackRemaining <= 0.009,
          paymentIds,
          breakdown,
        },
      };
    });

    if (result.status >= 400) {
      notifyFail("supplier_pack.paid_failed", result.body?.message || "Error abonando paca", {
        req,
        httpStatus: result.status,
        extra: { packId },
      });
    } else {
      notifyOk("supplier_pack.paid", `Abono paca #${packId}`, {
        packId,
        amount: result.body?.amount,
      });
    }
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("paySupplierPack:", error);
    notifyFail("supplier_pack.paid_failed", "Error abonando paca", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error abonando paca" });
  }
};
