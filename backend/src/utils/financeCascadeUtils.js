import { Op } from "sequelize";
import {
  Income,
  Expense,
  Payment,
  ItemGroupItem,
  SupplierOrderPayment,
} from "../models/Finance.js";
import { OrderItem } from "../models/Orders.js";
import { getAppSettingsSync } from "../services/appSettingsService.js";

/** Admin (si config lo permite) o Programador pueden anular pagos / borrar con cascada financiera. */
export function canFinanceCascadeCorrection(user) {
  const role = user?.loginRol;
  if (role === "Programador") return true;
  if (role === "Administrador") {
    return getAppSettingsSync().financeAllowAdminCorrections !== false;
  }
  return false;
}

export async function cleanupOrderItemFinance(orderItemId, transaction) {
  await Income.destroy({
    where: { referenceType: "order_item", referenceId: orderItemId },
    transaction,
  });
}

/** Elimina ingresos/abonos de grupo vinculados solo a ítems de este pedido. */
export async function cleanupCustomerOrderFinance(orderId, transaction) {
  const items = await OrderItem.findAll({
    where: { orderId },
    attributes: ["id"],
    transaction,
  });
  const itemIds = items.map((i) => Number(i.id)).filter(Boolean);
  if (!itemIds.length) return;

  await Income.destroy({
    where: { referenceType: "order_item", referenceId: { [Op.in]: itemIds } },
    transaction,
  });

  const groupLinks = await ItemGroupItem.findAll({
    where: { orderItemId: { [Op.in]: itemIds } },
    attributes: ["groupId", "orderItemId"],
    transaction,
  });
  const groupIds = [...new Set(groupLinks.map((l) => Number(l.groupId)).filter(Boolean))];

  for (const groupId of groupIds) {
    const allInGroup = await ItemGroupItem.findAll({
      where: { groupId },
      attributes: ["orderItemId"],
      transaction,
    });
    const onlyThisOrder = allInGroup.every((g) => itemIds.includes(Number(g.orderItemId)));
    if (!onlyThisOrder) continue;

    const payments = await Payment.findAll({
      where: { groupId, status: "completed" },
      transaction,
    });
    for (const payment of payments) {
      await Income.destroy({
        where: { referenceType: "group_payment", referenceId: payment.id },
        transaction,
      });
      await payment.destroy({ transaction });
    }
  }
}

/** Elimina pagos y gastos vinculados a un pedido proveedor. */
export async function cleanupSupplierOrderFinance(supplierOrderId, transaction) {
  const payments = await SupplierOrderPayment.findAll({
    where: { supplierOrderId },
    transaction,
  });

  const expenseIds = new Set();
  for (const payment of payments) {
    if (payment.expenseId) expenseIds.add(Number(payment.expenseId));
    await payment.destroy({ transaction });
  }

  const orClauses = [
    {
      referenceType: { [Op.in]: ["supplier_order_payment", "supplier_order_abono"] },
      referenceId: supplierOrderId,
    },
  ];
  if (expenseIds.size) {
    orClauses.push({ id: { [Op.in]: [...expenseIds] } });
  }

  await Expense.destroy({
    where: { [Op.or]: orClauses },
    transaction,
  });
}
