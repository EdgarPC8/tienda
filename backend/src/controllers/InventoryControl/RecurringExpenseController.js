/**
 * Gastos recurrentes: plantillas por local + cuotas por período.
 */
import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { Store } from "../../models/Inventory.js";
import {
  RecurringExpenseTemplate,
  RecurringExpenseOccurrence,
  Expense,
  Income,
} from "../../models/Finance.js";
import { getHeaderToken, verifyJWT } from "../../libs/jwt.js";
import { toFinanceDateTime } from "../../utils/financeDateTime.js";
import {
  buildPeriodKey,
  computeDueDate,
  periodKeysToEnsure,
  daysUntil,
  daysLeftInMonth,
  monthBounds,
  expenseCategoryFor,
  CATEGORY_LABELS,
  FREQUENCY_LABELS,
  AMOUNT_TYPE_LABELS,
} from "../../utils/recurringExpenseUtils.js";
import {
  createAndPushNotification,
  resolveAdminUserIds,
} from "../../services/notificationService.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import { startOfMonth, endOfMonth, format } from "date-fns";
import { es } from "date-fns/locale";

const toNum = (v, def = 0) => {
  const n = Number(v ?? def);
  return Number.isFinite(n) ? n : def;
};

const roundMoney = (x) => Number(Number(x || 0).toFixed(2));
const EPS = 0.0001;

function mapTemplateRow(row) {
  const t = row.toJSON ? row.toJSON() : row;
  return {
    ...t,
    categoryLabel: CATEGORY_LABELS[t.category] || t.category,
    frequencyLabel: FREQUENCY_LABELS[t.frequency] || t.frequency,
    amountTypeLabel: AMOUNT_TYPE_LABELS[t.amountType] || t.amountType,
    store: t.store || null,
    storeName: t.store?.name || (t.storeId ? `Local #${t.storeId}` : "General"),
  };
}

function mapOccurrenceRow(row) {
  const o = row.toJSON ? row.toJSON() : row;
  const tpl = o.template ? mapTemplateRow(o.template) : null;
  const amount =
    o.status === "paid"
      ? roundMoney(o.actualAmount ?? o.expectedAmount)
      : roundMoney(o.actualAmount ?? o.expectedAmount);
  return {
    ...o,
    template: tpl,
    displayName: tpl?.name || "Gasto recurrente",
    storeName: tpl?.storeName || "General",
    categoryLabel: tpl?.categoryLabel || "",
    amountType: tpl?.amountType,
    daysUntilDue: o.dueDate ? daysUntil(o.dueDate) : null,
    displayAmount: amount,
    isOverdue: o.status === "pending" && o.dueDate && daysUntil(o.dueDate) < 0,
    isDueSoon:
      o.status === "pending" &&
      o.dueDate &&
      daysUntil(o.dueDate) >= 0 &&
      daysUntil(o.dueDate) <= (tpl?.reminderDaysBefore ?? 7),
  };
}

async function ensureOccurrencesForTemplates(templates, accountId, t) {
  let created = 0;
  for (const template of templates) {
    if (!template.isActive) continue;
    const keys = periodKeysToEnsure(template);
    for (const periodKey of keys) {
      const exists = await RecurringExpenseOccurrence.findOne({
        where: { templateId: template.id, periodKey },
        transaction: t,
      });
      if (exists) continue;

      const dueDate = computeDueDate(template, periodKey);
      await RecurringExpenseOccurrence.create(
        {
          templateId: template.id,
          periodKey,
          dueDate,
          expectedAmount: roundMoney(template.baseAmount),
          status: "pending",
          createdBy: accountId,
        },
        { transaction: t }
      );
      created += 1;
    }
  }
  return created;
}

async function syncRemindersForPending() {
  const adminIds = await resolveAdminUserIds();
  if (!adminIds.length) return 0;

  const pending = await RecurringExpenseOccurrence.findAll({
    where: { status: "pending" },
    include: [
      {
        model: RecurringExpenseTemplate,
        as: "template",
        where: { isActive: true },
        include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
      },
    ],
    order: [["dueDate", "ASC"]],
  });

  let sent = 0;
  const now = new Date();

  for (const occ of pending) {
    const tpl = occ.template;
    if (!tpl) continue;

    const days = daysUntil(occ.dueDate);
    const reminderWindow = Number(tpl.reminderDaysBefore) || 7;

    const shouldNotify =
      days < 0 || (days >= 0 && days <= reminderWindow);

    if (!shouldNotify) continue;

    const last = occ.lastReminderAt ? new Date(occ.lastReminderAt).getTime() : 0;
    if (now.getTime() - last < 20 * 60 * 60 * 1000) continue;

    const storeLabel = tpl.store?.name ? ` (${tpl.store.name})` : "";
    const amt = roundMoney(occ.actualAmount ?? occ.expectedAmount);
    const title =
      days < 0
        ? `Pago vencido: ${tpl.name}`
        : days === 0
          ? `Vence hoy: ${tpl.name}`
          : `Próximo pago: ${tpl.name}`;

    const message =
      days < 0
        ? `${tpl.name}${storeLabel} venció hace ${Math.abs(days)} día(s). Monto ref.: ${amt}.`
        : `${tpl.name}${storeLabel} vence en ${days} día(s) (${format(new Date(occ.dueDate), "d MMM yyyy", { locale: es })}). Monto ref.: ${amt}.`;

    const sourceKey = `recurring_due:${occ.id}:${format(now, "yyyy-MM-dd")}`;

    for (const userId of adminIds) {
      await createAndPushNotification({
        userId,
        type: days < 0 ? "alert" : "reminder",
        title,
        message,
        link: "/inventory/gastos-recurrentes",
        sourceKey: `${sourceKey}:${userId}`,
      });
      sent += 1;
    }

    await occ.update({ lastReminderAt: now });
  }

  return sent;
}

export async function computeRecurringDashboardData(monthIncomeOverride = null) {
  const { start: monthStart, end: monthEnd } = monthBounds();

  let monthIncome = monthIncomeOverride;
  if (monthIncome == null) {
    const raw = await Income.sum("amount", {
      where: { date: { [Op.between]: [monthStart, monthEnd] } },
    });
    monthIncome = roundMoney(raw);
  } else {
    monthIncome = roundMoney(monthIncome);
  }

  const templates = await RecurringExpenseTemplate.findAll({
    where: { isActive: true },
    include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
  });

  const monthOccurrences = await RecurringExpenseOccurrence.findAll({
    where: {
      dueDate: { [Op.between]: [monthStart, monthEnd] },
      status: { [Op.in]: ["pending", "paid"] },
    },
    include: [
      {
        model: RecurringExpenseTemplate,
        as: "template",
        include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
      },
    ],
    order: [["dueDate", "ASC"]],
  });

  let monthlyFixed = 0;
  let monthlyVariableEst = 0;
  for (const tpl of templates) {
    if (tpl.frequency !== "monthly") continue;
    const amt = roundMoney(tpl.baseAmount);
    if (tpl.amountType === "fixed") monthlyFixed += amt;
    else monthlyVariableEst += amt;
  }

  let pendingThisMonth = 0;
  let paidThisMonth = 0;
  for (const occ of monthOccurrences) {
    const amt = roundMoney(occ.actualAmount ?? occ.expectedAmount);
    if (occ.status === "paid") paidThisMonth += amt;
    else if (occ.status === "pending") pendingThisMonth += amt;
  }

  const upcoming = await RecurringExpenseOccurrence.findAll({
    where: { status: "pending", dueDate: { [Op.gte]: new Date() } },
    include: [
      {
        model: RecurringExpenseTemplate,
        as: "template",
        where: { isActive: true },
        include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
      },
    ],
    order: [["dueDate", "ASC"]],
    limit: 6,
  });

  const overdue = await RecurringExpenseOccurrence.findAll({
    where: { status: "pending", dueDate: { [Op.lt]: new Date() } },
    include: [
      {
        model: RecurringExpenseTemplate,
        as: "template",
        where: { isActive: true },
        include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
      },
    ],
    order: [["dueDate", "ASC"]],
    limit: 6,
  });

  const monthlyBurden = roundMoney(monthlyFixed + monthlyVariableEst);
  const income = monthIncome;
  const gapToCover = roundMoney(Math.max(0, monthlyBurden - income));
  const daysLeft = daysLeftInMonth();
  const dailySalesTarget = gapToCover > EPS ? roundMoney(gapToCover / daysLeft) : 0;
  const isProfitable = income >= monthlyBurden && monthlyBurden > 0;

  return {
    summary: {
      monthlyFixed: roundMoney(monthlyFixed),
      monthlyVariableEstimate: roundMoney(monthlyVariableEst),
      monthlyBurden,
      pendingThisMonth: roundMoney(pendingThisMonth),
      paidThisMonth: roundMoney(paidThisMonth),
      activeTemplates: templates.length,
      overdueCount: overdue.length,
      monthIncome: income,
      gapToCover,
      dailySalesTarget,
      daysLeftInMonth: daysLeft,
      isProfitable,
    },
    upcoming: upcoming.map(mapOccurrenceRow),
    overdue: overdue.map(mapOccurrenceRow),
  };
}

export const getRecurringWorkbench = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    await sequelize.transaction(async (t) => {
      const active = await RecurringExpenseTemplate.findAll({
        where: { isActive: true },
        transaction: t,
      });
      await ensureOccurrencesForTemplates(active, user.accountId, t);
    });

    await syncRemindersForPending();

    const { month } = req.query;
    const now = new Date();
    const refMonth = month ? new Date(`${month}-01T12:00:00`) : now;
    const mStart = startOfMonth(refMonth);
    const mEnd = endOfMonth(refMonth);

    const [templates, occurrences, monthIncomeRaw] = await Promise.all([
      RecurringExpenseTemplate.findAll({
        include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
        order: [["isActive", "DESC"], ["name", "ASC"]],
      }),
      RecurringExpenseOccurrence.findAll({
        where: { dueDate: { [Op.between]: [mStart, mEnd] } },
        include: [
          {
            model: RecurringExpenseTemplate,
            as: "template",
            include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
          },
        ],
        order: [["dueDate", "ASC"], ["id", "ASC"]],
      }),
      Income.sum("amount", {
        where: {
          date: {
            [Op.between]: [
              format(mStart, "yyyy-MM-dd"),
              format(mEnd, "yyyy-MM-dd"),
            ],
          },
        },
      }),
    ]);

    const monthIncome = roundMoney(monthIncomeRaw);
    const dashboard = await computeRecurringDashboardData(monthIncome);

    res.json({
      templates: templates.map(mapTemplateRow),
      occurrences: occurrences.map(mapOccurrenceRow),
      monthLabel: format(refMonth, "MMMM yyyy", { locale: es }),
      monthKey: format(refMonth, "yyyy-MM"),
      ...dashboard,
    });
  } catch (err) {
    console.error("getRecurringWorkbench error:", err);
    res.status(500).json({ message: "Error al cargar gastos recurrentes" });
  }
};

export const createRecurringTemplate = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    const body = req.body || {};

    const name = String(body.name || "").trim();
    if (!name) {
      notifyFail("recurring_template.create_failed", "Indica un nombre", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Indica un nombre" });
    }

    const baseAmount = roundMoney(body.baseAmount);
    if (baseAmount < 0) {
      notifyFail("recurring_template.create_failed", "Monto inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Monto inválido" });
    }

    const frequency = ["monthly", "quarterly", "annual"].includes(body.frequency)
      ? body.frequency
      : "monthly";

    if (frequency === "annual" && !body.dueMonth) {
      notifyFail("recurring_template.create_failed", "Indica el mes de vencimiento anual", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Indica el mes de vencimiento anual" });
    }

    const template = await sequelize.transaction(async (t) => {
      const row = await RecurringExpenseTemplate.create(
        {
          storeId: body.storeId ? Number(body.storeId) : null,
          name,
          category: ["arriendo", "servicios", "permisos", "otros"].includes(body.category)
            ? body.category
            : "otros",
          amountType: body.amountType === "variable" ? "variable" : "fixed",
          frequency,
          baseAmount,
          dueDayOfMonth: Math.min(31, Math.max(1, Number(body.dueDayOfMonth) || 5)),
          dueMonth: frequency === "annual" ? Number(body.dueMonth) : null,
          providerName: body.providerName?.trim() || null,
          note: body.note?.trim() || null,
          reminderDaysBefore: Math.max(0, Number(body.reminderDaysBefore) || 7),
          isActive: body.isActive !== false,
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      await ensureOccurrencesForTemplates([row], user.accountId, t);
      return row;
    });

    const full = await RecurringExpenseTemplate.findByPk(template.id, {
      include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
    });

    notifyOk("recurring_template.created", "Plantilla recurrente creada", {
      template: mapTemplateRow(full),
    });
    res.status(201).json(mapTemplateRow(full));
  } catch (err) {
    console.error("createRecurringTemplate error:", err);
    notifyFail("recurring_template.create_failed", "Error al crear plantilla", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al crear plantilla" });
  }
};

export const updateRecurringTemplate = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const template = await RecurringExpenseTemplate.findByPk(req.params.id);
    if (!template) {
      notifyFail("recurring_template.update_failed", `Plantilla #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    const body = req.body || {};
    const updates = {};

    if (body.name != null) updates.name = String(body.name).trim();
    if (body.storeId !== undefined) updates.storeId = body.storeId ? Number(body.storeId) : null;
    if (body.category != null) updates.category = body.category;
    if (body.amountType != null) updates.amountType = body.amountType === "variable" ? "variable" : "fixed";
    if (body.frequency != null) updates.frequency = body.frequency;
    if (body.baseAmount != null) updates.baseAmount = roundMoney(body.baseAmount);
    if (body.dueDayOfMonth != null) {
      updates.dueDayOfMonth = Math.min(31, Math.max(1, Number(body.dueDayOfMonth) || 5));
    }
    if (body.dueMonth !== undefined) updates.dueMonth = body.dueMonth ? Number(body.dueMonth) : null;
    if (body.providerName !== undefined) updates.providerName = body.providerName?.trim() || null;
    if (body.note !== undefined) updates.note = body.note?.trim() || null;
    if (body.reminderDaysBefore != null) {
      updates.reminderDaysBefore = Math.max(0, Number(body.reminderDaysBefore) || 7);
    }
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

    await template.update(updates);

    const full = await RecurringExpenseTemplate.findByPk(template.id, {
      include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
    });

    notifyOk("recurring_template.updated", `Plantilla recurrente #${template.id}`, {
      template: mapTemplateRow(full),
    });
    res.json(mapTemplateRow(full));
  } catch (err) {
    console.error("updateRecurringTemplate error:", err);
    notifyFail("recurring_template.update_failed", `Error al actualizar plantilla #${req.params.id}`, {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar plantilla" });
  }
};

export const updateRecurringOccurrence = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const occ = await RecurringExpenseOccurrence.findByPk(req.params.id, {
      include: [{ model: RecurringExpenseTemplate, as: "template" }],
    });
    if (!occ) {
      notifyFail("recurring_occurrence.update_failed", `Cuota #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Cuota no encontrada" });
    }
    if (occ.status === "paid") {
      notifyFail("recurring_occurrence.update_failed", "La cuota ya está pagada", {
        req,
        httpStatus: 400,
        extra: { occurrenceId: occ.id },
      });
      return res.status(400).json({ message: "La cuota ya está pagada" });
    }

    const { actualAmount, note, dueDate } = req.body || {};
    const updates = {};
    if (actualAmount != null) updates.actualAmount = roundMoney(actualAmount);
    if (note !== undefined) updates.note = note?.trim() || null;
    if (dueDate) updates.dueDate = toFinanceDateTime(dueDate);

    await occ.update(updates);

    const full = await RecurringExpenseOccurrence.findByPk(occ.id, {
      include: [
        {
          model: RecurringExpenseTemplate,
          as: "template",
          include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
        },
      ],
    });

    notifyOk("recurring_occurrence.updated", `Ocurrencia recurrente #${occ.id}`, {
      occurrence: mapOccurrenceRow(full),
    });
    res.json(mapOccurrenceRow(full));
  } catch (err) {
    console.error("updateRecurringOccurrence error:", err);
    notifyFail("recurring_occurrence.update_failed", `Error al actualizar cuota #${req.params.id}`, {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar cuota" });
  }
};

export const payRecurringOccurrence = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const occ = await RecurringExpenseOccurrence.findByPk(req.params.id, {
      include: [
        {
          model: RecurringExpenseTemplate,
          as: "template",
          include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
        },
      ],
    });
    if (!occ) {
      notifyFail("recurring_occurrence.pay_failed", `Cuota #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Cuota no encontrada" });
    }
    if (occ.status === "paid") {
      notifyFail("recurring_occurrence.pay_failed", "Ya está pagada", {
        req,
        httpStatus: 400,
        extra: { occurrenceId: occ.id },
      });
      return res.status(400).json({ message: "Ya está pagada" });
    }
    if (occ.status === "skipped") {
      notifyFail("recurring_occurrence.pay_failed", "Cuota omitida", {
        req,
        httpStatus: 400,
        extra: { occurrenceId: occ.id },
      });
      return res.status(400).json({ message: "Cuota omitida" });
    }

    const tpl = occ.template;
    if (!tpl) {
      notifyFail("recurring_occurrence.pay_failed", "Plantilla no encontrada", {
        req,
        httpStatus: 400,
        extra: { occurrenceId: occ.id },
      });
      return res.status(400).json({ message: "Plantilla no encontrada" });
    }

    const body = req.body || {};
    const payAmount = roundMoney(
      body.amount ?? occ.actualAmount ?? occ.expectedAmount ?? tpl.baseAmount
    );
    if (payAmount <= 0) {
      notifyFail("recurring_occurrence.pay_failed", "Monto inválido", {
        req,
        httpStatus: 400,
        extra: { occurrenceId: occ.id },
      });
      return res.status(400).json({ message: "Monto inválido" });
    }

    const payDate = toFinanceDateTime(body.date || new Date());
    const storeLabel = tpl.store?.name ? ` — ${tpl.store.name}` : "";
    const concept = `${tpl.name}${storeLabel} (${occ.periodKey})`;

    const result = await sequelize.transaction(async (t) => {
      const expense = await Expense.create(
        {
          date: payDate,
          amount: payAmount,
          concept,
          category: expenseCategoryFor(tpl.category),
          status: "paid",
          referenceType: "recurring_occurrence",
          referenceId: occ.id,
          counterpartyName: tpl.providerName || null,
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      await occ.update(
        {
          status: "paid",
          actualAmount: payAmount,
          paidDate: payDate,
          expenseId: expense.id,
          note: body.note?.trim() || occ.note,
        },
        { transaction: t }
      );

      return { occurrence: occ, expense };
    });

    const full = await RecurringExpenseOccurrence.findByPk(result.occurrence.id, {
      include: [
        {
          model: RecurringExpenseTemplate,
          as: "template",
          include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
        },
      ],
    });

    notifyOk("recurring_occurrence.paid", `Ocurrencia pagada #${result.occurrence.id}`, {
      occurrence: mapOccurrenceRow(full),
    });
    res.json({
      message: "Pago registrado en finanzas",
      occurrence: mapOccurrenceRow(full),
    });
  } catch (err) {
    console.error("payRecurringOccurrence error:", err);
    notifyFail("recurring_occurrence.pay_failed", "Error al registrar pago", {
      error: err,
      req,
      httpStatus: 500,
      extra: { occurrenceId: req.params.id },
    });
    res.status(500).json({ message: "Error al registrar pago" });
  }
};

export const skipRecurringOccurrence = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const occ = await RecurringExpenseOccurrence.findByPk(req.params.id);
    if (!occ) {
      notifyFail("recurring_occurrence.skip_failed", `Cuota #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Cuota no encontrada" });
    }
    if (occ.status === "paid") {
      notifyFail("recurring_occurrence.skip_failed", "Ya está pagada", {
        req,
        httpStatus: 400,
        extra: { occurrenceId: occ.id },
      });
      return res.status(400).json({ message: "Ya está pagada" });
    }

    await occ.update({
      status: "skipped",
      note: req.body?.note?.trim() || occ.note,
    });

    notifyOk("recurring_occurrence.skipped", `Ocurrencia omitida #${occ.id}`, {
      occurrenceId: occ.id,
    });
    res.json({ message: "Cuota omitida" });
  } catch (err) {
    console.error("skipRecurringOccurrence error:", err);
    notifyFail("recurring_occurrence.skip_failed", "Error al omitir cuota", {
      error: err,
      req,
      httpStatus: 500,
      extra: { occurrenceId: req.params.id },
    });
    res.status(500).json({ message: "Error al omitir cuota" });
  }
};

export async function syncRecurringExpenseReminders() {
  const templates = await RecurringExpenseTemplate.findAll({ where: { isActive: true } });
  if (templates.length) {
    await sequelize.transaction(async (t) => {
      await ensureOccurrencesForTemplates(templates, templates[0].createdBy, t);
    });
  }
  return syncRemindersForPending();
}

export const generateRecurringOccurrences = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const created = await sequelize.transaction(async (t) => {
      const active = await RecurringExpenseTemplate.findAll({
        where: { isActive: true },
        transaction: t,
      });
      return ensureOccurrencesForTemplates(active, user.accountId, t);
    });

    notifyOk("recurring.occurrences_generated", "Ocurrencias recurrentes generadas", { created });
    res.json({ message: `Se generaron ${created} cuota(s) nueva(s)`, created });
  } catch (err) {
    console.error("generateRecurringOccurrences error:", err);
    notifyFail("recurring.generate_failed", "Error al generar cuotas", { error: err, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al generar cuotas" });
  }
};
