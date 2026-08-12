/** Utilidades compartidas para ventas del punto de venta (caja). */

export const CAJA_POS_TAG = "[CAJA_POS]";

export const CONSUMIDOR_FINAL_CUSTOMER_NAME = "Consumidor Final";

/** Venta de mostrador sin cliente institucional (no cuenta en pedidos por cliente). */
export function isWalkInPosOrder(order) {
  if (!order) return false;
  if (!String(order.notes || "").includes(CAJA_POS_TAG)) return false;
  const docType = order.documentType || "consumidor_final";
  return docType === "consumidor_final";
}

/** Condición Sequelize para excluir ventas POS de consumidor final. */
export function walkInPosOrderExcludeWhere(Op) {
  return {
    [Op.not]: {
      [Op.and]: [
        { notes: { [Op.like]: `%${CAJA_POS_TAG}%` } },
        {
          [Op.or]: [
            { documentType: "consumidor_final" },
            { documentType: null },
          ],
        },
      ],
    },
  };
}

export function isConsumidorFinalCustomerName(name) {
  const n = String(name || "").toLowerCase();
  return n.includes("consumidor") || n.includes("final");
}

export function findConsumidorFinalCustomer(customers) {
  return customers.find((c) => isConsumidorFinalCustomerName(c.name)) ?? null;
}
