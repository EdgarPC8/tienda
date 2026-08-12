/**
 * Cuotas / fechas de pago de pedidos (cliente y proveedor).
 * Las cuotas son el calendario de liquidación; el abono real sigue en finanzas.
 * El progreso se proyecta FIFO sobre el paidAmount del pedido.
 */
import { QueryTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

const money2 = (n) => Number(Number(n || 0).toFixed(2));

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
      `INSERT INTO \`${table}\` (\`orderId\`, \`sequence\`, \`dueDate\`, \`amount\`, \`notes\`, \`createdAt\`, \`updatedAt\`)
       VALUES (:oid, :seq, :due, :amt, :notes, NOW(), NOW())`,
      {
        replacements: {
          oid,
          seq: row.sequence,
          due: row.dueDate,
          amt: row.amount,
          notes: row.notes,
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
    `SELECT \`id\`, \`orderId\`, \`sequence\`, \`dueDate\`, \`amount\`, \`notes\`
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
    })),
    ...clientUnlocked,
  ];
  return replaceSupplierInstallments(orderId, finalRows, { transaction });
}
