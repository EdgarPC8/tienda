import { Income, Payment } from "../models/Finance.js";
import { toAppDateTime, toAppDayKey, nowApp } from "./appDateTime.js";

/** Fecha contable de ingreso por ítem de pedido cliente. */
export function resolveCustomerItemIncomeDate({ explicitDate, orderItem, order } = {}) {
  if (explicitDate) return toAppDateTime(explicitDate);
  if (orderItem?.paidAt) return toAppDateTime(orderItem.paidAt);
  if (order?.date) return toAppDateTime(order.date);
  return nowApp();
}

function uniqueDayCount(values) {
  const keys = values.map((v) => toAppDayKey(v)).filter(Boolean);
  return new Set(keys).size;
}

/** Fecha contable de abono a grupo de cobranzas. */
export function resolveGroupPaymentDate({ explicitDate, orderItems = [], orders = [] } = {}) {
  if (explicitDate) return toAppDateTime(explicitDate);

  const itemDates = orderItems
    .map((it) => it?.paidAt || orders.find((o) => Number(o.id) === Number(it.orderId))?.date)
    .filter(Boolean);

  if (itemDates.length && uniqueDayCount(itemDates) === 1) {
    return toAppDateTime(itemDates[0]);
  }

  const orderDates = orders.map((o) => o?.date).filter(Boolean);
  if (orderDates.length && uniqueDayCount(orderDates) === 1) {
    return toAppDateTime(orderDates[0]);
  }

  if (itemDates.length) {
    const sorted = [...itemDates].sort((a, b) => new Date(a) - new Date(b));
    return toAppDateTime(sorted[0]);
  }

  return nowApp();
}

export async function syncOrderItemIncomeDate(orderItemId, payDate, transaction) {
  const normalized = toAppDateTime(payDate);
  if (!normalized) return;

  const income = await Income.findOne({
    where: { referenceType: "order_item", referenceId: orderItemId },
    transaction,
  });
  if (!income) return;

  income.date = normalized;
  await income.save({ transaction });
}

export async function syncGroupPaymentFinanceDates(paymentId, payDate, transaction) {
  const normalized = toAppDateTime(payDate);
  if (!normalized) return;

  const payment = await Payment.findByPk(paymentId, { transaction });
  if (payment) {
    payment.date = normalized;
    await payment.save({ transaction });
  }

  const income = await Income.findOne({
    where: { referenceType: "group_payment", referenceId: paymentId },
    transaction,
  });
  if (income) {
    income.date = normalized;
    await income.save({ transaction });
  }
}

/** Sincroniza todos los pagos/ingresos de un grupo a la fecha objetivo. */
export async function syncGroupFinanceDates(groupId, payDate, transaction) {
  const normalized = toAppDateTime(payDate);
  if (!normalized || !groupId) return;

  const payments = await Payment.findAll({
    where: { groupId, status: "completed" },
    transaction,
  });

  for (const payment of payments) {
    await syncGroupPaymentFinanceDates(payment.id, normalized, transaction);
  }
}
