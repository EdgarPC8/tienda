/**
 * Cuotas / fechas de pago de pedidos (cliente y proveedor).
 * Las cuotas son el calendario de liquidación; el abono real sigue en finanzas.
 * El progreso se proyecta FIFO sobre el paidAmount del pedido.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { Customer, Order, OrderItem, Supplier, SupplierOrder, SupplierOrderItem } from "../models/Orders.js";
import { ItemGroupItem, Payment, SupplierOrderPayment } from "../models/Finance.js";
import { createAndPushNotification, resolveAdminUserIds } from "./notificationService.js";
import { getAppTimezone, getZonedParts, nowApp } from "../utils/appDateTime.js";

const money2 = (n) => Number(Number(n || 0).toFixed(2));
const BILLABLE_EPSILON = 0.009;
const todayDateOnly = () => {
  const p = getZonedParts(nowApp(), getAppTimezone());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

let schemaReady = false;

export async function ensurePaymentScheduleSchema() {
  if (schemaReady) return;
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`ERP_order_payment_installments\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`orderId\` INT NOT NULL,
        \`sequence\` INT NOT NULL DEFAULT 1,
        \`dueDate\` DATE NOT NULL,
        \`amount\` DECIMAL(14, 2) NOT NULL DEFAULT 0,
        \`notes\` VARCHAR(255) NULL,
        \`reminderEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`reminderDaysBefore\` TINYINT NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_order_pay_inst_order\` (\`orderId\`),
        KEY \`idx_order_pay_inst_due\` (\`dueDate\`),
        CONSTRAINT \`fk_order_pay_inst_order\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`ERP_orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) {
    // FK puede fallar si el nombre ya existe; la tabla puede estar OK
    console.warn("ensurePaymentScheduleSchema customer:", e?.message || e);
  }
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS \`ERP_supplier_order_payment_installments\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`orderId\` INT NOT NULL,
        \`sequence\` INT NOT NULL DEFAULT 1,
        \`dueDate\` DATE NOT NULL,
        \`amount\` DECIMAL(14, 2) NOT NULL DEFAULT 0,
        \`notes\` VARCHAR(255) NULL,
        \`reminderEnabled\` TINYINT(1) NOT NULL DEFAULT 0,
        \`reminderDaysBefore\` TINYINT NOT NULL DEFAULT 1,
        \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_sup_order_pay_inst_order\` (\`orderId\`),
        KEY \`idx_sup_order_pay_inst_due\` (\`dueDate\`),
        CONSTRAINT \`fk_sup_order_pay_inst_order\`
          FOREIGN KEY (\`orderId\`) REFERENCES \`ERP_supplier_orders\` (\`id\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (e) {
    console.warn("ensurePaymentScheduleSchema supplier:", e?.message || e);
  }
  // Tablas viejas (sync Sequelize) pueden tener createdAt/updatedAt sin DEFAULT.
  for (const table of [
    "ERP_order_payment_installments",
    "ERP_supplier_order_payment_installments",
  ]) {
    for (const [column, definition] of [
      ["reminderEnabled", "TINYINT(1) NOT NULL DEFAULT 0"],
      ["reminderDaysBefore", "TINYINT NOT NULL DEFAULT 1"],
    ]) {
      try {
        const [found] = await sequelize.query(`SHOW COLUMNS FROM \`${table}\` LIKE '${column}'`);
        if (!Array.isArray(found) || !found.length) {
          await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        }
      } catch (e) {
        console.warn(`ensurePaymentScheduleSchema ${table}.${column}:`, e?.message || e);
      }
    }
    try {
      await sequelize.query(
        `ALTER TABLE \`${table}\`
         MODIFY \`createdAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         MODIFY \`updatedAt\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`,
      );
    } catch (e) {
      console.warn(`ensurePaymentScheduleSchema alter ${table}:`, e?.message || e);
    }
  }
  schemaReady = true;
}

function toDateOnly(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return toDateOnly(d);
}

/** Normaliza filas del body. */
export function normalizeInstallmentInput(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r, i) => {
      const dueDate = toDateOnly(r?.dueDate || r?.date);
      const amount = money2(r?.amount);
      if (!dueDate || !(amount > 0)) return null;
      return {
        sequence: Number(r?.sequence) > 0 ? Number(r.sequence) : i + 1,
        dueDate,
        amount,
        notes: r?.notes ? String(r.notes).slice(0, 255) : null,
        reminderEnabled: r?.reminderEnabled !== false,
        reminderDaysBefore: [0, 1, 2].includes(Number(r?.reminderDaysBefore))
          ? Number(r.reminderDaysBefore) : 1,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.sequence - b.sequence;
    })
    .map((r, i) => ({ ...r, sequence: i + 1 }));
}

/**
 * Reparte fechas entre start y end (inclusive) y montos iguales.
 * count=1 → solo endDate con total.
 */
export function buildEqualInstallments({ startDate, endDate, count, total }) {
  const n = Math.max(1, Math.min(36, Math.floor(Number(count) || 1)));
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate) || start;
  const totalAmt = money2(total);
  if (!start || !end || totalAmt <= 0) return [];

  const startMs = new Date(`${start}T12:00:00`).getTime();
  const endMs = new Date(`${end}T12:00:00`).getTime();
  const dates = [];
  if (n === 1) {
    dates.push(end);
  } else {
    for (let i = 0; i < n; i += 1) {
      const t = startMs + ((endMs - startMs) * i) / (n - 1);
      dates.push(toDateOnly(new Date(t)));
    }
  }

  const base = money2(Math.floor((totalAmt / n) * 100) / 100);
  const rows = dates.map((dueDate, i) => ({
    sequence: i + 1,
    dueDate,
    amount: base,
    notes: null,
  }));
  const sumBase = money2(base * n);
  rows[rows.length - 1].amount = money2(rows[rows.length - 1].amount + (totalAmt - sumBase));
  return rows;
}

export function applyFifoPaidToInstallments(installments, orderPaidAmount) {
  let left = money2(orderPaidAmount);
  return (installments || []).map((inst) => {
    const amount = money2(inst.amount);
    const paidAmount = money2(Math.min(left, amount));
    left = money2(Math.max(0, left - paidAmount));
    const remainingAmount = money2(Math.max(0, amount - paidAmount));
    const isPaid = remainingAmount <= 0.009;
    return {
      id: inst.id ?? null,
      sequence: inst.sequence,
      dueDate: inst.dueDate,
      amount,
      notes: inst.notes || null,
      reminderEnabled: Boolean(inst.reminderEnabled),
      reminderDaysBefore: [0, 1, 2].includes(Number(inst.reminderDaysBefore))
        ? Number(inst.reminderDaysBefore) : 1,
      paidAmount,
      remainingAmount,
      isPaid,
      locked: isPaid,
    };
  });
}

async function replaceInstallments(table, orderId, rows, transaction) {
  const oid = Number(orderId);
  const normalized = normalizeInstallmentInput(rows);
  await sequelize.query(`DELETE FROM \`${table}\` WHERE \`orderId\` = :oid`, {
    replacements: { oid },
    transaction,
    type: QueryTypes.DELETE,
  });
  for (const row of normalized) {
    await sequelize.query(
      `INSERT INTO \`${table}\` (\`orderId\`, \`sequence\`, \`dueDate\`, \`amount\`, \`notes\`, \`reminderEnabled\`, \`reminderDaysBefore\`, \`createdAt\`, \`updatedAt\`)
       VALUES (:oid, :seq, :due, :amt, :notes, :reminderEnabled, :reminderDaysBefore, NOW(), NOW())`,
      {
        replacements: {
          oid,
          seq: row.sequence,
          due: row.dueDate,
          amt: row.amount,
          notes: row.notes,
          reminderEnabled: row.reminderEnabled ? 1 : 0,
          reminderDaysBefore: row.reminderDaysBefore,
        },
        transaction,
        type: QueryTypes.INSERT,
      },
    );
  }
  return normalized;
}

export async function replaceCustomerInstallments(orderId, rows, { transaction } = {}) {
  await ensurePaymentScheduleSchema();
  return replaceInstallments("ERP_order_payment_installments", orderId, rows, transaction);
}

export async function replaceSupplierInstallments(orderId, rows, { transaction } = {}) {
  await ensurePaymentScheduleSchema();
  return replaceInstallments(
    "ERP_supplier_order_payment_installments",
    orderId,
    rows,
    transaction,
  );
}

async function loadInstallments(table, orderIds) {
  const ids = [...new Set((orderIds || []).map(Number).filter((n) => Number.isFinite(n) && n > 0))];
  if (!ids.length) return new Map();
  await ensurePaymentScheduleSchema();
  const rows = await sequelize.query(
    `SELECT \`id\`, \`orderId\`, \`sequence\`, \`dueDate\`, \`amount\`, \`notes\`,
      \`reminderEnabled\`, \`reminderDaysBefore\`
     FROM \`${table}\`
     WHERE \`orderId\` IN (:ids)
     ORDER BY \`orderId\` ASC, \`dueDate\` ASC, \`sequence\` ASC`,
    { replacements: { ids }, type: QueryTypes.SELECT },
  );
  const map = new Map();
  for (const r of rows || []) {
    const oid = Number(r.orderId);
    if (!map.has(oid)) map.set(oid, []);
    map.get(oid).push({
      id: Number(r.id),
      sequence: Number(r.sequence),
      dueDate: toDateOnly(r.dueDate),
      amount: money2(r.amount),
      notes: r.notes || null,
      reminderEnabled: Boolean(r.reminderEnabled),
      reminderDaysBefore: [0, 1, 2].includes(Number(r.reminderDaysBefore))
        ? Number(r.reminderDaysBefore) : 1,
    });
  }
  return map;
}

export async function loadCustomerInstallmentsMap(orderIds) {
  return loadInstallments("ERP_order_payment_installments", orderIds);
}

export async function loadSupplierInstallmentsMap(orderIds) {
  return loadInstallments("ERP_supplier_order_payment_installments", orderIds);
}

/** Adjunta paymentInstallments con FIFO a filas ya formateadas. */
export function attachInstallmentsToRows(rows, instMap, paidAmountKey = "paidAmount") {
  return (rows || []).map((row) => {
    const raw = instMap.get(Number(row.id)) || [];
    const paid = money2(row?.[paidAmountKey] || 0);
    const paymentInstallments = applyFifoPaidToInstallments(raw, paid);
    return {
      ...row,
      paymentInstallments,
      paymentDueDate:
        paymentInstallments.length > 0
          ? paymentInstallments[paymentInstallments.length - 1].dueDate
          : null,
      ...summarizeNextCredit(paymentInstallments),
    };
  });
}

/** Próxima cuota pendiente (para cobranzas / listados). */
export function summarizeNextCredit(installments) {
  const pending = (installments || [])
    .filter((i) => !i.isPaid && money2(i.remainingAmount ?? i.amount) > 0.009)
    .slice()
    .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")));
  if (!pending.length) {
    return {
      nextCreditDue: null,
      nextCreditAmount: null,
      pendingCreditCount: 0,
    };
  }
  return {
    nextCreditDue: pending[0].dueDate || null,
    nextCreditAmount: money2(pending[0].remainingAmount ?? pending[0].amount),
    pendingCreditCount: pending.length,
  };
}

/**
 * Actualiza cuotas preservando las ya liquidadas (FIFO locked).
 * `rows` = plan editable (puede incluir locked para referencia; se ignoran cambios en locked).
 */
export async function syncCustomerInstallmentsPreservingPaid(
  orderId,
  rows,
  orderPaidAmount,
  { transaction } = {},
) {
  await ensurePaymentScheduleSchema();
  const map = await loadCustomerInstallmentsMap([orderId]);
  const current = applyFifoPaidToInstallments(map.get(Number(orderId)) || [], orderPaidAmount);
  const locked = current.filter((i) => i.locked);
  const lockedIds = new Set(locked.map((l) => Number(l.id)).filter(Boolean));

  const clientUnlocked = normalizeInstallmentInput(
    (rows || []).filter((r) => {
      const id = Number(r?.id);
      if (id && lockedIds.has(id)) return false;
      return true;
    }),
  );

  const finalRows = [
    ...locked.map((l) => ({
      sequence: l.sequence,
      dueDate: l.dueDate,
      amount: l.amount,
      notes: l.notes,
      reminderEnabled: l.reminderEnabled,
      reminderDaysBefore: l.reminderDaysBefore,
    })),
    ...clientUnlocked,
  ];
  return replaceCustomerInstallments(orderId, finalRows, { transaction });
}

export async function syncSupplierInstallmentsPreservingPaid(
  orderId,
  rows,
  orderPaidAmount,
  { transaction } = {},
) {
  await ensurePaymentScheduleSchema();
  const map = await loadSupplierInstallmentsMap([orderId]);
  const current = applyFifoPaidToInstallments(map.get(Number(orderId)) || [], orderPaidAmount);
  const locked = current.filter((i) => i.locked);
  const lockedIds = new Set(locked.map((l) => Number(l.id)).filter(Boolean));

  const clientUnlocked = normalizeInstallmentInput(
    (rows || []).filter((r) => {
      const id = Number(r?.id);
      if (id && lockedIds.has(id)) return false;
      return true;
    }),
  );

  const finalRows = [
    ...locked.map((l) => ({
      sequence: l.sequence,
      dueDate: l.dueDate,
      amount: l.amount,
      notes: l.notes,
      reminderEnabled: l.reminderEnabled,
      reminderDaysBefore: l.reminderDaysBefore,
    })),
    ...clientUnlocked,
  ];
  return replaceSupplierInstallments(orderId, finalRows, { transaction });
}

const billable = (item) => money2(
  Math.max(0, (Number(item?.quantity) || 0) - (Number(item?.damagedQty) || 0) - (Number(item?.giftQty) || 0))
    * (Number(item?.price) || 0),
);

async function customerPaidAmounts(orders) {
  const paid = new Map(), items = new Map(), owners = new Map();
  for (const order of orders) for (const item of order.ERP_order_items || []) {
    items.set(Number(item.id), item); owners.set(Number(item.id), Number(order.id));
  }
  const linked = await ItemGroupItem.findAll({ where: { orderItemId: [...items.keys()] }, attributes: ["groupId", "orderItemId"] });
  const groupIds = [...new Set(linked.map((link) => Number(link.groupId)).filter(Boolean))];
  if (groupIds.length) {
    const [links, payments] = await Promise.all([
      ItemGroupItem.findAll({ where: { groupId: groupIds }, attributes: ["groupId", "orderItemId"] }),
      Payment.findAll({ where: { groupId: groupIds, status: "completed" }, attributes: ["groupId", "amount"] }),
    ]);
    const missing = [...new Set(links.map((link) => Number(link.orderItemId)).filter((id) => id && !items.has(id)))];
    if (missing.length) for (const item of await OrderItem.findAll({
      where: { id: missing }, attributes: ["id", "quantity", "price", "damagedQty", "giftQty"],
    })) items.set(Number(item.id), item);
    const groupLines = new Map(), groupPaid = new Map();
    for (const link of links) {
      const group = Number(link.groupId);
      if (!groupLines.has(group)) groupLines.set(group, new Map());
      groupLines.get(group).set(Number(link.orderItemId), billable(items.get(Number(link.orderItemId))));
    }
    for (const payment of payments) {
      const group = Number(payment.groupId);
      groupPaid.set(group, money2((groupPaid.get(group) || 0) + Number(payment.amount || 0)));
    }
    for (const [group, lines] of groupLines) {
      const total = money2([...lines.values()].reduce((sum, value) => sum + value, 0));
      const amount = groupPaid.get(group) || 0;
      if (total <= BILLABLE_EPSILON || amount <= BILLABLE_EPSILON) continue;
      const shares = new Map();
      for (const [itemId, value] of lines) {
        const orderId = owners.get(itemId);
        if (orderId) shares.set(orderId, money2((shares.get(orderId) || 0) + value));
      }
      const entries = [...shares.entries()]; let allocated = 0;
      entries.forEach(([orderId, share], index) => {
        const value = index === entries.length - 1 ? money2(amount - allocated) : money2((amount * share) / total);
        allocated = money2(allocated + value);
        paid.set(orderId, money2((paid.get(orderId) || 0) + value));
      });
    }
  }
  for (const order of orders) {
    const orderItems = order.ERP_order_items || [];
    const total = money2(orderItems.reduce((sum, item) => sum + billable(item), 0));
    const floor = money2(orderItems.filter((item) => item.paidAt).reduce((sum, item) => sum + billable(item), 0));
    let amount = paid.get(Number(order.id)) || 0;
    if (amount <= BILLABLE_EPSILON && orderItems.length && orderItems.every((item) => item.paidAt)) amount = total;
    else amount = Math.max(amount, floor);
    paid.set(Number(order.id), money2(Math.min(amount, total)));
  }
  return paid;
}

async function runInstallmentReminders(kind, table, targetDate) {
  const due = await sequelize.query(
    `SELECT \`id\`, \`orderId\` FROM \`${table}\`
     WHERE \`reminderEnabled\` = 1
       AND DATE_SUB(\`dueDate\`, INTERVAL \`reminderDaysBefore\` DAY) = :targetDate`,
    { replacements: { targetDate }, type: QueryTypes.SELECT },
  );
  if (!due.length) return 0;
  const orderIds = [...new Set(due.map((row) => Number(row.orderId)).filter(Boolean))];
  const [orders, schedules, users] = await Promise.all([
    kind === "customer" ? Order.findAll({ where: { id: orderIds }, include: [
      { model: Customer, as: "ERP_customer", attributes: ["name"] },
      { model: OrderItem, as: "ERP_order_items" },
    ] }) : SupplierOrder.findAll({ where: { id: orderIds }, include: [
      { model: Supplier, as: "ERP_supplier", attributes: ["name"] },
      { model: SupplierOrderItem, as: "ERP_supplier_order_items" },
    ] }),
    kind === "customer" ? loadCustomerInstallmentsMap(orderIds) : loadSupplierInstallmentsMap(orderIds),
    resolveAdminUserIds(),
  ]);
  if (!users.length) return 0;
  const paid = kind === "customer" ? await customerPaidAmounts(orders) : new Map(
    (await SupplierOrderPayment.findAll({ where: { supplierOrderId: orderIds, status: "completed" }, attributes: ["supplierOrderId", "amount"] }))
      .reduce((map, payment) => {
        const id = Number(payment.supplierOrderId);
        map.set(id, money2((map.get(id) || 0) + Number(payment.amount || 0)));
        return map;
      }, new Map()),
  );
  let sent = 0;
  for (const row of due) {
    const order = orders.find((candidate) => Number(candidate.id) === Number(row.orderId));
    const installment = order && applyFifoPaidToInstallments(schedules.get(Number(row.orderId)) || [], paid.get(Number(row.orderId)) || 0)
      .find((candidate) => Number(candidate.id) === Number(row.id));
    if (!installment || installment.isPaid) continue;
    const name = kind === "customer" ? order.ERP_customer?.name || "Cliente" : order.ERP_supplier?.name || "Proveedor";
    for (const userId of users) {
      await createAndPushNotification({
        userId, type: "alert",
        title: `Recordatorio de cuota: ${kind === "customer" ? "cobro a cliente" : "pago a proveedor"}`,
        message: `${name}: pedido #${order.id}, cuota ${installment.sequence} por $${installment.remainingAmount.toFixed(2)} vence el ${installment.dueDate}.`,
        link: kind === "customer" ? "/orders" : "/supplier-orders",
        sourceKey: `payment_installment:${kind}:${installment.id}:${targetDate}`,
      });
      sent += 1;
    }
  }
  return sent;
}

export async function runPaymentInstallmentReminders() {
  await ensurePaymentScheduleSchema();
  const date = todayDateOnly();
  const [customer, supplier] = await Promise.all([
    runInstallmentReminders("customer", "ERP_order_payment_installments", date),
    runInstallmentReminders("supplier", "ERP_supplier_order_payment_installments", date),
  ]);
  return customer + supplier;
}
