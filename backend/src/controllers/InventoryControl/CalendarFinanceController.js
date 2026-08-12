import { Customer, Order, OrderItem } from "../../models/Orders.js";
import { Expense, Income } from "../../models/Finance.js";
import { InventoryProduct } from "../../models/Inventory.js";
import { CashShiftMovement } from "../../models/CashShiftMovement.js";
import { Op } from "sequelize";
import {
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  format,
  parseISO,
  isValid as isValidDate,
} from "date-fns";
import { toFinanceDayKey, buildPaddedFinanceDateColumnWhere, filterByFinanceDayKeyRange } from "../../utils/financeDateUtils.js";
import { formatAppDateTime } from "../../utils/appDateTime.js";

const CAJA_POS_TAG = "[CAJA_POS]";
const round2 = (n) => Number(Number(n ?? 0).toFixed(2));
const dayKey = (d) => toFinanceDayKey(d);

function isPosOrder(order) {
  return String(order?.notes || "").includes(CAJA_POS_TAG);
}

function posLineTotal(item) {
  const sold = Number(item.soldQty || 0);
  const qty = sold > 0 ? sold : Number(item.quantity ?? 0);
  return round2(qty * Number(item.price ?? 0));
}

function emptyDayMetrics() {
  return {
    ordersAmount: 0,
    ordersCount: 0,
    deliveredUnits: 0,
    posSalesAmount: 0,
    posSalesCount: 0,
    posIncomeAmount: 0,
    posIncomeCount: 0,
    collectedAmount: 0,
    expensesAmount: 0,
  };
}

function ensureDay(map, key) {
  if (!map[key]) map[key] = emptyDayMetrics();
  return map[key];
}

function parseMonthQuery(req) {
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return null;
  }
  const start = startOfMonth(new Date(year, month - 1, 1));
  const end = endOfDay(endOfMonth(start));
  return {
    start,
    end,
    startStr: format(start, "yyyy-MM-dd"),
    endStr: format(end, "yyyy-MM-dd"),
  };
}

function parseDayQuery(req) {
  const raw = req.query.date;
  if (!raw || !isValidDate(parseISO(String(raw).slice(0, 10)))) return null;
  const d = parseISO(String(raw).slice(0, 10));
  return {
    date: d,
    key: dayKey(d),
    start: startOfDay(d),
    end: endOfDay(d),
    startStr: format(d, "yyyy-MM-dd"),
    endStr: format(d, "yyyy-MM-dd"),
  };
}

function addOrdersToDays(daysMap, orders) {
  for (const o of orders) {
    if (isPosOrder(o)) continue;
    const d = o.date ? new Date(o.date) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    const bucket = ensureDay(daysMap, key);
    bucket.ordersCount += 1;
    const items = o.ERP_order_items || [];
    for (const it of items) {
      const qty = Number(it.quantity ?? 0);
      const sub = qty * Number(it.price ?? 0);
      bucket.ordersAmount = round2(bucket.ordersAmount + sub);
      if (it.deliveredAt) bucket.deliveredUnits += qty;
    }
  }
}

function addIncomesSplitToDays(daysMap, incomes, posOrderItemIds) {
  for (const inc of incomes) {
    const key = dayKey(inc.date);
    if (!key) continue;
    const bucket = ensureDay(daysMap, key);
    const amt = Number(inc.amount ?? 0);
    const isCaja =
      inc.referenceType === "order_item" &&
      inc.referenceId != null &&
      posOrderItemIds.has(Number(inc.referenceId));

    if (isCaja) {
      bucket.posIncomeAmount = round2(bucket.posIncomeAmount + amt);
      bucket.posIncomeCount += 1;
    } else {
      bucket.collectedAmount = round2(bucket.collectedAmount + amt);
    }
  }
}

async function buildPosOrderItemIdSet(incomes) {
  const itemIds = [
    ...new Set(
      incomes
        .filter((inc) => inc.referenceType === "order_item" && inc.referenceId != null)
        .map((inc) => Number(inc.referenceId))
        .filter((id) => Number.isFinite(id)),
    ),
  ];
  if (!itemIds.length) return new Set();

  const items = await OrderItem.findAll({
    where: { id: { [Op.in]: itemIds } },
    attributes: ["id"],
    include: [{ model: Order, as: "ERP_order", attributes: ["notes"], required: true }],
  });

  const posIds = new Set();
  for (const it of items) {
    if (isPosOrder(it.ERP_order)) posIds.add(it.id);
  }
  return posIds;
}

async function applyCalendarIncomeDays(daysMap, start, end) {
  const incomes = await fetchIncomesInRange(start, end);
  const posOrderItemIds = await buildPosOrderItemIdSet(incomes);
  addIncomesSplitToDays(daysMap, incomes, posOrderItemIds);
  return { incomes, posOrderItemIds };
}

function addPosSalesToDays(daysMap, orders) {
  for (const o of orders) {
    if (!isPosOrder(o)) continue;
    const d = o.date ? new Date(o.date) : null;
    if (!d || Number.isNaN(d.getTime())) continue;
    const key = dayKey(d);
    const bucket = ensureDay(daysMap, key);
    bucket.posSalesCount += 1;
    const items = o.ERP_order_items || [];
    for (const it of items) {
      bucket.posSalesAmount = round2(bucket.posSalesAmount + posLineTotal(it));
    }
  }
}

function addExpensesToDays(daysMap, expenses) {
  for (const e of expenses) {
    const key = dayKey(e.date);
    if (!key) continue;
    const bucket = ensureDay(daysMap, key);
    bucket.expensesAmount = round2(bucket.expensesAmount + Number(e.amount ?? 0));
  }
}

function sumMonthTotals(daysMap, monthStart, monthEnd) {
  const totals = { orders: 0, posSales: 0, posIncome: 0, collected: 0, expenses: 0 };
  for (const [key, m] of Object.entries(daysMap)) {
    const d = parseISO(key);
    if (d < monthStart || d > monthEnd) continue;
    totals.orders = round2(totals.orders + m.ordersAmount);
    totals.posSales = round2(totals.posSales + m.posSalesAmount);
    totals.posIncome = round2(totals.posIncome + m.posIncomeAmount);
    totals.collected = round2(totals.collected + m.collectedAmount);
    totals.expenses = round2(totals.expenses + m.expensesAmount);
  }
  return totals;
}

function emptyMonthMetrics() {
  return {
    ordersAmount: 0,
    ordersCount: 0,
    posSalesAmount: 0,
    posSalesCount: 0,
    posIncomeAmount: 0,
    posIncomeCount: 0,
    collectedAmount: 0,
    expensesAmount: 0,
  };
}

function ensureMonth(map, key) {
  if (!map[key]) map[key] = emptyMonthMetrics();
  return map[key];
}

function aggregateDaysToMonths(daysMap) {
  const months = {};
  for (const [key, m] of Object.entries(daysMap)) {
    const mk = key.slice(0, 7);
    const bucket = ensureMonth(months, mk);
    bucket.ordersAmount = round2(bucket.ordersAmount + m.ordersAmount);
    bucket.ordersCount += m.ordersCount;
    bucket.posSalesAmount = round2(bucket.posSalesAmount + m.posSalesAmount);
    bucket.posSalesCount += m.posSalesCount;
    bucket.posIncomeAmount = round2(bucket.posIncomeAmount + m.posIncomeAmount);
    bucket.posIncomeCount += m.posIncomeCount;
    bucket.collectedAmount = round2(bucket.collectedAmount + m.collectedAmount);
    bucket.expensesAmount = round2(bucket.expensesAmount + m.expensesAmount);
  }
  return months;
}

function sumYearTotals(monthsMap) {
  const totals = { orders: 0, posSales: 0, posIncome: 0, collected: 0, expenses: 0 };
  for (const m of Object.values(monthsMap)) {
    totals.orders = round2(totals.orders + m.ordersAmount);
    totals.posSales = round2(totals.posSales + m.posSalesAmount);
    totals.posIncome = round2(totals.posIncome + m.posIncomeAmount);
    totals.collected = round2(totals.collected + m.collectedAmount);
    totals.expenses = round2(totals.expenses + m.expensesAmount);
  }
  return totals;
}

async function fetchOrdersInRange(start, end, { light = false } = {}) {
  return Order.findAll({
    where: { date: { [Op.between]: [start, end] } },
    attributes: light ? ["id", "date", "notes", "customerId"] : undefined,
    include: [
      ...(light
        ? []
        : [{ model: Customer, as: "ERP_customer", attributes: ["id", "name"] }]),
      {
        model: OrderItem,
        as: "ERP_order_items",
        attributes: light
          ? ["id", "quantity", "price", "deliveredAt", "soldQty"]
          : undefined,
      },
    ],
    order: [["date", "ASC"]],
  });
}

function financeRangeWhere(start, end) {
  const padded = buildPaddedFinanceDateColumnWhere(start, end, 1);
  return padded;
}

async function fetchIncomesInRange(start, end) {
  const padded = financeRangeWhere(start, end);
  if (!padded?.where) return [];
  const rows = await Income.findAll({
    where: { [Op.and]: [padded.where] },
    attributes: [
      "id",
      "date",
      "amount",
      "concept",
      "category",
      "referenceType",
      "referenceId",
      "counterpartyName",
    ],
    order: [["date", "ASC"]],
  });
  return filterByFinanceDayKeyRange(rows, padded.startKey, padded.endKey);
}

async function fetchExpensesInRange(start, end) {
  const padded = financeRangeWhere(start, end);
  if (!padded?.where) return [];
  const rows = await Expense.findAll({
    where: { [Op.and]: [padded.where] },
    attributes: [
      "id",
      "date",
      "amount",
      "concept",
      "category",
      "referenceId",
      "referenceType",
    ],
    order: [["date", "ASC"]],
  });
  return filterByFinanceDayKeyRange(rows, padded.startKey, padded.endKey);
}

/**
 * Resuelve nombre de producto por gasto según referenceType.
 * - inventory_entry → referenceId es productId
 * - cash_shift_movement → referenceId es movimiento de caja; producto en CashShiftMovement.productId
 */
async function buildExpenseProductNameResolver(expenses) {
  const inventoryProductIds = new Set();
  const shiftMovementIds = new Set();

  for (const e of expenses) {
    if (!e.referenceId) continue;
    if (e.referenceType === "inventory_entry") {
      inventoryProductIds.add(e.referenceId);
    } else if (e.referenceType === "cash_shift_movement") {
      shiftMovementIds.add(e.referenceId);
    }
  }

  const shiftMovements =
    shiftMovementIds.size > 0
      ? await CashShiftMovement.findAll({
          where: { id: { [Op.in]: [...shiftMovementIds] } },
          attributes: ["id", "productId"],
        })
      : [];

  const shiftProductByMovementId = new Map(
    shiftMovements.map((m) => [m.id, m.productId ?? null]),
  );

  for (const productId of shiftMovements.map((m) => m.productId).filter(Boolean)) {
    inventoryProductIds.add(productId);
  }

  const products =
    inventoryProductIds.size > 0
      ? await InventoryProduct.findAll({
          where: { id: { [Op.in]: [...inventoryProductIds] } },
          attributes: ["id", "name"],
        })
      : [];

  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  return (expense) => {
    if (!expense.referenceId) return null;

    if (expense.referenceType === "inventory_entry") {
      return productNameById.get(expense.referenceId) ?? null;
    }

    if (expense.referenceType === "cash_shift_movement") {
      const productId = shiftProductByMovementId.get(expense.referenceId);
      return productId ? productNameById.get(productId) ?? null : null;
    }

    return null;
  };
}

function shapeIncomeDetail(inc, posOrderItemIds) {
  const isCaja =
    inc.referenceType === "order_item" &&
    inc.referenceId != null &&
    posOrderItemIds.has(Number(inc.referenceId));

  return {
    id: inc.id,
    amount: round2(inc.amount),
    concept: inc.concept,
    category: inc.category,
    counterparty: inc.counterpartyName || null,
    referenceType: inc.referenceType || null,
    source: isCaja ? "caja" : "cobro",
    date: inc.date ? formatAppDateTime(inc.date) : null,
  };
}

function shapeOrderDetail(o) {
  const items = (o.ERP_order_items || []).map((it) => {
    const sold = Number(it.soldQty || 0);
    const qty = sold > 0 ? sold : Number(it.quantity ?? 0);
    const price = Number(it.price ?? 0);
    return {
      id: it.id,
      qty,
      price,
      subtotal: round2(qty * price),
      paidAt: it.paidAt ? format(new Date(it.paidAt), "dd/MM/yyyy HH:mm:ss") : null,
      deliveredAt: it.deliveredAt ? format(new Date(it.deliveredAt), "dd/MM/yyyy HH:mm:ss") : null,
    };
  });
  const total = round2(items.reduce((s, it) => s + it.subtotal, 0));
  return {
    id: o.id,
    customer: o.ERP_customer?.name ?? "Cliente",
    date: o.date ? format(new Date(o.date), "dd/MM/yyyy HH:mm:ss") : null,
    items,
    total,
  };
}

function shapePosSaleDetail(o) {
  const base = shapeOrderDetail(o);
  const docType = o.documentType || "consumidor_final";
  const customerLabel =
    docType === "consumidor_final" ? "Consumidor final" : base.customer;
  return {
    ...base,
    customer: customerLabel,
    paymentMethod: o.paymentMethod || "efectivo",
    documentType: docType,
    status: o.status,
    isCredit: o.status === "pendiente",
  };
}

/**
 * GET /finance/calendar-year?year=2026
 * Totales por mes del año (misma lógica que el calendario diario).
 */
export const getCalendarYearSummary = async (req, res) => {
  try {
    const year = Number(req.query.year);
    if (!Number.isFinite(year) || year < 2000 || year > 2100) {
      return res.status(400).json({ message: "Parámetro year requerido (2000-2100)" });
    }

    const start = startOfMonth(new Date(year, 0, 1));
    const end = endOfDay(endOfMonth(new Date(year, 11, 1)));

    const [orders, expenses] = await Promise.all([
      fetchOrdersInRange(start, end, { light: true }),
      fetchExpensesInRange(start, end),
    ]);

    const days = {};
    addOrdersToDays(days, orders);
    addPosSalesToDays(days, orders);
    await applyCalendarIncomeDays(days, start, end);
    addExpensesToDays(days, expenses);

    const monthsRaw = aggregateDaysToMonths(days);

    const months = {};
    for (let m = 1; m <= 12; m += 1) {
      const key = format(new Date(year, m - 1, 1), "yyyy-MM");
      months[key] = monthsRaw[key] ?? emptyMonthMetrics();
    }

    return res.json({
      year,
      months,
      totals: sumYearTotals(months),
    });
  } catch (error) {
    console.error("getCalendarYearSummary:", error);
    return res.status(500).json({ message: "Error al cargar resumen anual" });
  }
};

/**
 * GET /finance/calendar-month?year=2026&month=6
 * Totales por día del mes (ligero, para la grilla del calendario).
 */
export const getCalendarMonthSummary = async (req, res) => {
  try {
    const range = parseMonthQuery(req);
    if (!range) {
      return res.status(400).json({ message: "Parámetros year y month (1-12) requeridos" });
    }

    const [orders, expenses] = await Promise.all([
      fetchOrdersInRange(range.start, range.end, { light: true }),
      fetchExpensesInRange(range.start, range.end),
    ]);

    const days = {};
    addOrdersToDays(days, orders);
    addPosSalesToDays(days, orders);
    await applyCalendarIncomeDays(days, range.start, range.end);
    addExpensesToDays(days, expenses);

    return res.json({
      days,
      totals: sumMonthTotals(days, range.start, range.end),
    });
  } catch (error) {
    console.error("getCalendarMonthSummary:", error);
    return res.status(500).json({ message: "Error al cargar resumen del calendario" });
  }
};

function parseRangeQuery(req) {
  const startRaw = req.query.startDate;
  const endRaw = req.query.endDate || startRaw;
  if (!startRaw || !isValidDate(parseISO(String(startRaw).slice(0, 10)))) return null;
  const startD = parseISO(String(startRaw).slice(0, 10));
  const endD = parseISO(String(endRaw).slice(0, 10));
  if (!isValidDate(endD)) return null;
  const start = startOfDay(startD);
  const end = endOfDay(endD < startD ? startD : endD);
  return {
    start,
    end,
    startStr: format(start, "yyyy-MM-dd"),
    endStr: format(end, "yyyy-MM-dd"),
  };
}

async function buildPeriodDetail(range) {
  const [orders, expenses] = await Promise.all([
    fetchOrdersInRange(range.start, range.end),
    fetchExpensesInRange(range.start, range.end),
  ]);

  const regularOrders = orders.filter((o) => !isPosOrder(o));
  const posOrders = orders.filter(isPosOrder);
  const shapedOrders = regularOrders.map(shapeOrderDetail);
  const posSales = posOrders.map(shapePosSaleDetail);

  const days = {};
  addOrdersToDays(days, orders);
  addPosSalesToDays(days, orders);
  const { incomes, posOrderItemIds } = await applyCalendarIncomeDays(days, range.start, range.end);
  addExpensesToDays(days, expenses);

  const incomeRows = incomes.map((inc) => shapeIncomeDetail(inc, posOrderItemIds));

  const expenseProductName = await buildExpenseProductNameResolver(expenses);

  const shapedExpenses = expenses.map((e) => ({
    id: e.id,
    concept: e.concept,
    category: e.category,
    productName: expenseProductName(e),
    amount: round2(e.amount),
    date: e.date ? formatAppDateTime(e.date) : null,
  }));

  const totals = emptyDayMetrics();
  for (const m of Object.values(days)) {
    totals.ordersAmount = round2(totals.ordersAmount + m.ordersAmount);
    totals.ordersCount += m.ordersCount;
    totals.deliveredUnits += m.deliveredUnits;
    totals.posSalesAmount = round2(totals.posSalesAmount + m.posSalesAmount);
    totals.posSalesCount += m.posSalesCount;
    totals.posIncomeAmount = round2(totals.posIncomeAmount + m.posIncomeAmount);
    totals.posIncomeCount += m.posIncomeCount;
    totals.collectedAmount = round2(totals.collectedAmount + m.collectedAmount);
    totals.expensesAmount = round2(totals.expensesAmount + m.expensesAmount);
  }

  return {
    orders: shapedOrders,
    posSales,
    incomes: incomeRows,
    abonos: [],
    directPayments: [],
    expenses: shapedExpenses,
    totals,
    dailyBreakdown: days,
  };
}

/**
 * GET /finance/calendar-day?date=YYYY-MM-DD
 * Detalle completo de un solo día (modal).
 */
export const getCalendarDayDetail = async (req, res) => {
  try {
    const range = parseDayQuery(req);
    if (!range) {
      return res.status(400).json({ message: "Parámetro date (YYYY-MM-DD) requerido" });
    }

    const detail = await buildPeriodDetail({
      start: range.start,
      end: range.end,
      startStr: range.startStr,
      endStr: range.endStr,
    });

    return res.json(detail);
  } catch (error) {
    console.error("getCalendarDayDetail:", error);
    return res.status(500).json({ message: "Error al cargar detalle del día" });
  }
};

/**
 * GET /finance/calendar-period?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * Detalle agregado de un rango (día, semana o mes).
 */
export const getCalendarPeriodDetail = async (req, res) => {
  try {
    const range = parseRangeQuery(req);
    if (!range) {
      return res.status(400).json({ message: "Parámetros startDate y endDate (YYYY-MM-DD) requeridos" });
    }

    const detail = await buildPeriodDetail(range);
    return res.json(detail);
  } catch (error) {
    console.error("getCalendarPeriodDetail:", error);
    return res.status(500).json({ message: "Error al cargar detalle del período" });
  }
};
