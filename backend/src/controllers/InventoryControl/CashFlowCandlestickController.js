import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  addDays,
  addWeeks,
  addMonths,
  differenceInCalendarDays,
  differenceInCalendarWeeks,
  differenceInCalendarMonths,
  parseISO,
  isValid,
} from "date-fns";
import { es } from "date-fns/locale";
import { Op } from "sequelize";
import { Income, Expense } from "../../models/Finance.js";
import {
  toFinanceDayKey,
  financeBucketKey,
  toChartBusinessDay,
  parseFinanceDayKey,
  dayKeyStartUtc,
  buildFinanceDateColumnWhere,
} from "../../utils/financeDateUtils.js";

const VALID_GRANULARITY = new Set(["day", "week", "month"]);

function parseDateParam(value) {
  if (!value) return null;
  const d = parseISO(String(value).slice(0, 10));
  return isValid(d) ? d : null;
}

function round2(n) {
  return Number(Number(n || 0).toFixed(2));
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bucketMeta(date, granularity) {
  const d = new Date(date);
  if (granularity === "day") {
    const start = startOfDay(d);
    return {
      key: format(start, "yyyy-MM-dd"),
      label: format(start, "EEE d MMM", { locale: es }),
      start,
      end: addDays(start, 1),
      time: toChartBusinessDay(start),
    };
  }
  if (granularity === "week") {
    const start = startOfWeek(d, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(d, { weekStartsOn: 1 });
    return {
      key: format(start, "yyyy-MM-dd"),
      label: `${format(start, "d MMM", { locale: es })} – ${format(weekEnd, "d MMM", { locale: es })}`,
      start,
      end: addWeeks(start, 1),
      time: toChartBusinessDay(start),
    };
  }
  const start = startOfMonth(d);
  return {
    key: format(start, "yyyy-MM"),
    label: format(start, "MMM yyyy", { locale: es }),
    start,
    end: addMonths(start, 1),
    time: toChartBusinessDay(start),
  };
}

function alignedStart(firstTs, granularity) {
  if (granularity === "day") return startOfDay(firstTs);
  if (granularity === "week") return startOfWeek(firstTs, { weekStartsOn: 1 });
  return startOfMonth(firstTs);
}

function alignedEnd(lastTs, granularity) {
  if (granularity === "day") return endOfDay(lastTs);
  if (granularity === "week") return endOfWeek(lastTs, { weekStartsOn: 1 });
  return endOfMonth(lastTs);
}

function countBuckets(granularity, firstTs, lastTs) {
  const start = alignedStart(firstTs, granularity);
  const end = alignedEnd(lastTs, granularity);
  if (granularity === "day") return differenceInCalendarDays(end, start) + 1;
  if (granularity === "week") {
    return differenceInCalendarWeeks(end, start, { weekStartsOn: 1 }) + 1;
  }
  return differenceInCalendarMonths(end, start) + 1;
}

function nthBucketDate(granularity, firstTs, index) {
  const start = alignedStart(firstTs, granularity);
  if (granularity === "day") return addDays(start, index);
  if (granularity === "week") return addWeeks(start, index);
  return addMonths(start, index);
}

/** Solo construye la ventana visible (no itera todo el historial día a día). */
function buildWindowBuckets(granularity, firstTs, lastTs, limit, offset) {
  const totalCandles = countBuckets(granularity, firstTs, lastTs);
  const sliceEnd = Math.max(0, totalCandles - offset);
  const sliceStart = Math.max(0, sliceEnd - limit);
  const buckets = [];
  for (let i = sliceStart; i < sliceEnd; i += 1) {
    buckets.push(bucketMeta(nthBucketDate(granularity, firstTs, i), granularity));
  }
  return { buckets, totalCandles, sliceStart };
}

function openingBalanceBefore(movements, beforeDate) {
  let balance = 0;
  for (const m of movements) {
    if (m.ts < beforeDate) balance += m.delta;
    else break;
  }
  return balance;
}

function buildCandles(movements, buckets, granularity) {
  if (!buckets.length) return [];

  const movementsByKey = new Map();
  for (const m of movements) {
    const key = financeBucketKey(m.ts, granularity);
    if (!key) continue;
    if (!movementsByKey.has(key)) movementsByKey.set(key, []);
    movementsByKey.get(key).push(m);
  }

  let balance = openingBalanceBefore(movements, buckets[0].start);
  const candles = [];

  for (const bucket of buckets) {
    const open = round2(balance);
    let high = balance;
    let low = balance;

    for (const m of movementsByKey.get(bucket.key) || []) {
      balance += m.delta;
      high = Math.max(high, balance);
      low = Math.min(low, balance);
    }

    const close = round2(balance);
    candles.push({
      key: bucket.key,
      label: bucket.label,
      time: bucket.time,
      open,
      high: round2(high),
      low: round2(low),
      close,
      overdraft: low < 0,
      bullish: close >= open,
    });
  }

  return candles;
}

async function sumAmountWhere(Model, dateWhere) {
  const total = await Model.sum("amount", { where: dateWhere });
  return toNum(total);
}

async function fetchDateBoundsFixed(Model) {
  const { fn, col } = Model.sequelize;
  const row = await Model.findOne({
    attributes: [
      [fn("MIN", col("date")), "minDate"],
      [fn("MAX", col("date")), "maxDate"],
      [fn("SUM", col("amount")), "total"],
    ],
    raw: true,
  });
  return {
    minDate: row?.minDate ? new Date(row.minDate) : null,
    maxDate: row?.maxDate ? new Date(row.maxDate) : null,
    total: toNum(row?.total),
  };
}

async function fetchMovementsInDayRange(startKey, endKey) {
  const rangeWhere = buildFinanceDateColumnWhere(startKey, endKey) || {};

  const [incomes, expenses] = await Promise.all([
    Income.findAll({
      attributes: ["date", "amount"],
      where: rangeWhere,
      order: [["date", "ASC"]],
      raw: true,
    }),
    Expense.findAll({
      attributes: ["date", "amount"],
      where: rangeWhere,
      order: [["date", "ASC"]],
      raw: true,
    }),
  ]);

  return [
    ...incomes.map((r) => ({
      dayKey: toFinanceDayKey(r.date),
      ts: new Date(r.date),
      delta: toNum(r.amount),
    })),
    ...expenses.map((r) => ({
      dayKey: toFinanceDayKey(r.date),
      ts: new Date(r.date),
      delta: -toNum(r.amount),
    })),
  ]
    .filter((m) => m.dayKey)
    .sort((a, b) => a.ts - b.ts);
}

async function netBalanceBeforeDayKey(dayKey) {
  const before = dayKeyStartUtc(dayKey);
  if (!before) return 0;
  const dateWhere = { date: { [Op.lt]: before } };
  const [inc, exp] = await Promise.all([
    sumAmountWhere(Income, dateWhere),
    sumAmountWhere(Expense, dateWhere),
  ]);
  return round2(inc - exp);
}

export const getCashFlowCandles = async (req, res) => {
  try {
    const granularity = VALID_GRANULARITY.has(req.query.granularity)
      ? req.query.granularity
      : "day";

    const limit = Math.min(50, Math.max(5, parseInt(req.query.limit, 10) || 25));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    const filterStart = parseDateParam(req.query.startDate);
    const filterEnd = parseDateParam(req.query.endDate);

    const [incomeBounds, expenseBounds] = await Promise.all([
      fetchDateBoundsFixed(Income),
      fetchDateBoundsFixed(Expense),
    ]);

    const currentBalance = round2(incomeBounds.total - expenseBounds.total);

    const candidates = [
      incomeBounds.minDate,
      expenseBounds.minDate,
      incomeBounds.maxDate,
      expenseBounds.maxDate,
    ].filter((d) => d && !Number.isNaN(d.getTime()));

    if (!candidates.length) {
      return res.json({
        granularity,
        candles: [],
        openingBalance: 0,
        totalCandles: 0,
        hasMore: false,
        limit,
        offset,
        currentBalance: 0,
      });
    }

    let firstTs = new Date(Math.min(...candidates.map((d) => d.getTime())));
    let lastTs = new Date(Math.max(...candidates.map((d) => d.getTime())));

    if (filterStart) {
      firstTs = new Date(Math.max(firstTs.getTime(), startOfDay(filterStart).getTime()));
    }
    if (filterEnd) {
      lastTs = new Date(Math.min(lastTs.getTime(), endOfDay(filterEnd).getTime()));
    }

    if (firstTs > lastTs) {
      return res.json({
        granularity,
        candles: [],
        openingBalance: 0,
        totalCandles: 0,
        hasMore: false,
        limit,
        offset,
        currentBalance,
      });
    }

    const { buckets: windowBuckets, totalCandles, sliceStart } = buildWindowBuckets(
      granularity,
      firstTs,
      lastTs,
      limit,
      offset,
    );

    if (!windowBuckets.length) {
      return res.json({
        granularity,
        candles: [],
        openingBalance: 0,
        totalCandles,
        hasMore: sliceStart > 0,
        limit,
        offset,
        currentBalance,
      });
    }

    const windowStartKey =
      toFinanceDayKey(windowBuckets[0].start) || format(windowBuckets[0].start, "yyyy-MM-dd");
    const lastBucket = windowBuckets[windowBuckets.length - 1];
    const windowEndKey =
      toFinanceDayKey(addDays(lastBucket.end, -1)) ||
      format(addDays(lastBucket.end, -1), "yyyy-MM-dd");

    const [openingBalance, windowMovements] = await Promise.all([
      netBalanceBeforeDayKey(windowStartKey),
      fetchMovementsInDayRange(windowStartKey, windowEndKey),
    ]);

    const seedTs = addDays(parseFinanceDayKey(windowStartKey) || windowBuckets[0].start, -1);
    const seededMovements =
      openingBalance !== 0
        ? [{ dayKey: toFinanceDayKey(seedTs), ts: seedTs, delta: openingBalance }, ...windowMovements]
        : windowMovements;

    const candles = buildCandles(seededMovements, windowBuckets, granularity);

    return res.json({
      granularity,
      candles,
      openingBalance: round2(openingBalance),
      currentBalance,
      totalCandles,
      hasMore: sliceStart > 0,
      limit,
      offset,
    });
  } catch (error) {
    console.error("getCashFlowCandles:", error);
    return res.status(500).json({
      message: "Error al obtener velas de flujo de caja",
      error: error.message,
    });
  }
};
