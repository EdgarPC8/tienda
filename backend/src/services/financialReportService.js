import { Op, fn, col, literal } from "sequelize";
import {
  format,
  startOfMonth,
  endOfMonth,
  parseISO,
  isValid,
} from "date-fns";
import { es } from "date-fns/locale";
import {
  Order,
  OrderItem,
  Customer,
  SupplierOrder,
  SupplierOrderItem,
} from "../models/Orders.js";
import {
  InventoryProduct,
  InventoryCategory,
  Store,
} from "../models/Inventory.js";
import { StoreStock } from "../models/StoreStock.js";
import {
  ItemGroup,
  ItemGroupItem,
  Payment,
  Income,
  Expense,
  FinancialObligation,
  ObligationPayment,
  SupplierOrderPayment,
} from "../models/Finance.js";
import { buildFinanceDateColumnWhere } from "../utils/financeDateUtils.js";
import { storeHoldsInventory } from "./storeStockService.js";
import { CashShift } from "../models/CashShift.js";
import { CashShiftMovement } from "../models/CashShiftMovement.js";

export function parseStoreIdsList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((id) => Number(id)).filter(Boolean);
  return String(value)
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean);
}

export function resolveOrderItemStoreId(item) {
  const delivered =
    item?.deliveredStoreId != null ? Number(item.deliveredStoreId) : null;
  const shiftStore =
    item?.ERP_order?.shift?.storeId != null
      ? Number(item.ERP_order.shift.storeId)
      : item?.ERP_order?.shift?.store?.id != null
        ? Number(item.ERP_order.shift.store.id)
        : null;
  return delivered || shiftStore || null;
}

export function itemMatchesStoreIds(item, storeIds) {
  if (!storeIds?.length) return true;
  const storeId = resolveOrderItemStoreId(item);
  return storeId != null && storeIds.includes(storeId);
}

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Number(toNum(n).toFixed(2));

const billableLineTotal = (it) => {
  const qty = toNum(it.quantity);
  const billable = Math.max(0, qty - toNum(it.damagedQty) - toNum(it.giftQty));
  return round2(billable * toNum(it.price));
};

function productUnitValue(product) {
  if (!product) return 0;
  const cost = toNum(product.supplierPrice);
  const price = toNum(product.price);
  return cost > 0 ? cost : price;
}

/**
 * Por cobrar de pedidos cuya fecha cae en el rango (o todo si no hay fechas).
 * storeIds: si se indica, solo ítems ligados a esos locales (entrega o turno caja).
 */
export async function computePeriodReceivables({ startDate, endDate, storeIds } = {}) {
  const filterStoreIds = parseStoreIdsList(storeIds);
  const orderDateWhere = buildFinanceDateColumnWhere(startDate, endDate);
  const orderRows = await Order.findAll({
    where: orderDateWhere || {},
    attributes: ["id"],
    raw: true,
  });
  const orderIds = orderRows.map((o) => Number(o.id)).filter(Boolean);
  if (orderDateWhere && !orderIds.length) {
    return {
      total: 0,
      soldTotal: 0,
      collectedTotal: 0,
      byCustomer: [],
    };
  }

  const orderIdFilter = orderIds.length ? { orderId: { [Op.in]: orderIds } } : {};

  const [groupLinks, openGroups, completedPayments, allItems] = await Promise.all([
    ItemGroupItem.findAll({ attributes: ["groupId", "orderItemId"], raw: true }),
    ItemGroup.findAll({ where: { status: "open" }, attributes: ["id"], raw: true }),
    Payment.findAll({
      where: { status: "completed" },
      attributes: ["groupId", "amount"],
      raw: true,
    }),
    OrderItem.findAll({
      where: orderIdFilter,
      attributes: [
        "id",
        "orderId",
        "price",
        "quantity",
        "damagedQty",
        "giftQty",
        "paidAt",
        "deliveredStoreId",
      ],
      include: [
        {
          model: Order,
          as: "ERP_order",
          attributes: ["id", "customerId", "shiftId"],
          include: [
            { model: Customer, as: "ERP_customer", attributes: ["id", "name"] },
            {
              model: CashShift,
              as: "shift",
              attributes: ["id", "storeId"],
              required: false,
            },
          ],
        },
      ],
    }),
  ]);

  const allItemsFiltered = filterStoreIds.length
    ? allItems.filter((it) => itemMatchesStoreIds(it, filterStoreIds))
    : allItems;

  const groupedItemIds = new Set(groupLinks.map((x) => x.orderItemId));
  const openGroupIdSet = new Set(openGroups.map((g) => g.id));
  const itemsByOpenGroupId = new Map();
  for (const link of groupLinks) {
    if (!openGroupIdSet.has(link.groupId)) continue;
    if (!itemsByOpenGroupId.has(link.groupId)) itemsByOpenGroupId.set(link.groupId, []);
    itemsByOpenGroupId.get(link.groupId).push(link.orderItemId);
  }

  const paidByGroupId = new Map();
  for (const p of completedPayments) {
    const gid = p.groupId;
    paidByGroupId.set(gid, round2((paidByGroupId.get(gid) || 0) + toNum(p.amount)));
  }

  const itemById = new Map(allItemsFiltered.map((it) => [it.id, it]));
  const customerDebt = new Map();

  const addDebt = (customerId, customerName, amount) => {
    if (amount <= 0) return;
    const key = customerId || customerName || "sin-cliente";
    const prev = customerDebt.get(key) || {
      customerId: customerId || null,
      customerName: customerName || "Sin cliente",
      amount: 0,
    };
    prev.amount = round2(prev.amount + amount);
    customerDebt.set(key, prev);
  };

  let groupRemainingTotal = 0;
  for (const [groupId, itemIds] of itemsByOpenGroupId) {
    const periodItemIds = itemIds.filter((id) => itemById.has(id));
    if (!periodItemIds.length) continue;
    const totalCalc = periodItemIds.reduce(
      (sum, id) => sum + billableLineTotal(itemById.get(id)),
      0,
    );
    const paid = paidByGroupId.get(groupId) || 0;
    const remaining = Math.max(0, round2(totalCalc - paid));
    groupRemainingTotal += remaining;
    if (remaining > 0) {
      const first = itemById.get(periodItemIds[0]);
      const cust = first?.ERP_order?.ERP_customer;
      addDebt(cust?.id, cust?.name, remaining);
    }
  }

  let soldTotal = 0;
  let collectedTotal = 0;
  let ungroupedRemaining = 0;

  for (const it of allItemsFiltered) {
    const line = billableLineTotal(it);
    soldTotal += line;
    if (it.paidAt) {
      collectedTotal += line;
      continue;
    }
    if (groupedItemIds.has(it.id)) continue;
    ungroupedRemaining += line;
    const cust = it.ERP_order?.ERP_customer;
    addDebt(cust?.id, cust?.name, line);
  }

  soldTotal = round2(soldTotal);
  collectedTotal = round2(collectedTotal);
  const total = round2(groupRemainingTotal + ungroupedRemaining);

  const byCustomer = [...customerDebt.values()]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15);

  return {
    total,
    soldTotal,
    collectedTotal,
    byCustomer,
  };
}

/**
 * Valor del inventario en locales propios (sucursal operativa).
 */
export async function computeStoreInventorySnapshot({
  locationKinds = ["propia"],
  storeIds,
} = {}) {
  const explicitStoreIds = parseStoreIdsList(storeIds);
  let stores;

  if (explicitStoreIds.length) {
    stores = await Store.findAll({
      where: { id: { [Op.in]: explicitStoreIds }, isActive: true },
      attributes: ["id", "name", "locationKind"],
      order: [["id", "ASC"]],
    });
  } else {
    stores = await Store.findAll({
      where: { isActive: true, locationKind: { [Op.in]: locationKinds } },
      attributes: ["id", "name", "locationKind"],
      order: [["id", "ASC"]],
    });
  }

  const targetStoreIds = stores
    .filter((s) => storeHoldsInventory(s.locationKind))
    .map((s) => s.id);

  if (!targetStoreIds.length) {
    return {
      stores: [],
      productCount: 0,
      totalUnits: 0,
      valueAtCost: 0,
      valueAtSale: 0,
      topProducts: [],
    };
  }

  const rows = await StoreStock.findAll({
    where: {
      storeId: { [Op.in]: targetStoreIds },
      quantity: { [Op.gt]: 0 },
    },
    include: [
      {
        model: InventoryProduct,
        as: "product",
        attributes: ["id", "name", "price", "supplierPrice"],
        include: [
          {
            model: InventoryCategory,
            attributes: ["name"],
            required: false,
          },
        ],
      },
      { model: Store, as: "store", attributes: ["id", "name"] },
    ],
  });

  let productCount = 0;
  let totalUnits = 0;
  let valueAtCost = 0;
  let valueAtSale = 0;
  const productMap = new Map();

  for (const row of rows) {
    const qty = toNum(row.quantity);
    if (qty <= 0) continue;
    productCount += 1;
    totalUnits += qty;
    const unitCost = productUnitValue(row.product);
    const unitSale = toNum(row.product?.price) || unitCost;
    valueAtCost += qty * unitCost;
    valueAtSale += qty * unitSale;

    const pid = row.productId;
    const prev = productMap.get(pid) || {
      productId: pid,
      name: row.product?.name || `Producto #${pid}`,
      category: row.product?.ERP_inventory_categories?.name || null,
      storeName: row.store?.name || null,
      quantity: 0,
      valueAtCost: 0,
      valueAtSale: 0,
    };
    prev.quantity = round2(prev.quantity + qty);
    prev.valueAtCost = round2(prev.valueAtCost + qty * unitCost);
    prev.valueAtSale = round2(prev.valueAtSale + qty * unitSale);
    productMap.set(pid, prev);
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => b.valueAtCost - a.valueAtCost)
    .slice(0, 20);

  return {
    stores: stores.map((s) => ({ id: s.id, name: s.name, locationKind: s.locationKind })),
    productCount,
    totalUnits: round2(totalUnits),
    valueAtCost: round2(valueAtCost),
    valueAtSale: round2(valueAtSale),
    topProducts,
  };
}

const PURCHASE_CATEGORIES = new Set(["Compras", "Compra de insumos"]);
const BUSINESS_DEBT_RE =
  /compra\s*(del)?\s*negocio|due[ñn]o\s*anterior|fondo\s*de\s*comercio|compra\s*negocio/i;
const PERSONAL_WITHDRAW_RE =
  /retiro|personal|due[ñn]o|propietario|owner\s*draw/i;

function isPurchaseCategory(category) {
  return PURCHASE_CATEGORIES.has(String(category || "").trim());
}

function isPersonalWithdrawExpense(row) {
  const cat = String(row?.category || "");
  const concept = String(row?.concept || "");
  if (/^retiro$/i.test(cat.trim())) return true;
  return PERSONAL_WITHDRAW_RE.test(`${cat} ${concept}`);
}

function isBusinessPurchaseDebt(obligation) {
  const text = `${obligation?.concept || ""} ${obligation?.partyName || ""}`;
  return BUSINESS_DEBT_RE.test(text);
}

/**
 * Indicadores del reporte financiero (tabla: indicador / resultado / qué me dice).
 * Periodo por defecto: mes actual.
 */
export async function computeBusinessIndicatorsReport({
  startDate,
  endDate,
} = {}) {
  const now = new Date();
  const hasPeriod = Boolean(startDate || endDate);
  const monthStart = hasPeriod
    ? String(startDate || endDate).slice(0, 10)
    : format(startOfMonth(now), "yyyy-MM-dd");
  const monthEnd = hasPeriod
    ? String(endDate || startDate).slice(0, 10)
    : format(endOfMonth(now), "yyyy-MM-dd");
  const periodWhere = buildFinanceDateColumnWhere(monthStart, monthEnd) || {};
  const orderDateWhere = buildFinanceDateColumnWhere(monthStart, monthEnd) || {};

  const periodLabel = (() => {
    const a = parseISO(monthStart);
    const b = parseISO(monthEnd);
    if (!isValid(a) || !isValid(b)) return `${monthStart} → ${monthEnd}`;
    if (!hasPeriod) return format(now, "MMMM yyyy", { locale: es });
    return `${format(a, "d MMM yyyy", { locale: es })} – ${format(b, "d MMM yyyy", { locale: es })}`;
  })();

  const billable = (it) => {
    const qty = toNum(it.quantity);
    return Math.max(0, qty - toNum(it.damagedQty) - toNum(it.giftQty));
  };

  const [
    orderRows,
    expenses,
    incomes,
    inventory,
    openPayableRows,
    obligationPayments,
    openShifts,
    supplierOrders,
    supplierPayments,
    transferInPayments,
    transferOutSupplier,
    transferOutObligations,
    shiftIdsInPeriod,
  ] = await Promise.all([
    Order.findAll({
      where: orderDateWhere,
      attributes: ["id"],
      include: [
        {
          model: OrderItem,
          as: "ERP_order_items",
          attributes: ["price", "quantity", "damagedQty", "giftQty"],
          required: false,
        },
      ],
    }),
    Expense.findAll({
      where: periodWhere,
      attributes: ["id", "amount", "category", "concept"],
      raw: true,
    }),
    Income.findAll({
      where: periodWhere,
      attributes: ["id", "amount", "category", "concept"],
      raw: true,
    }),
    computeStoreInventorySnapshot({ locationKinds: ["propia", "bodega"] }),
    FinancialObligation.findAll({
      where: { status: "open", direction: "payable" },
      attributes: ["id", "concept", "partyName", "originalAmount", "partyType"],
      raw: true,
    }),
    ObligationPayment.findAll({
      where: { status: "completed" },
      attributes: ["obligationId", "amount"],
      raw: true,
    }),
    CashShift.findAll({
      where: { status: "open" },
      attributes: [
        "id",
        "openingCashTotal",
        "salesCashTotal",
        "salesTransferTotal",
        "cashOutTotal",
        "cashInTotal",
        "expectedCashTotal",
      ],
    }),
    SupplierOrder.findAll({
      where: { status: { [Op.ne]: "cancelado" } },
      attributes: ["id", "paidAt", "status"],
      include: [
        {
          model: SupplierOrderItem,
          as: "ERP_supplier_order_items",
          attributes: ["quantity", "unitPrice", "taxRate"],
          required: false,
        },
      ],
    }),
    SupplierOrderPayment.findAll({
      where: { status: "completed" },
      attributes: ["supplierOrderId", "amount"],
      raw: true,
    }),
    Payment.findAll({
      where: { status: "completed", method: "transferencia" },
      attributes: ["amount"],
      raw: true,
    }),
    SupplierOrderPayment.findAll({
      where: { status: "completed", method: "transferencia" },
      attributes: ["amount"],
      raw: true,
    }),
    ObligationPayment.findAll({
      where: { status: "completed", method: "transferencia" },
      attributes: ["amount"],
      raw: true,
    }),
    CashShift.findAll({
      attributes: ["id"],
      where: {
        openedAt: {
          [Op.between]: [`${monthStart} 00:00:00`, `${monthEnd} 23:59:59`],
        },
      },
      raw: true,
    }),
  ]);

  let monthSales = 0;
  for (const order of orderRows) {
    for (const it of order.ERP_order_items || []) {
      monthSales += billable(it) * toNum(it.price);
    }
  }
  monthSales = round2(monthSales);

  let monthPurchases = 0;
  let monthPersonalWithdrawals = 0;
  let monthOperatingExpenses = 0;
  let monthExpenseTotal = 0;
  for (const row of expenses) {
    const amt = toNum(row.amount);
    monthExpenseTotal = round2(monthExpenseTotal + amt);
    if (isPurchaseCategory(row.category)) {
      monthPurchases = round2(monthPurchases + amt);
      continue;
    }
    if (isPersonalWithdrawExpense(row)) {
      monthPersonalWithdrawals = round2(monthPersonalWithdrawals + amt);
      continue;
    }
    monthOperatingExpenses = round2(monthOperatingExpenses + amt);
  }

  const shiftIds = (shiftIdsInPeriod || []).map((s) => s.id).filter(Boolean);
  if (shiftIds.length) {
    const retiroMoves = await CashShiftMovement.findAll({
      where: {
        shiftId: { [Op.in]: shiftIds },
        category: "retiro",
        direction: "out",
      },
      attributes: ["amount", "expenseId"],
      raw: true,
    });
    for (const m of retiroMoves) {
      if (m.expenseId) continue;
      monthPersonalWithdrawals = round2(
        monthPersonalWithdrawals + toNum(m.amount),
      );
    }
  }

  const monthIncomeTotal = round2(
    incomes.reduce((sum, row) => sum + toNum(row.amount), 0),
  );
  const grossMarginPct =
    monthSales > 0
      ? round2(((monthSales - monthPurchases) / monthSales) * 100)
      : 0;

  let cashAvailable = 0;
  let openShiftTransfer = 0;
  for (const shift of openShifts) {
    const opening = toNum(shift.openingCashTotal);
    const salesCash = toNum(shift.salesCashTotal);
    const cashOut = toNum(shift.cashOutTotal);
    const cashIn = toNum(shift.cashInTotal);
    const expected =
      shift.expectedCashTotal != null
        ? toNum(shift.expectedCashTotal)
        : round2(opening + salesCash - cashOut + cashIn);
    cashAvailable = round2(cashAvailable + expected);
    openShiftTransfer = round2(
      openShiftTransfer + toNum(shift.salesTransferTotal),
    );
  }

  // Sobra / falta de caja al cerrar turnos del periodo
  const closedShifts = await CashShift.findAll({
    where: {
      status: "closed",
      cashDifference: { [Op.ne]: null },
      closedAt: {
        [Op.between]: [`${monthStart} 00:00:00`, `${monthEnd} 23:59:59`],
      },
    },
    attributes: ["id", "cashDifference"],
    raw: true,
  });
  let cashSurplus = 0;
  let cashShortage = 0;
  for (const shift of closedShifts) {
    const diff = toNum(shift.cashDifference);
    if (diff > 0.009) cashSurplus = round2(cashSurplus + diff);
    else if (diff < -0.009) cashShortage = round2(cashShortage + Math.abs(diff));
  }

  const transferIn = round2(
    transferInPayments.reduce((s, r) => s + toNum(r.amount), 0),
  );
  const transferOut = round2(
    transferOutSupplier.reduce((s, r) => s + toNum(r.amount), 0) +
      transferOutObligations.reduce((s, r) => s + toNum(r.amount), 0),
  );
  const moneyInBanks = round2(
    Math.max(0, transferIn - transferOut) + openShiftTransfer,
  );
  const totalAvailable = round2(cashAvailable + moneyInBanks);
  const inventoryValue = round2(inventory?.valueAtCost || 0);

  const paidByOrder = new Map();
  for (const p of supplierPayments) {
    const oid = Number(p.supplierOrderId);
    paidByOrder.set(oid, round2((paidByOrder.get(oid) || 0) + toNum(p.amount)));
  }
  let supplierDebt = 0;
  for (const order of supplierOrders) {
    const items = order.ERP_supplier_order_items || [];
    const total = round2(
      items.reduce((sum, it) => {
        const line =
          toNum(it.quantity) *
          toNum(it.unitPrice) *
          (1 + toNum(it.taxRate) / 100);
        return sum + line;
      }, 0),
    );
    let paid = toNum(paidByOrder.get(Number(order.id)) || 0);
    if (order.paidAt && paid <= 0 && total > 0) paid = total;
    const remaining =
      order.paidAt && paid >= total - 0.009
        ? 0
        : round2(Math.max(0, total - paid));
    supplierDebt = round2(supplierDebt + remaining);
  }

  const paidByObligation = new Map();
  for (const p of obligationPayments) {
    const oid = Number(p.obligationId);
    paidByObligation.set(
      oid,
      round2((paidByObligation.get(oid) || 0) + toNum(p.amount)),
    );
  }

  let businessPurchaseDebt = 0;
  let otherLoansDebt = 0;
  for (const row of openPayableRows) {
    const remaining = round2(
      Math.max(
        0,
        toNum(row.originalAmount) - toNum(paidByObligation.get(Number(row.id))),
      ),
    );
    if (remaining <= 0.009) continue;
    if (isBusinessPurchaseDebt(row)) {
      businessPurchaseDebt = round2(businessPurchaseDebt + remaining);
    } else {
      otherLoansDebt = round2(otherLoansDebt + remaining);
    }
  }

  const netCashFlow = round2(monthIncomeTotal - monthExpenseTotal);

  // Reserva mínima: 25% de egresos del mes (o egresos operativos si hay)
  const minReserve = round2(
    monthOperatingExpenses > 0
      ? monthOperatingExpenses * 0.25
      : monthExpenseTotal * 0.25,
  );

  const weeklyBurn =
    monthExpenseTotal > 0 ? round2(monthExpenseTotal / 4.345) : 0;
  const freeCash = round2(Math.max(0, totalAvailable - minReserve));
  const weeksCovered =
    weeklyBurn > 0 ? round2(freeCash / weeklyBurn) : freeCash > 0 ? null : 0;

  return {
    period: {
      startDate: monthStart,
      endDate: monthEnd,
      label: periodLabel,
      filtered: hasPeriod,
    },
    indicators: {
      monthSales,
      monthPurchases,
      grossMarginPct,
      cashAvailable,
      cashSurplus,
      cashShortage,
      moneyInBanks,
      totalAvailable,
      inventoryValue,
      supplierDebt,
      businessPurchaseDebt,
      otherLoansDebt,
      monthOperatingExpenses,
      monthPersonalWithdrawals,
      netCashFlow,
      minReserve,
      weeksCovered,
    },
    meta: {
      monthIncomeTotal,
      monthExpenseTotal,
      openShifts: openShifts.length,
      closedShiftsWithDiff: closedShifts.length,
      inventoryProductCount: inventory?.productCount || 0,
    },
  };
}
