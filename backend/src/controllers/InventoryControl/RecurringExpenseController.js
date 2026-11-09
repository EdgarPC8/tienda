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
  DURATION_LABELS,
  isLimitedDuration,
  computeEndDateFromCount,
  resolveTemplateWindow,
  shouldAutoDeactivateLimited,
  buildLimitedPaymentPlan,
  usesPaymentPlan,
  OCCURRENCE_KIND_LABELS,
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
const ALLOWED_FREQ = new Set(["monthly", "quarterly", "annual", "weekly", "bimonthly", "span"]);

function normalizeHex(value) {
  const raw = String(value || "").trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(raw) ? raw : null;
}

function dateOnlyOrNull(value) {
  if (value == null || value === "") return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

let schemaReady = false;
async function ensureRecurringColumns() {
  if (schemaReady) return;
  await sequelize.query(
    "ALTER TABLE ERP_finance_recurring_templates MODIFY frequency ENUM('monthly','quarterly','annual','weekly','bimonthly','span') NOT NULL DEFAULT 'monthly'"
  );
  const [cols] = await sequelize.query("SHOW COLUMNS FROM ERP_finance_recurring_templates");
  const names = new Set(cols.map((c) => c.Field));
  if (!names.has("labelColor")) {
    await sequelize.query("ALTER TABLE ERP_finance_recurring_templates ADD COLUMN labelColor VARCHAR(7) NULL");
  }
  if (!names.has("startDate")) {
    await sequelize.query("ALTER TABLE ERP_finance_recurring_templates ADD COLUMN startDate DATE NULL");
  }
  if (!names.has("endDate")) {
    await sequelize.query("ALTER TABLE ERP_finance_recurring_templates ADD COLUMN endDate DATE NULL");
  }
  if (!names.has("durationMode")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_templates ADD COLUMN durationMode ENUM('indefinite','limited') NOT NULL DEFAULT 'indefinite'",
    );
  }
  if (!names.has("occurrenceCount")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_templates ADD COLUMN occurrenceCount INT NULL",
    );
  }
  if (!names.has("coverFromIncome")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_templates ADD COLUMN coverFromIncome TINYINT(1) NOT NULL DEFAULT 1",
    );
  }
  if (!names.has("totalAmount")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_templates ADD COLUMN totalAmount DECIMAL(10,2) NULL",
    );
  }
  if (!names.has("entryAmount")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_templates ADD COLUMN entryAmount DECIMAL(10,2) NULL DEFAULT 0",
    );
  }
  if (!names.has("firstInstallmentSameMonth")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_templates ADD COLUMN firstInstallmentSameMonth TINYINT(1) NOT NULL DEFAULT 0",
    );
  }
  const [occCols] = await sequelize.query("SHOW COLUMNS FROM ERP_finance_recurring_occurrences");
  const occNames = new Set(occCols.map((c) => c.Field));
  if (!occNames.has("sequence")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_occurrences ADD COLUMN sequence INT NULL",
    );
  }
  if (!occNames.has("kind")) {
    await sequelize.query(
      "ALTER TABLE ERP_finance_recurring_occurrences ADD COLUMN kind ENUM('entry','installment','final','recurring') NOT NULL DEFAULT 'recurring'",
    );
  }
  schemaReady = true;
}

function mapTemplateRow(row) {
  const t = row.toJSON ? row.toJSON() : row;
  const limited = isLimitedDuration(t);
  const win = resolveTemplateWindow(t);
  let durationLabel = DURATION_LABELS.indefinite;
  if (limited) {
    const n = Number(t.occurrenceCount) || null;
    const entry = Number(t.entryAmount) || 0;
    if (entry > 0.009 && n) {
      durationLabel = `Entrada + ${n} cuota${n === 1 ? "" : "s"}`;
    } else if (n) {
      durationLabel = `${n} plazo${n === 1 ? "" : "s"}`;
    } else if (win.end) {
      durationLabel = `Hasta ${win.end}`;
    } else {
      durationLabel = DURATION_LABELS.limited;
    }
  }
  const planPreview = limited ? buildLimitedPaymentPlan(t) : [];
  return {
    ...t,
    categoryLabel: CATEGORY_LABELS[t.category] || t.category,
    frequencyLabel: FREQUENCY_LABELS[t.frequency] || t.frequency,
    amountTypeLabel: AMOUNT_TYPE_LABELS[t.amountType] || t.amountType,
    durationMode: limited ? "limited" : "indefinite",
    durationLabel,
    planPreview: planPreview.map((r) => ({
      ...r,
      kindLabel: OCCURRENCE_KIND_LABELS[r.kind] || r.kind,
      dueDate: r.dueDate instanceof Date ? r.dueDate.toISOString() : r.dueDate,
    })),
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
  const kind = o.kind || (o.periodKey === "entrada" ? "entry" : "recurring");
  let kindLabel = OCCURRENCE_KIND_LABELS[kind] || kind;
  if (kind === "entry") kindLabel = "Entrada";
  else if (kind === "final") kindLabel = "Cuota final";
  else if (kind === "installment") {
    const seq = Number(o.sequence);
    const hasEntry = Number(tpl?.entryAmount) > 0.009;
    const cuotaNum =
      Number.isFinite(seq) && seq > 0 ? (hasEntry ? Math.max(1, seq - 1) : seq) : null;
    kindLabel = cuotaNum != null ? `Cuota ${cuotaNum}` : "Cuota";
  }
  return {
    ...o,
    kind,
    kindLabel,
    template: tpl,
    displayName: tpl?.name || "Egreso recurrente",
    storeName: tpl?.storeName || "General",
    categoryLabel: tpl?.categoryLabel || "",
    amountType: tpl?.amountType,
    daysUntilDue: o.dueDate ? daysUntil(o.dueDate) : null,
    labelColor: tpl?.labelColor || null,
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

    if (shouldAutoDeactivateLimited(template)) {
      await template.update({ isActive: false }, { transaction: t });
      continue;
    }

    // Plan a plazos (entrada + cuotas) para plantillas limited con Nº de plazos.
    if (isLimitedDuration(template) && Number(template.occurrenceCount) > 0) {
      const plan = buildLimitedPaymentPlan(template);
      const planKeys = new Set(plan.map((r) => r.periodKey));
      for (const row of plan) {
        const exists = await RecurringExpenseOccurrence.findOne({
          where: { templateId: template.id, periodKey: row.periodKey },
          transaction: t,
        });
        if (exists) {
          // Actualizar monto/fecha/kind si aún está pendiente
          if (exists.status === "pending") {
            await exists.update(
              {
                dueDate: row.dueDate,
                expectedAmount: row.expectedAmount,
                sequence: row.sequence,
                kind: row.kind,
              },
              { transaction: t },
            );
          }
          continue;
        }
        await RecurringExpenseOccurrence.create(
          {
            templateId: template.id,
            periodKey: row.periodKey,
            dueDate: row.dueDate,
            expectedAmount: row.expectedAmount,
            sequence: row.sequence,
            kind: row.kind,
            status: "pending",
            createdBy: accountId,
          },
          { transaction: t },
        );
        created += 1;
      }
      // Quitar cuotas pendientes que ya no pertenecen al plan (ej. mensual del mismo mes
      // cuando la entrada mueve las cuotas al mes siguiente).
      const stale = await RecurringExpenseOccurrence.findAll({
        where: {
          templateId: template.id,
          status: "pending",
          periodKey: { [Op.notIn]: [...planKeys] },
        },
        transaction: t,
      });
      for (const occ of stale) {
        await occ.destroy({ transaction: t });
      }
      continue;
    }

    const generateAllLimited = isLimitedDuration(template);
    const keys = periodKeysToEnsure(template, undefined, { generateAllLimited });
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
          sequence: null,
          kind: "recurring",
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

/** Normaliza duración: indefinida o N plazos desde startDate. */
function resolveDurationFields(body, frequency) {
  const modeRaw = String(body.durationMode || "").toLowerCase();
  const count = Math.floor(Number(body.occurrenceCount) || 0);
  let durationMode =
    modeRaw === "limited" || modeRaw === "indefinite"
      ? modeRaw
      : count > 0 || body.endDate
        ? "limited"
        : "indefinite";

  let startDate = dateOnlyOrNull(body.startDate);
  let endDate = dateOnlyOrNull(body.endDate);
  let occurrenceCount = null;
  const coverFromIncome = body.coverFromIncome !== false && body.coverFromIncome !== 0;

  const totalAmount =
    body.totalAmount != null && body.totalAmount !== ""
      ? roundMoney(body.totalAmount)
      : null;
  const entryAmount =
    body.entryAmount != null && body.entryAmount !== ""
      ? Math.max(0, roundMoney(body.entryAmount))
      : 0;
  const firstInstallmentSameMonth = Boolean(body.firstInstallmentSameMonth);

  if (durationMode === "indefinite") {
    occurrenceCount = null;
    endDate = null;
  } else {
    if (!startDate) {
      startDate = dateOnlyOrNull(new Date()) || format(new Date(), "yyyy-MM-dd");
    }
    occurrenceCount = count > 0 ? count : null;
    if (!occurrenceCount && !endDate) {
      const err = new Error("Indicá cuántos plazos/cuotas mensuales (ej. 3)");
      err.statusCode = 400;
      throw err;
    }
    if (totalAmount != null && entryAmount > totalAmount + 0.009) {
      const err = new Error("La entrada no puede superar el total del plan");
      err.statusCode = 400;
      throw err;
    }
    // endDate desde el plan (entrada + cuotas)
    if (occurrenceCount) {
      const plan = buildLimitedPaymentPlan({
        frequency,
        dueDayOfMonth: body.dueDayOfMonth,
        dueMonth: body.dueMonth,
        startDate,
        occurrenceCount,
        totalAmount: totalAmount ?? 0,
        entryAmount,
        baseAmount: body.baseAmount,
        firstInstallmentSameMonth,
      });
      const last = plan[plan.length - 1];
      if (last?.dueDate) {
        endDate = dateOnlyOrNull(last.dueDate);
      } else if (!endDate) {
        endDate = computeEndDateFromCount(
          { frequency, dueDayOfMonth: body.dueDayOfMonth, dueMonth: body.dueMonth, startDate },
          startDate,
          occurrenceCount,
        );
      }
    }
    if (startDate && endDate && endDate < startDate) {
      const err = new Error("La fecha final es anterior al inicio");
      err.statusCode = 400;
      throw err;
    }
  }

  let suggestedBaseAmount = null;
  if (durationMode === "limited" && occurrenceCount) {
    const plan = buildLimitedPaymentPlan({
      frequency,
      dueDayOfMonth: body.dueDayOfMonth,
      dueMonth: body.dueMonth,
      startDate,
      occurrenceCount,
      totalAmount: totalAmount ?? 0,
      entryAmount,
      baseAmount: body.baseAmount,
      firstInstallmentSameMonth,
    });
    const installment = plan.find((r) => r.kind === "installment" || r.kind === "final");
    if (installment) suggestedBaseAmount = installment.expectedAmount;
  }

  return {
    durationMode,
    startDate,
    endDate,
    occurrenceCount,
    coverFromIncome,
    totalAmount: durationMode === "limited" ? totalAmount : null,
    entryAmount: durationMode === "limited" ? entryAmount : 0,
    firstInstallmentSameMonth: durationMode === "limited" ? firstInstallmentSameMonth : false,
    suggestedBaseAmount,
  };
}

async function registerOccurrencePayment({ occ, tpl, user, amount, date, note, transaction: t }) {
  const payAmount = roundMoney(amount ?? occ.actualAmount ?? occ.expectedAmount ?? tpl.baseAmount);
  if (payAmount <= 0) {
    const err = new Error("Monto inválido");
    err.statusCode = 400;
    throw err;
  }
  const payDate = toFinanceDateTime(date || new Date());
  const storeLabel = tpl.store?.name ? ` — ${tpl.store.name}` : "";
  const coverTag = tpl.coverFromIncome !== false ? " · c/ingresos" : "";
  const kindTag =
    occ.kind === "entry"
      ? "Entrada"
      : occ.kind === "final"
        ? "Cuota final"
        : occ.periodKey === "entrada"
          ? "Entrada"
          : occ.periodKey;
  const concept = `${tpl.name}${storeLabel} · ${kindTag}${coverTag}`.slice(0, 250);

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
    { transaction: t },
  );

  await occ.update(
    {
      status: "paid",
      actualAmount: payAmount,
      paidDate: payDate,
      expenseId: expense.id,
      note: note?.trim() || occ.note,
    },
    { transaction: t },
  );

  return { expense, payAmount };
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

    const coverHint =
      tpl.coverFromIncome !== false
        ? " Cubrir con ingresos (entrada) del negocio."
        : "";
    const message =
      days < 0
        ? `${tpl.name}${storeLabel} venció hace ${Math.abs(days)} día(s). Monto ref.: ${amt}.${coverHint}`
        : `${tpl.name}${storeLabel} vence en ${days} día(s) (${format(new Date(occ.dueDate), "d MMM yyyy", { locale: es })}). Monto ref.: ${amt}.${coverHint}`;

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
    await verifyJWT(token);
    await ensureRecurringColumns();
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
        where: {
          [Op.or]: [
            { dueDate: { [Op.between]: [mStart, mEnd] } },
            { status: "paid", paidDate: { [Op.between]: [mStart, mEnd] } },
          ],
        },
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
    res.status(500).json({ message: "Error al cargar egresos recurrentes" });
  }
};

export const createRecurringTemplate = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    const user = await verifyJWT(token);
    await ensureRecurringColumns();
    const body = req.body || {};

    const name = String(body.name || "").trim();
    if (!name) {
      notifyFail("recurring_template.create_failed", "Indica un nombre", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Indica un nombre" });
    }

    const frequency = ALLOWED_FREQ.has(body.frequency) ? body.frequency : "monthly";

    if (frequency === "annual" && !body.dueMonth) {
      notifyFail("recurring_template.create_failed", "Indica el mes de vencimiento anual", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Indica el mes de vencimiento anual" });
    }

    let duration;
    try {
      duration = resolveDurationFields(body, frequency);
    } catch (e) {
      notifyFail("recurring_template.create_failed", e.message, { req, httpStatus: 400 });
      return res.status(e.statusCode || 400).json({ message: e.message });
    }

    let baseAmount = roundMoney(body.baseAmount);
    if (!(baseAmount > 0) && duration.suggestedBaseAmount) {
      baseAmount = roundMoney(duration.suggestedBaseAmount);
    }
    if (baseAmount < 0) {
      notifyFail("recurring_template.create_failed", "Monto inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Monto inválido" });
    }

    const hasEntry = Number(duration.entryAmount) > 0.009;
    const entryActionRaw = String(body.entryAction || "").toLowerCase();
    let entryAction = "pending";
    if (hasEntry) {
      if (entryActionRaw === "pay" || body.payEntryNow === true || body.payEntryNow === "true") {
        entryAction = "pay";
      } else if (
        entryActionRaw === "omit" ||
        body.omitEntryNow === true ||
        body.omitEntryNow === "true"
      ) {
        entryAction = "omit";
      }
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
          dueDayOfMonth:
            frequency === "weekly"
              ? Math.min(7, Math.max(1, Number(body.dueDayOfMonth) || 1))
              : Math.min(31, Math.max(1, Number(body.dueDayOfMonth) || 5)),
          dueMonth: frequency === "annual" ? Number(body.dueMonth) : null,
          labelColor: normalizeHex(body.labelColor),
          startDate: duration.startDate,
          endDate: duration.endDate,
          durationMode: duration.durationMode,
          occurrenceCount: duration.occurrenceCount,
          coverFromIncome: duration.coverFromIncome,
          totalAmount: duration.totalAmount,
          entryAmount: duration.entryAmount,
          firstInstallmentSameMonth: Boolean(duration.firstInstallmentSameMonth),
          providerName: body.providerName?.trim() || null,
          note: body.note?.trim() || null,
          reminderDaysBefore: Math.max(0, Number(body.reminderDaysBefore) || 7),
          isActive: body.isActive !== false,
          createdBy: user.accountId,
        },
        { transaction: t }
      );

      await ensureOccurrencesForTemplates([row], user.accountId, t);

      if (entryAction !== "pending") {
        const entryOcc = await RecurringExpenseOccurrence.findOne({
          where: { templateId: row.id, periodKey: "entrada" },
          transaction: t,
        });
        if (entryOcc && entryOcc.status === "pending") {
          if (entryAction === "pay") {
            const fullTpl = await RecurringExpenseTemplate.findByPk(row.id, {
              include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
              transaction: t,
            });
            await registerOccurrencePayment({
              occ: entryOcc,
              tpl: fullTpl,
              user,
              amount: entryOcc.expectedAmount,
              date: body.entryPaidAt || duration.startDate || new Date(),
              note: body.entryNote || "Entrada al crear plan",
              transaction: t,
            });
          } else if (entryAction === "omit") {
            await entryOcc.update(
              {
                status: "skipped",
                note: body.entryNote || "Entrada externa (no sale del negocio)",
              },
              { transaction: t },
            );
          }
        }
      }

      return row;
    });

    const full = await RecurringExpenseTemplate.findByPk(template.id, {
      include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
    });

    notifyOk("recurring_template.created", "Plantilla recurrente creada", {
      template: mapTemplateRow(full),
    });
    res.status(201).json({
      ...mapTemplateRow(full),
      entryPaid: entryAction === "pay",
      entryOmitted: entryAction === "omit",
    });
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
    const user = await verifyJWT(token);
    await ensureRecurringColumns();

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
    if (body.frequency != null) {
      updates.frequency = ALLOWED_FREQ.has(body.frequency) ? body.frequency : template.frequency;
    }
    if (body.labelColor !== undefined) updates.labelColor = normalizeHex(body.labelColor);
    if (body.baseAmount != null) updates.baseAmount = roundMoney(body.baseAmount);
    if (body.dueDayOfMonth != null) {
      const freq = updates.frequency || template.frequency;
      updates.dueDayOfMonth =
        freq === "weekly"
          ? Math.min(7, Math.max(1, Number(body.dueDayOfMonth) || 1))
          : Math.min(31, Math.max(1, Number(body.dueDayOfMonth) || 5));
    }
    if (body.dueMonth !== undefined) updates.dueMonth = body.dueMonth ? Number(body.dueMonth) : null;
    if (body.providerName !== undefined) updates.providerName = body.providerName?.trim() || null;
    if (body.note !== undefined) updates.note = body.note?.trim() || null;
    if (body.reminderDaysBefore != null) {
      updates.reminderDaysBefore = Math.max(0, Number(body.reminderDaysBefore) || 7);
    }
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive);

    if (
      body.durationMode !== undefined ||
      body.occurrenceCount !== undefined ||
      body.startDate !== undefined ||
      body.endDate !== undefined ||
      body.coverFromIncome !== undefined ||
      body.totalAmount !== undefined ||
      body.entryAmount !== undefined ||
      body.firstInstallmentSameMonth !== undefined
    ) {
      try {
        const freq = updates.frequency || template.frequency;
        const duration = resolveDurationFields(
          {
            durationMode: body.durationMode ?? template.durationMode,
            occurrenceCount:
              body.occurrenceCount !== undefined ? body.occurrenceCount : template.occurrenceCount,
            startDate: body.startDate !== undefined ? body.startDate : template.startDate,
            endDate: body.endDate !== undefined ? body.endDate : template.endDate,
            coverFromIncome:
              body.coverFromIncome !== undefined ? body.coverFromIncome : template.coverFromIncome,
            dueDayOfMonth: updates.dueDayOfMonth ?? template.dueDayOfMonth,
            dueMonth: updates.dueMonth !== undefined ? updates.dueMonth : template.dueMonth,
            // Importante: sin esto al editar se perdían entrada/total (quedaban 0/null)
            totalAmount:
              body.totalAmount !== undefined ? body.totalAmount : template.totalAmount,
            entryAmount:
              body.entryAmount !== undefined ? body.entryAmount : template.entryAmount,
            firstInstallmentSameMonth:
              body.firstInstallmentSameMonth !== undefined
                ? body.firstInstallmentSameMonth
                : template.firstInstallmentSameMonth,
            baseAmount:
              updates.baseAmount != null
                ? updates.baseAmount
                : body.baseAmount != null
                  ? body.baseAmount
                  : template.baseAmount,
          },
          freq,
        );
        updates.durationMode = duration.durationMode;
        updates.startDate = duration.startDate;
        updates.endDate = duration.endDate;
        updates.occurrenceCount = duration.occurrenceCount;
        updates.coverFromIncome = duration.coverFromIncome;
        updates.totalAmount = duration.totalAmount;
        updates.entryAmount = duration.entryAmount;
        updates.firstInstallmentSameMonth = duration.firstInstallmentSameMonth;
        if (duration.suggestedBaseAmount && updates.baseAmount == null) {
          updates.baseAmount = duration.suggestedBaseAmount;
        }
      } catch (e) {
        return res.status(e.statusCode || 400).json({ message: e.message });
      }
    }

    // Al editar: omitir entrada pendiente si la marcó como externa
    const omitEntryOnUpdate =
      (body.omitEntryNow === true ||
        body.omitEntryNow === "true" ||
        String(body.entryAction || "").toLowerCase() === "omit") &&
      Number(updates.entryAmount ?? template.entryAmount) > 0.009;

    await sequelize.transaction(async (t) => {
      await template.update(updates, { transaction: t });
      await template.reload({ transaction: t });
      if (template.isActive) {
        await ensureOccurrencesForTemplates([template], user.accountId, t);
      }
      if (omitEntryOnUpdate) {
        const entryOcc = await RecurringExpenseOccurrence.findOne({
          where: { templateId: template.id, periodKey: "entrada", status: "pending" },
          transaction: t,
        });
        if (entryOcc) {
          await entryOcc.update(
            {
              status: "skipped",
              note: body.entryNote || "Entrada externa (no sale del negocio)",
            },
            { transaction: t },
          );
        }
      }
    });

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

    await sequelize.transaction(async (t) => {
      await registerOccurrencePayment({
        occ,
        tpl,
        user,
        amount: body.amount,
        date: body.date,
        note: body.note,
        transaction: t,
      });
    });

    const full = await RecurringExpenseOccurrence.findByPk(occ.id, {
      include: [
        {
          model: RecurringExpenseTemplate,
          as: "template",
          include: [{ model: Store, as: "store", attributes: ["id", "name"], required: false }],
        },
      ],
    });

    const mapped = mapOccurrenceRow(full);
    notifyOk("recurring_occurrence.paid", `Ocurrencia pagada #${occ.id}`, {
      occurrence: mapped,
    });
    res.json({
      message:
        mapped.kind === "entry"
          ? "Entrada registrada en finanzas"
          : mapped.kind === "final"
            ? "Cuota final registrada en finanzas"
            : "Pago registrado en finanzas",
      occurrence: mapped,
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

export const deleteRecurringTemplate = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const template = await RecurringExpenseTemplate.findByPk(req.params.id);
    if (!template) {
      notifyFail("recurring_template.delete_failed", `Plantilla #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Plantilla no encontrada" });
    }

    const paidCount = await RecurringExpenseOccurrence.count({
      where: { templateId: template.id, status: "paid" },
    });

    await sequelize.transaction(async (t) => {
      await RecurringExpenseOccurrence.destroy({
        where: { templateId: template.id },
        transaction: t,
      });
      await template.destroy({ transaction: t });
    });

    notifyOk("recurring_template.deleted", `Plantilla recurrente #${req.params.id} eliminada`, {
      templateId: Number(req.params.id),
      paidCount,
    });
    res.json({
      message:
        paidCount > 0
          ? "Plantilla eliminada. Los egresos ya registrados en finanzas se conservan."
          : "Plantilla eliminada",
    });
  } catch (err) {
    console.error("deleteRecurringTemplate error:", err);
    notifyFail("recurring_template.delete_failed", `Error al eliminar plantilla #${req.params.id}`, {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar plantilla" });
  }
};

export const restoreRecurringOccurrence = async (req, res) => {
  try {
    const token = getHeaderToken(req);
    await verifyJWT(token);

    const occ = await RecurringExpenseOccurrence.findByPk(req.params.id);
    if (!occ) {
      notifyFail("recurring_occurrence.restore_failed", `Cuota #${req.params.id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Cuota no encontrada" });
    }
    if (occ.status === "paid") {
      return res.status(400).json({ message: "La cuota ya está pagada" });
    }
    if (occ.status !== "skipped") {
      return res.status(400).json({ message: "La cuota no está omitida" });
    }

    await occ.update({ status: "pending" });

    notifyOk("recurring_occurrence.restored", `Ocurrencia reactivada #${occ.id}`, {
      occurrenceId: occ.id,
    });
    res.json({ message: "Cuota pendiente de nuevo" });
  } catch (err) {
    console.error("restoreRecurringOccurrence error:", err);
    notifyFail("recurring_occurrence.restore_failed", "Error al reactivar cuota", {
      error: err,
      req,
      httpStatus: 500,
      extra: { occurrenceId: req.params.id },
    });
    res.status(500).json({ message: "Error al reactivar cuota" });
  }
};

export async function syncRecurringExpenseReminders() {
  await ensureRecurringColumns();
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
