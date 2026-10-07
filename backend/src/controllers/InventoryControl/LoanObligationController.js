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
import { getAppSettingsSync, normalizeMaxInstallments } from "../../services/appSettingsService.js";

const toNum = (v, def = 0) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? n : def;
};

const roundMoney = (x) => {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(2));
};
const EPS = 0.0001;
const MONEY_MAX = 99999999.99;
const DATE_YEAR_MIN = 2000;
const DATE_YEAR_MAX = 2100;
const PAY_METHODS = new Set(["efectivo", "transferencia", "otro"]);
const PARTY_TYPES = new Set(["customer", "employee", "supplier", "other"]);

function parseMoney(value) {
  if (value == null || (typeof value === "string" && value.trim() === "")) return { error: "Monto inválido" };
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  if (!Number.isFinite(n)) return { error: "Monto inválido" };
  const amount = Number(n.toFixed(2));
  if (amount > MONEY_MAX) return { error: "El monto supera el máximo permitido" };
  return { amount };
}

function strictDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    value = `${y}-${m}-${d}`;
  }
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < DATE_YEAR_MIN || year > DATE_YEAR_MAX) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function loanRateError(terms) {
  if (!terms || typeof terms !== "object") return "Indica la tasa del préstamo";
  const rate = Number(terms.annualRate);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) return "La tasa debe estar entre 0 % y 100 %";
  for (const key of ["tea", "annualCost", "mora"]) {
    if (terms[key] == null || terms[key] === "") continue;
    const n = Number(terms[key]);
    if (!Number.isFinite(n) || n < 0 || n > 100) return "Las tasas deben estar entre 0 % y 100 %";
  }
  return null;
}

function normalizeLabelColor(value) {
  const color = String(value || "").trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) return null;
  return color.toUpperCase();
}

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
    const [terms] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_finance_obligations` LIKE 'loanTerms'",
    );
    if (!Array.isArray(terms) || !terms.length) {
      await sequelize.query(
        "ALTER TABLE `ERP_finance_obligations` ADD COLUMN `loanTerms` JSON NULL",
      );
    }
    const [colorCol] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_finance_obligations` LIKE 'labelColor'",
    );
    if (!Array.isArray(colorCol) || !colorCol.length) {
      await sequelize.query(
        "ALTER TABLE `ERP_finance_obligations` ADD COLUMN `labelColor` VARCHAR(7) NULL",
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
      ...scheduleBreakdown(r),
      sequence: Number(r.sequence) || i + 1,
      dueDate: toDateOnlySafe(r.dueDate),
      amount: roundMoney(r.amount),
      historical: r.historical === true || r.historical === 1,
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
    if (r.historical) {
      return {
        sequence: r.sequence,
        dueDate: r.dueDate,
        amount: r.amount,
        ...scheduleBreakdown(r),
        historical: true,
        paidAmount: 0,
        remainingAmount: 0,
        isPaid: true,
      };
    }
    const cover = roundMoney(Math.min(r.amount, Math.max(0, pool)));
    pool = roundMoney(pool - cover);
    const remainingAmount = roundMoney(Math.max(0, r.amount - cover));
    return {
      sequence: r.sequence,
      dueDate: r.dueDate,
      amount: r.amount,
      ...scheduleBreakdown(r),
      paidAmount: cover,
      remainingAmount,
      isPaid: remainingAmount <= EPS,
    };
  });
}

function scheduleBreakdown(r) {
  const out = {};
  for (const key of [
    "capitalReducido",
    "interest",
    "capitalCuota",
    "seguroDesgravamen",
    "seguroIncendio",
    "tasa",
  ]) {
    if (r[key] == null || r[key] === "") continue;
    const n = Number(r[key]);
    if (!Number.isFinite(n)) continue;
    out[key] = key === "tasa" ? n : roundMoney(n);
  }
  if (out.capitalCuota != null) out.dividendo = roundMoney(r.amount);
  return out;
}

function payableTotal(obligation) {
  const rows = parseStoredSchedule(obligation.schedule);
  if (!rows.length) return roundMoney(obligation.originalAmount);
  const billable = rows.filter((r) => r.historical !== true && r.historical !== 1);
  return roundMoney(billable.reduce((acc, r) => acc + toNum(r.amount), 0));
}

function normalizeIncomingSchedule(installments, total, fallbackDate, french = false) {
  const fallback = strictDate(fallbackDate);
  if (!Array.isArray(installments) || installments.length === 0) {
    if (!fallback) return { error: "Indica la fecha del plazo" };
    return {
      rows: [{ sequence: 1, dueDate: fallback, amount: total }],
      lastDue: fallback,
    };
  }
  const maxPlazos = normalizeMaxInstallments(getAppSettingsSync()?.maxInstallments);
  if (installments.length > maxPlazos) return { error: `Máximo ${maxPlazos} plazos` };
  const rows = [];
  for (let i = 0; i < installments.length; i += 1) {
    const due = strictDate(installments[i]?.dueDate);
    const parsedAmount = parseMoney(installments[i]?.amount);
    const amount = parsedAmount.amount;
    if (!due || parsedAmount.error || amount <= 0) {
      return { error: `El plazo ${i + 1} necesita una fecha real y un monto mayor a cero` };
    }
    const extra = french ? scheduleBreakdown(installments[i]) : {};
    rows.push({
      sequence: i + 1,
      dueDate: due,
      amount,
      ...extra,
      ...(french && installments[i]?.historical ? { historical: true } : {}),
    });
  }
  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  rows.forEach((row, index) => {
    row.sequence = index + 1;
  });
  const sum = roundMoney(rows.reduce((acc, r) => acc + r.amount, 0));
  if (!french && Math.abs(sum - total) > 0.02) {
    return {
      error: `La suma de plazos ($${sum.toFixed(2)}) no coincide con el monto ($${total.toFixed(2)})`,
    };
  }
  if (french) {
    if (rows.some((row) => row.capitalCuota == null)) {
      return { error: "Cada cuota debe incluir el capital que abona" };
    }
    const capitalSum = roundMoney(rows.reduce((acc, row) => acc + Number(row.capitalCuota), 0));
    if (Math.abs(capitalSum - total) > 0.02) {
      return {
        error: `La suma del capital de las cuotas ($${capitalSum.toFixed(2)}) no coincide con el monto ($${total.toFixed(2)})`,
      };
    }
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

  const total = payableTotal(obligation);
  const remaining = roundMoney(Math.max(0, total - paid));

  return { obligation, payments, total, paid, remaining };
}

function parseStoredLoanTerms(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof raw === "object" ? raw : null;
}

function mapObligationRow(row, fin) {
  const o = row.toJSON ? row.toJSON() : row;
  const total = fin?.total ?? roundMoney(o.originalAmount);
  const paid = fin?.paid ?? 0;
  const remaining = fin?.remaining ?? total;
  return {
    ...o,
    loanTerms: parseStoredLoanTerms(o.loanTerms),
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
      loanTerms,
      amortizationFrench,
      labelColor,
    } = req.body || {};

    if (!["receivable", "payable"].includes(direction)) {
      notifyFail("obligation.create_failed", "direction debe ser receivable o payable", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "direction debe ser receivable o payable" });
    }

    if (!PARTY_TYPES.has(partyType)) {
      return res.status(400).json({ message: "Tipo de persona inválido" });
    }

    const parsedAmount = parseMoney(amount);
    if (parsedAmount.error || parsedAmount.amount <= 0) {
      notifyFail("obligation.create_failed", parsedAmount.error || "Monto inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: parsedAmount.amount === 0 ? "Monto inválido" : parsedAmount.error || "Monto inválido" });
    }
    const amt = parsedAmount.amount;

    const openDay = strictDate(openDate);
    if (!openDay) {
      return res.status(400).json({ message: "La fecha de apertura no es válida" });
    }
    // Conserva hora del datetime-local; openDay solo para calendario de cuotas.

    let resolvedName = String(partyName || "").trim();
    if (resolvedName.length > 150) {
      return res.status(400).json({ message: "El nombre admite hasta 150 caracteres" });
    }
    const conceptTextRaw = String(concept || "").trim();
    if (conceptTextRaw.length > 250) {
      return res.status(400).json({ message: "El concepto admite hasta 250 caracteres" });
    }
    const noteText = note == null || String(note).trim() === "" ? null : String(note).trim();
    if (noteText && noteText.length > 500) {
      return res.status(400).json({ message: "La nota admite hasta 500 caracteres" });
    }
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
    if (resolvedName.length > 150) {
      return res.status(400).json({ message: "El nombre admite hasta 150 caracteres" });
    }

    const conceptText =
      conceptTextRaw ||
      (direction === "receivable" ? "Préstamo otorgado" : "Préstamo recibido");
    const dateOnly = toFinanceDateTime(openDate);
    const french = amortizationFrench === true;
    if (french) {
      const rateError = loanRateError(loanTerms);
      if (rateError) return res.status(400).json({ message: rateError });
    }
    const schedule = normalizeIncomingSchedule(installments, amt, dueDate || openDay, french);
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
          loanTerms: french && loanTerms && typeof loanTerms === "object" ? loanTerms : null,
          labelColor: normalizeLabelColor(labelColor),
          status: schedule.rows.some((r) => !r.historical) ? "open" : "closed",
          note: noteText,
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      const counterparty = resolvedName;
      let initialFinanceType = null;
      let initialFinanceId = null;
      const skipOpening = french && loanTerms?.skipOpeningFinance === true;

      if (!skipOpening && direction === "receivable") {
        const expense = await Expense.create(
          {
            date: dateOnly,
            amount: amt,
            concept: `Préstamo a ${counterparty}: ${conceptText}`.slice(0, 250),
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
      } else if (!skipOpening) {
        const income = await Income.create(
          {
            date: dateOnly,
            amount: amt,
            concept: `Préstamo recibido de ${counterparty}: ${conceptText}`.slice(0, 250),
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

      if (!skipOpening) {
        obligation.initialFinanceType = initialFinanceType;
        obligation.initialFinanceId = initialFinanceId;
        await obligation.save({ transaction: t });
      }

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

export const updateObligation = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const { concept, partyName, note, amount, openDate, installments, amortizationFrench, loanTerms, labelColor } = req.body || {};

    await ensureObligationScheduleColumn();

    const result = await sequelize.transaction(async (t) => {
      const obligation = await FinancialObligation.findByPk(req.params.id, { transaction: t });
      if (!obligation) return { status: 404, body: { message: "Obligación no encontrada" } };
      if (obligation.status === "cancelled") {
        return { status: 400, body: { message: "El préstamo está anulado" } };
      }

      const finBefore = await getObligationFinancials(obligation.id, t);
      const paid = finBefore.paid;
      const french = amortizationFrench === true || Boolean(obligation.loanTerms);
      let amt = roundMoney(obligation.originalAmount);
      if (amount != null && amount !== "") {
        const parsedAmount = parseMoney(amount);
        if (parsedAmount.error || parsedAmount.amount <= 0) {
          return { status: 400, body: { message: parsedAmount.error || "Monto inválido" } };
        }
        if (paid > EPS && Math.abs(parsedAmount.amount - amt) > 0.02) {
          return { status: 400, body: { message: "Este préstamo ya tiene pagos. El capital no se cambia." } };
        }
        amt = parsedAmount.amount;
      }

      let resolvedName = obligation.partyName;
      if (obligation.partyType !== "customer" && partyName != null) {
        const name = String(partyName).trim();
        if (!name) return { status: 400, body: { message: "Indica el nombre de la persona" } };
        if (name.length > 150) return { status: 400, body: { message: "El nombre admite hasta 150 caracteres" } };
        resolvedName = name;
      }

      const conceptText = String(concept ?? "").trim() || obligation.concept;
      if (conceptText.length > 250) {
        return { status: 400, body: { message: "El concepto admite hasta 250 caracteres" } };
      }
      let noteText = obligation.note;
      if (note != null) {
        noteText = String(note).trim() || null;
        if (noteText && noteText.length > 500) {
          return { status: 400, body: { message: "La nota admite hasta 500 caracteres" } };
        }
      }
      if (paid <= EPS && openDate) {
        if (!strictDate(openDate)) return { status: 400, body: { message: "La fecha de apertura no es válida" } };
      }
      if (french && loanTerms && typeof loanTerms === "object") {
        const rateError = loanRateError(loanTerms);
        if (rateError) return { status: 400, body: { message: rateError } };
      }

      const sentSchedule = Array.isArray(installments);
      if (!sentSchedule && Math.abs(amt - roundMoney(obligation.originalAmount)) > 0.02) {
        return { status: 400, body: { message: "Si cambias el capital, envía el cronograma actualizado" } };
      }
      const schedule = sentSchedule
        ? normalizeIncomingSchedule(installments, amt, obligation.dueDate || obligation.openDate, french)
        : {
            rows: parseStoredSchedule(obligation.schedule),
            lastDue: toDateOnlySafe(obligation.dueDate) || strictDate(obligation.openDate),
          };
      if (schedule.error) return { status: 400, body: { message: schedule.error } };

      obligation.schedule = JSON.parse(JSON.stringify(schedule.rows));
      obligation.changed("schedule", true);
      const nextTotal = payableTotal(obligation);
      if (nextTotal + EPS < paid) {
        return {
          status: 400,
          body: {
            message: `La suma de cuotas ($${nextTotal.toFixed(2)}) queda debajo de lo ya abonado ($${paid.toFixed(2)}).`,
          },
        };
      }

      obligation.partyName = resolvedName;
      obligation.concept = conceptText;
      obligation.note = noteText;
      obligation.originalAmount = amt;
      if (labelColor !== undefined) obligation.labelColor = normalizeLabelColor(labelColor);
      if (paid <= EPS && openDate) obligation.openDate = toFinanceDateTime(openDate);
      if (french && loanTerms && typeof loanTerms === "object") {
        obligation.loanTerms = JSON.parse(JSON.stringify(loanTerms));
        obligation.changed("loanTerms", true);
      }
      if (sentSchedule) obligation.dueDate = toFinanceDateTime(schedule.lastDue);
      obligation.status = roundMoney(Math.max(0, nextTotal - paid)) <= EPS ? "closed" : "open";
      await obligation.save({ transaction: t });

      const skipOpening = french && loanTerms?.skipOpeningFinance === true;
      if (paid <= EPS && obligation.initialFinanceId && obligation.initialFinanceType) {
        const Model = obligation.initialFinanceType === "income" ? Income : Expense;
        const financeRow = await Model.findByPk(obligation.initialFinanceId, { transaction: t });
        if (financeRow) {
          financeRow.amount = skipOpening ? 0 : amt;
          if (openDate) financeRow.date = toFinanceDateTime(openDate);
          financeRow.counterpartyName = resolvedName;
          financeRow.concept = (
            obligation.direction === "receivable"
              ? `Préstamo a ${resolvedName}: ${conceptText}`
              : `Préstamo recibido de ${resolvedName}: ${conceptText}`
          ).slice(0, 250);
          await financeRow.save({ transaction: t });
        }
      } else if (paid <= EPS && !skipOpening && !obligation.initialFinanceId) {
        const counterparty = resolvedName;
        const dateOnly = obligation.openDate;
        if (obligation.direction === "receivable") {
          const expense = await Expense.create(
            {
              date: dateOnly,
              amount: amt,
              concept: `Préstamo a ${counterparty}: ${conceptText}`.slice(0, 250),
              category: "Préstamo otorgado",
              status: "paid",
              referenceType: "obligation_open",
              referenceId: obligation.id,
              counterpartyName: counterparty,
              createdBy: user.accountId,
            },
            { transaction: t },
          );
          obligation.initialFinanceType = "expense";
          obligation.initialFinanceId = expense.id;
        } else {
          const income = await Income.create(
            {
              date: dateOnly,
              amount: amt,
              concept: `Préstamo recibido de ${counterparty}: ${conceptText}`.slice(0, 250),
              category: "Préstamo recibido",
              status: "paid",
              referenceType: "obligation_open",
              referenceId: obligation.id,
              counterpartyName: counterparty,
              createdBy: user.accountId,
            },
            { transaction: t },
          );
          obligation.initialFinanceType = "income";
          obligation.initialFinanceId = income.id;
        }
        await obligation.save({ transaction: t });
      }

      const fin = await getObligationFinancials(obligation.id, t);
      return { status: 200, body: mapObligationRow(obligation, fin) };
    });

    if (result.status !== 200) {
      notifyFail("obligation.update_failed", result.body.message, { req, httpStatus: result.status });
      return res.status(result.status).json(result.body);
    }
    notifyOk("obligation.updated", "Préstamo actualizado", { obligation: result.body });
    res.json(result.body);
  } catch (err) {
    console.error("updateObligation error:", err);
    notifyFail("obligation.update_failed", "Error al editar el préstamo", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al editar el préstamo" });
  }
};

export const payObligation = async (req, res) => {
  try {
    await ensureObligationScheduleColumn();
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const { id } = req.params;
    const { amount, date, method, note } = req.body || {};

    const parsedAmount = parseMoney(amount);
    if (parsedAmount.error || parsedAmount.amount <= 0) {
      notifyFail("obligation.pay_failed", "Monto inválido", { req, httpStatus: 400, extra: { obligationId: id } });
      return res.status(400).json({ message: parsedAmount.error || "Monto inválido" });
    }
    const payAmount = parsedAmount.amount;
    if (!strictDate(date)) {
      return res.status(400).json({ message: "La fecha del pago no es válida" });
    }
    const payMethod = method == null || String(method).trim() === "" ? "efectivo" : String(method).trim();
    if (!PAY_METHODS.has(payMethod)) {
      return res.status(400).json({ message: "Método de pago inválido" });
    }
    const payNote = note == null || String(note).trim() === "" ? null : String(note).trim();
    if (payNote && payNote.length > 500) {
      return res.status(400).json({ message: "La nota admite hasta 500 caracteres" });
    }

    const result = await sequelize.transaction(async (t) => {
      const locked = await FinancialObligation.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
      if (!locked) return { status: 404, body: { message: "Obligación no encontrada" } };
      const fin = await getObligationFinancials(id, t);
      if (!fin) return { status: 404, body: { message: "Obligación no encontrada" } };
      const { obligation, remaining, paid } = fin;

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
      const nextCuota = projectInstallments(obligation, paid).find((row) => !row.isPaid);
      const cuotaBit = nextCuota
        ? `cuota ${nextCuota.sequence} (${nextCuota.dueDate})`
        : "abono";
      const pendBit = isFull ? "saldo en cero" : `pend. $${newRemaining.toFixed(2)}`;

      let financeType;
      let financeId;

      if (obligation.direction === "receivable") {
        const income = await Income.create(
          {
            date: paymentDate,
            amount: payAmount,
            concept: `Cobro ${cuotaBit}: ${counterparty} — $${payAmount.toFixed(2)} (${pendBit})`.slice(0, 250),
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
            concept: `Pago ${cuotaBit}: ${counterparty} — $${payAmount.toFixed(2)} (${pendBit})`.slice(0, 250),
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
          method: payMethod,
          note: payNote,
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

async function stampVoidedFinance(kind, financeId, obligation, transaction) {
  if (!financeId || (kind !== "income" && kind !== "expense")) return null;
  const Model = kind === "income" ? Income : Expense;
  const row = await Model.findByPk(financeId, { transaction });
  if (!row) return null;
  const previousAmount = roundMoney(row.amount);
  const previousConcept = row.concept;
  const label = kind === "income" ? "ingreso" : "egreso";
  const concept = `ANULADO préstamo #${obligation.id} ${obligation.partyName}. Era ${label} $${previousAmount.toFixed(2)}. ${previousConcept || ""}`.slice(0, 250);
  await row.update(
    { amount: 0, concept, category: "Anulación de préstamo" },
    { transaction },
  );
  return { kind, id: row.id, previousAmount, previousConcept };
}

export const cancelObligation = async (req, res) => {
  try {
    await ensureObligationScheduleColumn();
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const result = await sequelize.transaction(async (t) => {
      const fin = await getObligationFinancials(req.params.id, t);
      if (!fin) return { status: 404, body: { message: "Obligación no encontrada" } };
      const { obligation, paid, payments } = fin;

      if (obligation.status !== "open" && obligation.status !== "closed") {
        return { status: 400, body: { message: "Solo se pueden anular obligaciones abiertas" } };
      }
      if (paid > EPS) {
        const rol = user?.loginRol;
        const allowed =
          getAppSettingsSync()?.allowLoanFinancePurge === true &&
          (rol === "Administrador" || rol === "Propietario");
        if (!allowed) {
          return { status: 400, body: { message: "No se puede anular: ya tiene abonos registrados" } };
        }

        const traces = [];
        const seen = new Set();
        const stamp = async (kind, id) => {
          const key = `${kind}:${id}`;
          if (!id || seen.has(key)) return;
          seen.add(key);
          const trace = await stampVoidedFinance(kind, id, obligation, t);
          if (trace) traces.push(trace);
        };
        await stamp(obligation.initialFinanceType, obligation.initialFinanceId);
        for (const payment of payments) {
          await stamp(payment.financeType, payment.financeId);
        }
        const lines = traces.map(
          (trace, index) =>
            `${index + 1}) ${trace.kind === "income" ? "ingreso" : "egreso"} $${trace.previousAmount.toFixed(2)}`,
        );
        const detail = `Se borró préstamo #${obligation.id} ${obligation.partyName}. ${traces.length} movimiento(s) quedan en cero y no suman: ${lines.join("; ")}`.slice(0, 250);
        const Constancia = obligation.direction === "receivable" ? Expense : Income;
        await Constancia.create(
          {
            date: new Date(),
            amount: 0,
            concept: detail,
            category: "Anulación de préstamo",
            status: "paid",
            referenceType: "obligation_purge",
            referenceId: obligation.id,
            counterpartyName: obligation.partyName,
            createdBy: user.accountId,
          },
          { transaction: t },
        );
        await ObligationPayment.destroy({
          where: { obligationId: obligation.id },
          transaction: t,
        });
        await obligation.destroy({ transaction: t });
        return {
          status: 200,
          body: {
            message:
              "Préstamo borrado. En finanzas esos movimientos quedaron en cero y ya no suman.",
            purged: true,
            traces,
          },
        };
      }

      if (obligation.status !== "open") {
        return { status: 400, body: { message: "Solo se pueden anular obligaciones abiertas" } };
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
        purged: Boolean(result.body?.purged),
        financeVoided: result.body?.traces || [],
        actor: user?.loginRol,
        accountId: user?.accountId,
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
