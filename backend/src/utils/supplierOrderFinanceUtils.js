import { Expense, SupplierOrderPayment } from "../models/Finance.js";
import { SupplierOrder } from "../models/Orders.js";
import { toAppDateTime, nowApp } from "./appDateTime.js";

/**
 * Fecha contable para pagos de pedido proveedor.
 * Prioridad: explícita → fecha del pedido → cuota → ahora.
 */
export function resolveSupplierOrderPayDate({ paidAt, order, installmentDueDate } = {}) {
  if (paidAt) return toAppDateTime(paidAt);
  if (order?.date) return toAppDateTime(order.date);
  if (installmentDueDate) return toAppDateTime(installmentDueDate);
  return nowApp();
}

/** Fecha de recepción alineada con la del pedido si no se indica otra. */
export function resolveSupplierOrderReceiveDate({ receivedAt, order } = {}) {
  if (receivedAt) return toAppDateTime(receivedAt);
  if (order?.date) return toAppDateTime(order.date);
  return nowApp();
}

/** Sincroniza pagos y gastos vinculados cuando cambia la fecha de pago del pedido. */
export async function syncSupplierOrderFinanceDates(orderId, payDate, transaction) {
  const normalized = toAppDateTime(payDate);
  if (!normalized) return;

  const payments = await SupplierOrderPayment.findAll({
    where: { supplierOrderId: orderId, status: "completed" },
    transaction,
  });

  const touchedExpenseIds = new Set();

  for (const payment of payments) {
    payment.date = normalized;
    await payment.save({ transaction });
    if (payment.expenseId) {
      touchedExpenseIds.add(payment.expenseId);
      const expense = await Expense.findByPk(payment.expenseId, { transaction });
      if (expense) {
        expense.date = normalized;
        await expense.save({ transaction });
      }
    }
  }

  const order = await SupplierOrder.findByPk(orderId, { transaction });
  if (order?.financeExpenseId && !touchedExpenseIds.has(order.financeExpenseId)) {
    const expense = await Expense.findByPk(order.financeExpenseId, { transaction });
    if (expense) {
      expense.date = normalized;
      await expense.save({ transaction });
    }
  }
}
