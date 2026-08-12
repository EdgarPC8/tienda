import { Op } from "sequelize";
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  eachDayOfInterval,
  eachMonthOfInterval,
  startOfDay,
  endOfDay,
  format,
  getDay,
  differenceInCalendarDays,
  parseISO,
  isValid,
  subDays,
} from "date-fns";
import { es } from "date-fns/locale";
import { OrderItem } from "../../models/Orders.js";
import { Income } from "../../models/Finance.js";
import { InventoryProduct } from "../../models/Inventory.js";
import {
  buildFinanceDateColumnWhere,
  financeBucketKey,
  toFinanceDayKey,
} from "../../utils/financeDateUtils.js";

const RANK_BAND_SIZE = 10;
const VALID_PERIODS = new Set(["week", "month", "year"]);
const VALID_SORT = new Set(["amount", "qty"]);

/** 0=Dom … 6=Sáb (igual que date-fns getDay). Orden de presentación lun→dom. */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABELS = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

function parseRankBand(value) {
  const band = Number.parseInt(String(value ?? 1), 10);
  if (!Number.isFinite(band) || band < 1) return 1;
  return band;
}

function parseSortBy(value) {
  const s = String(value || "amount").trim().toLowerCase();
  return VALID_SORT.has(s) ? s : "amount";
}

function bandToRange(band) {
  const rankStart = (band - 1) * RANK_BAND_SIZE + 1;
  const rankEnd = band * RANK_BAND_SIZE;
  return { band, rankStart, rankEnd, rankBandSize: RANK_BAND_SIZE };
}

function getPeriodConfig(period) {
  const now = new Date();
  if (period === "week") {
    return {
      period,
      label: "Semana actual",
      granularity: "day",
      start: startOfDay(startOfWeek(now, { weekStartsOn: 1 })),
      end: endOfDay(endOfWeek(now, { weekStartsOn: 1 })),
    };
  }
  if (period === "month") {
    return {
      period,
      label: "Mes actual",
      granularity: "day",
      start: startOfDay(startOfMonth(now)),
      end: endOfDay(endOfMonth(now)),
    };
  }
  return {
    period,
    label: "Año actual",
    granularity: "month",
    start: startOfDay(startOfYear(now)),
    end: endOfDay(endOfYear(now)),
  };
}

function getBuckets({ start, end, granularity }) {
  if (granularity === "day") {
    return eachDayOfInterval({ start, end }).map((d) => ({
      key: format(d, "yyyy-MM-dd"),
      start: startOfDay(d),
      end: endOfDay(d),
    }));
  }
  return eachMonthOfInterval({ start, end }).map((d) => ({
    key: format(startOfMonth(d), "yyyy-MM"),
    start: startOfDay(startOfMonth(d)),
    end: endOfDay(endOfMonth(d)),
  }));
}

function roundQty(n) {
  return Number(Number(n || 0).toFixed(4));
}

function roundAmt(n) {
  return Number(Number(n || 0).toFixed(2));
}

function bucketKeyForRow(date, granularity) {
  return granularity === "day"
    ? toFinanceDayKey(date)
    : financeBucketKey(date, granularity);
}

function formatBucketLabel(key, granularity) {
  if (!key) return "—";
  if (granularity === "month" && /^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split("-").map(Number);
    return format(new Date(y, m - 1, 1), "MMMM yyyy", { locale: es });
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(key)) {
    return format(new Date(`${key.slice(0, 10)}T12:00:00`), "EEEE d 'de' MMMM yyyy", {
      locale: es,
    });
  }
  return key;
}

function summarizeProductRows(rows, productId) {
  let amount = 0;
  let qty = 0;
  let payments = 0;
  const days = new Set();
  for (const row of rows) {
    if (Number(row.productId) !== Number(productId)) continue;
    amount += Number(row.amount || 0);
    qty += Number(row.quantity || 0);
    payments += 1;
    const dayKey = toFinanceDayKey(row.date);
    if (dayKey) days.add(dayKey);
  }
  return {
    amount: roundAmt(amount),
    qty: roundQty(qty),
    payments,
    activeDays: days.size,
  };
}

function pctChange(current, previous) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev === 0) return cur > 0 ? 100 : cur < 0 ? -100 : 0;
  return roundAmt(((cur - prev) / Math.abs(prev)) * 100);
}

function sellSpeedLabel({ daysOfCover, pctDaysWithSales, qtyPerDay }) {
  if (!(qtyPerDay > 0)) return "Sin ritmo de venta";
  if (daysOfCover != null && daysOfCover <= 3) return "Muy rápido (poco stock)";
  if (daysOfCover != null && daysOfCover <= 7) return "Rápido";
  if (pctDaysWithSales >= 60) return "Constante";
  if (pctDaysWithSales >= 30) return "Moderado";
  if (qtyPerDay > 0) return "Esporádico";
  return "Sin ritmo de venta";
}

async function loadProductNames(ids) {
  if (!ids.length) return {};
  const rows = await InventoryProduct.findAll({
    where: { id: { [Op.in]: ids } },
    attributes: ["id", "name", "barcode", "sku", "price", "supplierPrice", "stock", "minStock"],
  });
  const map = {};
  for (const p of rows) {
    map[p.id] = {
      name: p.name,
      barcode: p.barcode || null,
      sku: p.sku || null,
      price: Number(p.price ?? 0),
      supplierPrice: Number(p.supplierPrice ?? 0),
      stock: Number(p.stock ?? 0),
      minStock: Number(p.minStock ?? 0),
    };
  }
  return map;
}

/** Cantidad proporcional al cobro (abonos parciales). */
function qtyFromIncome(item, amount) {
  const lineQty = Number(item.quantity || 0);
  const price = Number(item.price || 0);
  const amt = Number(amount || 0);
  if (price > 0 && amt > 0) {
    const q = amt / price;
    if (lineQty > 0) return Math.min(q, lineQty);
    return q;
  }
  return lineQty;
}

async function loadSalesRows(periodConfig) {
  const { start, end } = periodConfig;
  const dateClause = buildFinanceDateColumnWhere(start, end);
  const incomeWhere = {
    referenceType: "order_item",
    referenceId: { [Op.ne]: null },
    ...(dateClause ? { [Op.and]: [dateClause] } : {}),
  };

  const incomes = await Income.findAll({
    where: incomeWhere,
    attributes: ["date", "amount", "referenceId"],
    raw: true,
  });

  if (!incomes.length) return [];

  const itemIds = [...new Set(incomes.map((i) => i.referenceId))];
  const items = await OrderItem.findAll({
    where: { id: { [Op.in]: itemIds } },
    attributes: ["id", "productId", "quantity", "price"],
    include: [
      {
        model: InventoryProduct,
        as: "ERP_inventory_product",
        attributes: [],
        required: true,
        where: { type: "final" },
      },
    ],
  });
  const itemById = new Map(items.map((it) => [it.id, it]));

  const rows = [];
  for (const inc of incomes) {
    const item = itemById.get(inc.referenceId);
    if (!item) continue;
    const amount = Number(inc.amount ?? 0);
    rows.push({
      productId: item.productId,
      date: inc.date,
      quantity: qtyFromIncome(item, amount),
      amount,
    });
  }
  return rows;
}

/** Filas de cobro solo de un producto (más eficiente para historial completo). */
async function loadSalesRowsForProduct(productId, periodConfig) {
  const items = await OrderItem.findAll({
    where: { productId: Number(productId) },
    attributes: ["id", "productId", "quantity", "price"],
    include: [
      {
        model: InventoryProduct,
        as: "ERP_inventory_product",
        attributes: [],
        required: true,
        where: { type: "final" },
      },
    ],
  });
  if (!items.length) return [];

  const itemById = new Map(items.map((it) => [it.id, it]));
  const itemIds = items.map((it) => it.id);
  const dateClause = periodConfig?.start && periodConfig?.end
    ? buildFinanceDateColumnWhere(periodConfig.start, periodConfig.end)
    : null;

  const incomes = await Income.findAll({
    where: {
      referenceType: "order_item",
      referenceId: { [Op.in]: itemIds },
      ...(dateClause ? { [Op.and]: [dateClause] } : {}),
    },
    attributes: ["date", "amount", "referenceId"],
    order: [["date", "ASC"]],
    raw: true,
  });

  const rows = [];
  for (const inc of incomes) {
    const item = itemById.get(inc.referenceId);
    if (!item) continue;
    const amount = Number(inc.amount ?? 0);
    rows.push({
      productId: item.productId,
      date: inc.date,
      quantity: qtyFromIncome(item, amount),
      amount,
    });
  }
  return rows;
}

/** Historial desde la primera venta del producto hasta hoy. */
async function getLifetimePeriodConfig(productId) {
  const items = await OrderItem.findAll({
    where: { productId: Number(productId) },
    attributes: ["id"],
    include: [
      {
        model: InventoryProduct,
        as: "ERP_inventory_product",
        attributes: [],
        required: true,
        where: { type: "final" },
      },
    ],
  });
  const itemIds = items.map((it) => it.id);
  if (!itemIds.length) {
    const now = new Date();
    return {
      period: "all",
      label: "Sin historial de ventas",
      granularity: "day",
      start: startOfDay(now),
      end: endOfDay(now),
      firstSaleAt: null,
      lastSaleAt: null,
    };
  }

  const first = await Income.min("date", {
    where: {
      referenceType: "order_item",
      referenceId: { [Op.in]: itemIds },
    },
  });
  const last = await Income.max("date", {
    where: {
      referenceType: "order_item",
      referenceId: { [Op.in]: itemIds },
    },
  });

  if (!first) {
    const now = new Date();
    return {
      period: "all",
      label: "Sin cobros registrados",
      granularity: "day",
      start: startOfDay(now),
      end: endOfDay(now),
      firstSaleAt: null,
      lastSaleAt: null,
    };
  }

  const start = startOfDay(new Date(first));
  const end = endOfDay(new Date());
  const days = Math.max(1, differenceInCalendarDays(end, start) + 1);
  const granularity = days > 62 ? "month" : "day";

  return {
    period: "all",
    label: `Historial desde ${format(start, "d MMM yyyy", { locale: es })}`,
    granularity,
    start,
    end,
    firstSaleAt: start.toISOString(),
    lastSaleAt: last ? new Date(last).toISOString() : null,
  };
}

function getLast30DaysConfigs() {
  const end = endOfDay(new Date());
  const start = startOfDay(subDays(end, 29));
  const prevEnd = endOfDay(subDays(start, 1));
  const prevStart = startOfDay(subDays(prevEnd, 29));
  return {
    current: {
      period: "recent30",
      label: "Últimos 30 días",
      granularity: "day",
      start,
      end,
    },
    previous: {
      period: "prev30",
      label: "30 días previos",
      granularity: "day",
      start: prevStart,
      end: prevEnd,
    },
  };
}

function rankComparator(sortBy) {
  if (sortBy === "qty") {
    return (a, b) => b[1].qty - a[1].qty || b[1].amt - a[1].amt;
  }
  return (a, b) => b[1].amt - a[1].amt || b[1].qty - a[1].qty;
}

function buildBundle(rows, periodConfig, rankBand, sortBy) {
  const { rankStart, rankEnd } = bandToRange(rankBand);
  const sliceStart = rankStart - 1;
  const sliceEnd = rankEnd;

  const totals = new Map();
  for (const row of rows) {
    const pid = row.productId;
    if (pid == null) continue;
    if (!totals.has(pid)) totals.set(pid, { qty: 0, amt: 0 });
    const t = totals.get(pid);
    t.qty += Number(row.quantity || 0);
    t.amt += Number(row.amount || 0);
  }

  const ranked = [...totals.entries()].sort(rankComparator(sortBy));
  const totalRanked = ranked.length;
  const bandSlice = ranked.slice(sliceStart, sliceEnd);
  const topIds = bandSlice.map(([id]) => id);
  const topIdSet = new Set(topIds);

  const actualRankStart = bandSlice.length ? rankStart : null;
  const actualRankEnd = bandSlice.length ? rankStart + bandSlice.length - 1 : null;

  const buckets = getBuckets(periodConfig);
  const dataset = [];
  const datasetAmount = [];

  for (const bucket of buckets) {
    const qtyPoint = { date: bucket.key };
    const amtPoint = { date: bucket.key };
    let bucketTotal = 0;

    for (const row of rows) {
      const rowBucketKey = bucketKeyForRow(row.date, periodConfig.granularity);
      if (!rowBucketKey || rowBucketKey !== bucket.key) continue;
      const pid = row.productId;
      if (!topIdSet.has(pid)) continue;
      const qty = Number(row.quantity || 0);
      const amt = Number(row.amount || 0);
      bucketTotal += amt + qty;
      const k = String(pid);
      qtyPoint[k] = roundQty((qtyPoint[k] || 0) + qty);
      amtPoint[k] = roundAmt((amtPoint[k] || 0) + amt);
    }

    if (bucketTotal <= 0) continue;
    dataset.push(qtyPoint);
    datasetAmount.push(amtPoint);
  }

  return {
    period: periodConfig.period,
    periodLabel: periodConfig.label,
    granularity: periodConfig.granularity,
    sortBy,
    rankBand,
    rankStart: actualRankStart,
    rankEnd: bandSlice.length ? actualRankEnd : rankStart - 1,
    rankBandSize: RANK_BAND_SIZE,
    totalRanked,
    products: [],
    dataset,
    datasetAmount,
    _topIds: topIds,
    _totals: totals,
  };
}

async function finalizeBundle(partial) {
  const nameMap = await loadProductNames(partial._topIds);
  const products = partial._topIds.map((id, index) => {
    const t = partial._totals?.get(id);
    const meta = nameMap[id];
    return {
      id,
      name: meta?.name || `Producto #${id}`,
      rank: partial.rankStart + index,
      totalQty: roundQty(t?.qty ?? 0),
      totalAmt: roundAmt(t?.amt ?? 0),
    };
  });
  const { _topIds, _totals, ...rest } = partial;
  return { ...rest, products };
}

async function buildSalesBundle(periodConfig, rankBand, sortBy) {
  const rows = await loadSalesRows(periodConfig);
  const partial = buildBundle(rows, periodConfig, rankBand, sortBy);
  return finalizeBundle(partial);
}

function buildProductDetail(rows, periodConfig, productId, productMeta) {
  const granularity = periodConfig.granularity;
  const byBucket = new Map();
  const byDay = new Map(); // yyyy-MM-dd → { amount, qty, payments }
  const byWeekday = new Map(); // 0..6

  for (const wd of WEEKDAY_ORDER) {
    byWeekday.set(wd, { weekday: wd, label: WEEKDAY_LABELS[wd], amount: 0, qty: 0, payments: 0, days: new Set() });
  }

  let totalAmt = 0;
  let totalQty = 0;
  let paymentCount = 0;

  for (const row of rows) {
    if (Number(row.productId) !== Number(productId)) continue;
    const amount = Number(row.amount || 0);
    const qty = Number(row.quantity || 0);

    const key = bucketKeyForRow(row.date, granularity);
    if (key) {
      if (!byBucket.has(key)) byBucket.set(key, { key, amount: 0, qty: 0, payments: 0 });
      const b = byBucket.get(key);
      b.amount += amount;
      b.qty += qty;
      b.payments += 1;
    }

    const dayKey = toFinanceDayKey(row.date);
    if (dayKey) {
      if (!byDay.has(dayKey)) byDay.set(dayKey, { key: dayKey, amount: 0, qty: 0, payments: 0 });
      const d = byDay.get(dayKey);
      d.amount += amount;
      d.qty += qty;
      d.payments += 1;

      const parsed = parseISO(dayKey);
      if (isValid(parsed)) {
        const wd = getDay(parsed);
        const slot = byWeekday.get(wd);
        if (slot) {
          slot.amount += amount;
          slot.qty += qty;
          slot.payments += 1;
          slot.days.add(dayKey);
        }
      }
    }

    totalAmt += amount;
    totalQty += qty;
    paymentCount += 1;
  }

  const points = [...byBucket.values()]
    .map((b) => ({
      key: b.key,
      label: formatBucketLabel(b.key, granularity),
      amount: roundAmt(b.amount),
      qty: roundQty(b.qty),
      payments: b.payments,
    }))
    .sort((a, b) => String(a.key).localeCompare(String(b.key)));

  const peakByAmount = points.length
    ? [...points].sort((a, b) => b.amount - a.amount || b.qty - a.qty)[0]
    : null;
  const peakByQty = points.length
    ? [...points].sort((a, b) => b.qty - a.qty || b.amount - a.amount)[0]
    : null;
  const lowByAmount = points.length
    ? [...points].filter((p) => p.amount > 0).sort((a, b) => a.amount - b.amount || a.qty - b.qty)[0]
    : null;

  const activePoints = points.filter((p) => p.amount > 0 || p.qty > 0);
  const avgAmt = activePoints.length ? roundAmt(totalAmt / activePoints.length) : 0;
  const avgQty = activePoints.length ? roundQty(totalQty / activePoints.length) : 0;

  const calendarDays = Math.max(
    1,
    differenceInCalendarDays(periodConfig.end, periodConfig.start) + 1,
  );
  const activeDays = byDay.size;
  const avgAmountPerCalendarDay = roundAmt(totalAmt / calendarDays);
  const avgQtyPerCalendarDay = roundQty(totalQty / calendarDays);
  const avgAmountPerActiveDay = activeDays ? roundAmt(totalAmt / activeDays) : 0;
  const avgQtyPerActiveDay = activeDays ? roundQty(totalQty / activeDays) : 0;

  const weekdayStats = WEEKDAY_ORDER.map((wd) => {
    const slot = byWeekday.get(wd);
    const daysWithSales = slot?.days?.size || 0;
    return {
      weekday: wd,
      label: WEEKDAY_LABELS[wd],
      amount: roundAmt(slot?.amount || 0),
      qty: roundQty(slot?.qty || 0),
      payments: slot?.payments || 0,
      daysWithSales,
      avgAmountPerOccurrence: daysWithSales
        ? roundAmt((slot?.amount || 0) / daysWithSales)
        : 0,
    };
  });

  const peakWeekdayByAmount = [...weekdayStats]
    .filter((w) => w.amount > 0)
    .sort((a, b) => b.amount - a.amount || b.qty - a.qty)[0] || null;
  const peakWeekdayByQty = [...weekdayStats]
    .filter((w) => w.qty > 0)
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount)[0] || null;

  const topDays = [...points]
    .sort((a, b) => b.amount - a.amount || b.qty - a.qty)
    .slice(0, 5);

  // En modo año también listamos los mejores días civiles (no solo meses)
  const topCalendarDays = [...byDay.values()]
    .map((d) => ({
      key: d.key,
      label: formatBucketLabel(d.key, "day"),
      amount: roundAmt(d.amount),
      qty: roundQty(d.qty),
      payments: d.payments,
    }))
    .sort((a, b) => b.amount - a.amount || b.qty - a.qty)
    .slice(0, 5);

  const stock = Number(productMeta?.stock ?? 0);
  const minStock = Number(productMeta?.minStock ?? 0);
  const unitCost = Number(productMeta?.supplierPrice ?? 0);
  const unitPrice = Number(productMeta?.price ?? 0);
  const estimatedCost = roundAmt(unitCost * totalQty);
  const estimatedMargin = roundAmt(totalAmt - estimatedCost);
  const marginPct = totalAmt > 0 ? roundAmt((estimatedMargin / totalAmt) * 100) : 0;
  const daysOfCover =
    avgQtyPerCalendarDay > 0 ? roundQty(stock / avgQtyPerCalendarDay) : null;
  const pctDaysWithSales = roundAmt((activeDays / calendarDays) * 100);

  return {
    product: {
      id: Number(productId),
      name: productMeta?.name || `Producto #${productId}`,
      barcode: productMeta?.barcode || null,
      sku: productMeta?.sku || null,
      price: unitPrice,
      supplierPrice: unitCost,
      stock,
      minStock,
    },
    period: periodConfig.period,
    periodLabel: periodConfig.label,
    granularity,
    totals: {
      amount: roundAmt(totalAmt),
      qty: roundQty(totalQty),
      payments: paymentCount,
      activeBuckets: activePoints.length,
      avgAmountPerBucket: avgAmt,
      avgQtyPerBucket: avgQty,
      calendarDays,
      activeDays,
      avgAmountPerCalendarDay,
      avgQtyPerCalendarDay,
      avgAmountPerActiveDay,
      avgQtyPerActiveDay,
      pctDaysWithSales,
    },
    velocity: {
      qtyPerDay: avgQtyPerCalendarDay,
      amountPerDay: avgAmountPerCalendarDay,
      qtyPerActiveDay: avgQtyPerActiveDay,
      pctDaysWithSales,
      stock,
      minStock,
      daysOfCover,
      belowMinStock: minStock > 0 ? stock < minStock : false,
      label: sellSpeedLabel({
        daysOfCover,
        pctDaysWithSales,
        qtyPerDay: avgQtyPerCalendarDay,
      }),
    },
    margin: {
      unitCost,
      unitPrice,
      estimatedCost,
      estimatedRevenue: roundAmt(totalAmt),
      estimatedMargin,
      marginPct,
      note:
        unitCost > 0
          ? "Margen estimado = ingresos − (precio proveedor × cantidad)."
          : "Sin precio proveedor: el margen no se puede estimar bien.",
    },
    peakByAmount,
    peakByQty,
    lowByAmount,
    peakWeekdayByAmount,
    peakWeekdayByQty,
    weekdayStats,
    topDays,
    topCalendarDays,
    series: points,
  };
}

export const getProductSeriesCharts = async (req, res) => {
  try {
    const period = VALID_PERIODS.has(req.query.period) ? req.query.period : "month";
    const rankBand = parseRankBand(req.query.band);
    const sortBy = parseSortBy(req.query.sortBy);
    const periodConfig = getPeriodConfig(period);
    const range = bandToRange(rankBand);

    const sales = await buildSalesBundle(periodConfig, rankBand, sortBy);

    const totalRanked = sales.totalRanked ?? 0;
    const totalBands = Math.max(1, Math.ceil(totalRanked / RANK_BAND_SIZE));

    res.json({
      period,
      band: rankBand,
      sortBy,
      rankStart: range.rankStart,
      rankEnd: range.rankEnd,
      rankBandSize: RANK_BAND_SIZE,
      totalRanked,
      totalBands,
      periodLabel: periodConfig.label,
      granularity: periodConfig.granularity,
      sales,
    });
  } catch (error) {
    console.error("getProductSeriesCharts:", error);
    res.status(500).json({ message: "Error al obtener series de productos" });
  }
};

/** GET /finance/product-series/detail?productId=
 * Historial completo del producto (desde la 1ª venta), independiente del filtro semana/mes/año del gráfico.
 */
export const getProductSeriesDetail = async (req, res) => {
  try {
    const productId = Number(req.query.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.status(400).json({ message: "productId inválido" });
    }

    const lifetimeConfig = await getLifetimePeriodConfig(productId);
    const windows = getLast30DaysConfigs();
    const [rows, recentRows, prevRows, nameMap] = await Promise.all([
      loadSalesRowsForProduct(productId, lifetimeConfig),
      loadSalesRowsForProduct(productId, windows.current),
      loadSalesRowsForProduct(productId, windows.previous),
      loadProductNames([productId]),
    ]);

    const detail = buildProductDetail(rows, lifetimeConfig, productId, nameMap[productId]);
    const recentSummary = summarizeProductRows(recentRows, productId);
    const prevSummary = summarizeProductRows(prevRows, productId);

    const comparison = {
      previousLabel: windows.previous.label,
      currentLabel: windows.current.label,
      current: recentSummary,
      previous: prevSummary,
      amountChangePct: pctChange(recentSummary.amount, prevSummary.amount),
      qtyChangePct: pctChange(recentSummary.qty, prevSummary.qty),
      activeDaysChangePct: pctChange(recentSummary.activeDays, prevSummary.activeDays),
    };

    return res.json({
      ...detail,
      firstSaleAt: lifetimeConfig.firstSaleAt,
      lastSaleAt: lifetimeConfig.lastSaleAt,
      comparison,
      message: detail.totals.payments
        ? undefined
        : "Sin ingresos registrados para este producto",
    });
  } catch (error) {
    console.error("getProductSeriesDetail:", error);
    return res.status(500).json({ message: "Error al obtener detalle del producto" });
  }
};
