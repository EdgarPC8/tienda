/**
 * Préstamos (sin pedido): obligaciones + plazos + abonos vía Income/Expense.
 * receivable = préstamo que das; payable = préstamo que recibes.
 */
import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { Customer } from "../../models/Orders.js";
import {
  FinancialObligation,
  ObligationPayment,
  Income,
  Expense,
} from "../../models/Finance.js";
import { getHeaderToken, verifyJWT } from "../../libs/jwt.js";
import { toFinanceDateTime } from "../../utils/financeDateTime.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const toNum = (v, def = 0) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? n : def;
};

const roundMoney = (x) => Number(Number(x || 0).toFixed(2));
const EPS = 0.0001;

const toDateOnlySafe = (v) => {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
};

let scheduleColumnReady = false;

async function ensureObligationScheduleColumn() {
  if (scheduleColumnReady) return;
  try {
    const [found] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_finance_obligations` LIKE 'schedule'",
    );
    if (!Array.isArray(found) || !found.length) {
      await sequelize.query(
        "ALTER TABLE `ERP_finance_obligations` ADD COLUMN `schedule` JSON NULL",
      );
    }
    scheduleColumnReady = true;
  } catch (err) {
    const code = err?.parent?.code || err?.original?.code;
    if (code === "ER_DUP_FIELDNAME") {
      scheduleColumnReady = true;
      return;
    }
    throw err;
  }
}

function parseStoredSchedule(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** Reparte lo abonado de la más antigua a la más nueva. */
function projectInstallments(obligation, paid) {
  const stored = parseStoredSchedule(obligation.schedule);
  let rows = stored
    .map((r, i) => ({
      sequence: Number(r.sequence) || i + 1,
      dueDate: toDateOnlySafe(r.dueDate),
      amount: roundMoney(r.amount),
    }))
    .filter((r) => r.dueDate && r.amount > 0);

  if (!rows.length) {
    const due = toDateOnlySafe(obligation.dueDate) || toDateOnlySafe(obligation.openDate);
    if (due) {
      rows = [{ sequence: 1, dueDate: due, amount: roundMoney(obligation.originalAmount) }];
    }
  }

  let pool = roundMoney(paid);
  return rows.map((r) => {
    const cover = roundMoney(Math.min(r.amount, Math.max(0, pool)));
    pool = roundMoney(pool - cover);
    const remainingAmount = roundMoney(Math.max(0, r.amount - cover));
    return {
      sequence: r.sequence,
      dueDate: r.dueDate,
      amount: r.amount,
      paidAmount: cover,
      remainingAmount,
      isPaid: remainingAmount <= EPS,
    };
  });
}

function normalizeIncomingSchedule(installments, total, fallbackDate) {
  const fallback = toDateOnlySafe(fallbackDate);
  if (!Array.isArray(installments) || installments.length === 0) {
    if (!fallback) return { error: "Indica la fecha del plazo" };
    return {
      rows: [{ sequence: 1, dueDate: fallback, amount: total }],
      lastDue: fallback,
    };
  }
  if (installments.length > 36) return { error: "Máximo 36 plazos" };
  const rows = [];
  for (let i = 0; i < installments.length; i += 1) {
    const due = toDateOnlySafe(installments[i]?.dueDate);
    const amount = roundMoney(installments[i]?.amount);
    if (!due || amount <= 0) {
      return { error: `El plazo ${i + 1} necesita fecha y monto` };
    }
    rows.push({ sequence: i + 1, dueDate: due, amount });
  }
  const sum = roundMoney(rows.reduce((acc, r) => acc + r.amount, 0));
  if (Math.abs(sum - total) > 0.02) {
    return {
      error: `La suma de plazos ($${sum.toFixed(2)}) no coincide con el monto ($${total.toFixed(2)})`,
    };
  }
  return { rows, lastDue: rows[rows.length - 1].dueDate };
}

const partyTypeLabel = {
  customer: "Cliente",
  employee: "Empleado",
  supplier: "Proveedor",
  other: "Otro",
};

const directionLabel = {
  receivable: "Préstamo que das",
  payable: "Préstamo que recibes",
};

async function getObligationFinancials(obligationId, t, excludePaymentId = null) {
  const obligation = await FinancialObligation.findByPk(obligationId, { transaction: t });
  if (!obligation) return null;

  const payments = await ObligationPayment.findAll({
    where: { obligationId, status: "completed" },
    transaction: t,
    order: [["date", "ASC"], ["id", "ASC"]],
  });

  let paid = 0;
  for (const p of payments) {
    if (excludePaymentId != null && Number(p.id) === Number(excludePaymentId)) continue;
    paid = roundMoney(paid + toNum(p.amount));
  }

  const total = roundMoney(obligation.originalAmount);
  const remaining = roundMoney(Math.max(0, total - paid));

  return { obligation, payments, total, paid, remaining };
}

function mapObligationRow(row, fin) {
  const o = row.toJSON ? row.toJSON() : row;
  const total = fin?.total ?? roundMoney(o.originalAmount);
  const paid = fin?.paid ?? 0;
  const remaining = fin?.remaining ?? total;
  return {
    ...o,
    partyTypeLabel: partyTypeLabel[o.partyType] || o.partyType,
    directionLabel: directionLabel[o.direction] || o.direction,
    total,
    paid,
    remaining,
    isSettled: remaining <= EPS,
    customer: o.customer || null,
    installments: projectInstallments(o, paid),
  };
}

/** Resumen para dashboard (misma lógica que workbench, sin filtros). */
export async function computeObligationsDashboardData() {
  await ensureObligationScheduleColumn();
  const obligations = await FinancialObligation.findAll({
    include: [
      { model: Customer, as: "customer", attributes: ["id", "name"], required: false },
    ],
    order: [["openDate", "DESC"], ["id", "DESC"]],
  });

  const rows = [];
  let totalReceivable = 0;
  let totalPayable = 0;

  for (const row of obligations) {
    const fin = await getObligationFinancials(row.id);
    const mapped = mapObligationRow(row, fin);
    rows.push(mapped);
    if (row.status === "open") {
      if (row.direction === "receivable") totalReceivable += mapped.remaining;
      else totalPayable += mapped.remaining;
    }
  }

  const topOpen = rows
    .filter((r) => r.status === "open" && r.remaining > EPS)
    .sort((a, b) => b.remaining - a.remaining)
    .slice(0, 6)
    .map((r) => ({
      id: r.id,
      direction: r.direction,
      partyName: r.partyName,
      concept: r.concept,
      remaining: r.remaining,
      openDate: r.openDate,
    }));

  return {
    summary: {
      totalReceivable: roundMoney(totalReceivable),
      totalPayable: roundMoney(totalPayable),
      openCount: rows.filter((r) => r.status === "open").length,
    },
    topOpen,
  };
}

export const getObligationsWorkbench = async (req, res) => {
  try {
    await ensureObligationScheduleColumn();
    const { direction, status, q } = req.query;
    const where = {};
    if (direction === "receivable" || direction === "payable") where.direction = direction;
    if (status === "open" || status === "closed" || status === "cancelled") where.status = status;
    if (q?.trim()) {
      where[Op.or] = [
        { partyName: { [Op.like]: `%${q.trim()}%` } },
        { concept: { [Op.like]: `%${q.trim()}%` } },
      ];
    }

    const obligations = await FinancialObligation.findAll({
      where,
      include: [
        { model: Customer, as: "customer", attributes: ["id", "name", "phone"], required: false },
        {
          model: ObligationPayment,
          as: "payments",
          where: { status: "completed" },
          required: false,
        },
      ],
      order: [["openDate", "DESC"], ["id", "DESC"]],
    });

    const rows = [];
    let totalReceivable = 0;
    let totalPayable = 0;

    for (const row of obligations) {
      const fin = await getObligationFinancials(row.id);
      const mapped = mapObligationRow(row, fin);
      rows.push(mapped);
      if (row.status === "open") {
        if (row.direction === "receivable") totalReceivable += mapped.remaining;
        else totalPayable += mapped.remaining;
      }
    }

    res.json({
      summary: {
        totalReceivable: roundMoney(totalReceivable),
        totalPayable: roundMoney(totalPayable),
        openCount: rows.filter((r) => r.status === "open").length,
      },
      obligations: rows,
    });
  } catch (err) {
    console.error("getObligationsWorkbench error:", err);
    res.status(500).json({ message: "Error al cargar préstamos" });
  }
};

export const getObligationById = async (req, res) => {
  try {
    await ensureObligationScheduleColumn();
    const obligation = await FinancialObligation.findByPk(req.params.id, {
      include: [
        { model: Customer, as: "customer", attributes: ["id", "name", "phone"], required: false },
        {
          model: ObligationPayment,
          as: "payments",
          order: [["date", "DESC"], ["id", "DESC"]],
        },
      ],
    });
    if (!obligation) return res.status(404).json({ message: "Obligación no encontrada" });

    const fin = await getObligationFinancials(obligation.id);
    res.json(mapObligationRow(obligation, fin));
  } catch (err) {
    console.error("getObligationById error:", err);
    res.status(500).json({ message: "Error al obtener obligación" });
  }
};

export const createObligation = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const {
      direction,
      partyType = "other",
      partyName,
      customerId,
      concept,
      amount,
      openDate,
      dueDate,
      note,
      installments,
    } = req.body || {};

    if (!["receivable", "payable"].includes(direction)) {
      notifyFail("obligation.create_failed", "direction debe ser receivable o payable", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "direction debe ser receivable o payable" });
    }

    const amt = roundMoney(amount);
    if (amt <= 0) {
      notifyFail("obligation.create_failed", "Monto inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Monto inválido" });
    }

    let resolvedName = String(partyName || "").trim();
    let resolvedCustomerId = customerId ? Number(customerId) : null;

    if (partyType === "customer") {
      if (!resolvedCustomerId) {
        notifyFail("obligation.create_failed", "Selecciona un cliente", { req, httpStatus: 400 });
        return res.status(400).json({ message: "Selecciona un cliente" });
      }
      const customer = await Customer.findByPk(resolvedCustomerId);
      if (!customer) {
        notifyFail("obligation.create_failed", "Cliente no encontrado", { req, httpStatus: 404 });
        return res.status(404).json({ message: "Cliente no encontrado" });
      }
      resolvedName = customer.name;
    } else if (!resolvedName) {
      notifyFail("obligation.create_failed", "Indica el nombre de la persona", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Indica el nombre de la persona" });
    }

    const conceptText =
      String(concept || "").trim() ||
      (direction === "receivable" ? "Préstamo otorgado" : "Préstamo recibido");
    const dateOnly = toFinanceDateTime(openDate);
    const schedule = normalizeIncomingSchedule(installments, amt, dueDate || openDate);
    if (schedule.error) {
      notifyFail("obligation.create_failed", schedule.error, { req, httpStatus: 400 });
      return res.status(400).json({ message: schedule.error });
    }

    await ensureObligationScheduleColumn();

    const result = await sequelize.transaction(async (t) => {
      const obligation = await FinancialObligation.create(
        {
          direction,
          partyType,
          customerId: resolvedCustomerId,
          partyName: resolvedName,
          concept: conceptText,
          originalAmount: amt,
          openDate: dateOnly,
          dueDate: toFinanceDateTime(schedule.lastDue),
          schedule: schedule.rows,
          status: "open",
          note: note || null,
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      const counterparty = resolvedName;
      let initialFinanceType;
      let initialFinanceId;

      if (direction === "receivable") {
        const expense = await Expense.create(
          {
            date: dateOnly,
            amount: amt,
            concept: `Préstamo a ${counterparty}: ${conceptText}`,
            category: "Préstamo otorgado",
            status: "paid",
            referenceType: "obligation_open",
            referenceId: obligation.id,
            counterpartyName: counterparty,
            createdBy: user.accountId,
          },
          { transaction: t }
        );
        initialFinanceType = "expense";
        initialFinanceId = expense.id;
      } else {
        const income = await Income.create(
          {
            date: dateOnly,
            amount: amt,
            concept: `Préstamo recibido de ${counterparty}: ${conceptText}`,
            category: "Préstamo recibido",
            status: "paid",
            referenceType: "obligation_open",
            referenceId: obligation.id,
            counterpartyName: counterparty,
            createdBy: user.accountId,
          },
          { transaction: t }
        );
        initialFinanceType = "income";
        initialFinanceId = income.id;
      }

      obligation.initialFinanceType = initialFinanceType;
      obligation.initialFinanceId = initialFinanceId;
      await obligation.save({ transaction: t });

      const fin = await getObligationFinancials(obligation.id, t);
      return mapObligationRow(obligation, fin);
    });

    notifyOk("obligation.created", "Obligación creada", { obligation: result });
    res.status(201).json(result);
  } catch (err) {
    console.error("createObligation error:", err);
    notifyFail("obligation.create_failed", "Error al registrar el préstamo", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al registrar el préstamo" });
  }
};

export const payObligation = async (req, res) => {
  try {
    await ensureObligationScheduleColumn();
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const { id } = req.params;
    const { amount, date, method, note } = req.body || {};

    const payAmount = roundMoney(amount);
    if (payAmount <= 0) {
      notifyFail("obligation.pay_failed", "Monto inválido", { req, httpStatus: 400, extra: { obligationId: id } });
      return res.status(400).json({ message: "Monto inválido" });
    }

    const result = await sequelize.transaction(async (t) => {
      const fin = await getObligationFinancials(id, t);
      if (!fin) return { status: 404, body: { message: "Obligación no encontrada" } };
      const { obligation, remaining } = fin;

      if (obligation.status !== "open") {
        return { status: 400, body: { message: "La obligación no está abierta" } };
      }
      if (payAmount > remaining + EPS) {
        return {
          status: 400,
          body: { message: `El monto excede el saldo ($${remaining.toFixed(2)})` },
        };
      }

      const paymentDate = toFinanceDateTime(date);
      const newRemaining = roundMoney(remaining - payAmount);
      const isFull = newRemaining <= EPS;
      const counterparty = obligation.partyName;

      let financeType;
      let financeId;

      if (obligation.direction === "receivable") {
        const income = await Income.create(
          {
            date: paymentDate,
            amount: payAmount,
            concept: isFull
              ? `Cobro total préstamo: ${counterparty} — ${obligation.concept}`
              : `Abono préstamo: ${counterparty} — $${payAmount.toFixed(2)} (pend. $${newRemaining.toFixed(2)})`,
            category: "Cobro de préstamo",
            status: "paid",
            referenceType: "obligation_payment",
            referenceId: null,
            counterpartyName: counterparty,
            createdBy: user.accountId,
          },
          { transaction: t }
        );
        financeType = "income";
        financeId = income.id;
      } else {
        const expense = await Expense.create(
          {
            date: paymentDate,
            amount: payAmount,
            concept: isFull
              ? `Pago total préstamo: ${counterparty} — ${obligation.concept}`
              : `Abono préstamo recibido: ${counterparty} — $${payAmount.toFixed(2)} (pend. $${newRemaining.toFixed(2)})`,
            category: "Pago de préstamo",
            status: "paid",
            referenceType: "obligation_payment",
            referenceId: null,
            counterpartyName: counterparty,
            createdBy: user.accountId,
          },
          { transaction: t }
        );
        financeType = "expense";
        financeId = expense.id;
      }

      const payment = await ObligationPayment.create(
        {
          obligationId: obligation.id,
          date: paymentDate,
          amount: payAmount,
          method: method || "efectivo",
          note: note || null,
          financeType,
          financeId,
          status: "completed",
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      if (financeType === "income") {
        await Income.update(
          { referenceId: payment.id },
          { where: { id: financeId }, transaction: t }
        );
      } else {
        await Expense.update(
          { referenceId: payment.id },
          { where: { id: financeId }, transaction: t }
        );
      }

      if (isFull) {
        obligation.status = "closed";
        await obligation.save({ transaction: t });
      }

      const updated = await getObligationFinancials(obligation.id, t);
      return {
        status: 200,
        body: {
          payment,
          obligation: mapObligationRow(obligation, updated),
        },
      };
    });

    if (result.status >= 400) {
      notifyFail("obligation.pay_failed", result.body?.message || "Error al registrar abono", {
        req,
        httpStatus: result.status,
        extra: { obligationId: id },
      });
    } else {
      notifyOk("obligation.paid", `Obligación #${id} pagada`, {
        obligationId: id,
        payment: result.body?.payment,
      });
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("payObligation error:", err);
    notifyFail("obligation.pay_failed", "Error al registrar abono", {
      error: err,
      req,
      httpStatus: 500,
      extra: { obligationId: req.params.id },
    });
    res.status(500).json({ message: "Error al registrar abono" });
  }
};

export const cancelObligation = async (req, res) => {
  try {
    await ensureObligationScheduleColumn();
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const result = await sequelize.transaction(async (t) => {
      const fin = await getObligationFinancials(req.params.id, t);
      if (!fin) return { status: 404, body: { message: "Obligación no encontrada" } };
      const { obligation, paid } = fin;

      if (obligation.status !== "open") {
        return { status: 400, body: { message: "Solo se pueden anular obligaciones abiertas" } };
      }
      if (paid > EPS) {
        return { status: 400, body: { message: "No se puede anular: ya tiene abonos registrados" } };
      }

      if (obligation.initialFinanceType === "expense" && obligation.initialFinanceId) {
        const deleted = await Expense.destroy({
          where: {
            id: obligation.initialFinanceId,
            referenceType: "obligation_open",
            referenceId: obligation.id,
          },
          transaction: t,
        });
        if (!deleted) {
          return {
            status: 400,
            body: { message: "No se encontró el egreso inicial en finanzas para revertir" },
          };
        }
      } else if (obligation.initialFinanceType === "income" && obligation.initialFinanceId) {
        const deleted = await Income.destroy({
          where: {
            id: obligation.initialFinanceId,
            referenceType: "obligation_open",
            referenceId: obligation.id,
          },
          transaction: t,
        });
        if (!deleted) {
          return {
            status: 400,
            body: { message: "No se encontró el ingreso inicial en finanzas para revertir" },
          };
        }
      }

      obligation.status = "cancelled";
      obligation.initialFinanceId = null;
      obligation.initialFinanceType = null;
      await obligation.save({ transaction: t });

      return {
        status: 200,
        body: {
          message: "Obligación anulada y movimiento eliminado de finanzas",
          obligation,
        },
      };
    });

    if (result.status >= 400) {
      notifyFail("obligation.cancel_failed", result.body?.message || "Error al anular obligación", {
        req,
        httpStatus: result.status,
        extra: { obligationId: req.params.id },
      });
    } else {
      notifyOk("obligation.cancelled", `Obligación #${req.params.id} cancelada`, {
        obligationId: req.params.id,
      });
    }
    return res.status(result.status).json(result.body);
  } catch (err) {
    console.error("cancelObligation error:", err);
    notifyFail("obligation.cancel_failed", "Error al anular obligación", {
      error: err,
      req,
      httpStatus: 500,
      extra: { obligationId: req.params.id },
    });
    res.status(500).json({ message: "Error al anular obligación" });
  }
};
