/**
 * Seed / corrección: ítems pagados sin entregar.
 *
 * Criterio: paidAt IS NOT NULL AND deliveredAt IS NULL
 * Acción:   deliveredAt = Order.date
 *
 * NO crea InventoryMovement
 * NO ajusta stock / StoreStock
 * NO setea deliveredStoreId
 *
 * Uso:
 *   node scripts/seed-mark-paid-delivered.mjs           # dry-run (solo lista)
 *   node scripts/seed-mark-paid-delivered.mjs --apply   # aplica cambios
 */
import "dotenv/config";
import { Op } from "sequelize";
import { sequelize } from "../src/database/connection.js";
import { Order, OrderItem, Customer } from "../src/models/Orders.js";

const APPLY = process.argv.includes("--apply");

function billableQty(item) {
  const sold = Number(item.soldQty || 0);
  return sold > 0 ? sold : Number(item.quantity || 0);
}

function money(n) {
  return Number(Number(n || 0).toFixed(2));
}

async function main() {
  await sequelize.authenticate();

  const items = await OrderItem.findAll({
    where: {
      paidAt: { [Op.ne]: null },
      deliveredAt: null,
    },
    include: [
      {
        model: Order,
        as: "ERP_order",
        attributes: ["id", "date", "status", "notes", "customerId"],
        include: [{ model: Customer, as: "ERP_customer", attributes: ["id", "name"] }],
      },
    ],
    order: [["id", "ASC"]],
  });

  console.log("=== Seed: pagados sin entregar → deliveredAt = order.date ===");
  console.log(`Modo: ${APPLY ? "APPLY (escribe BD)" : "DRY-RUN (no escribe)"}`);
  console.log(`Ítems candidatos: ${items.length}\n`);

  if (!items.length) {
    console.log("Nada que corregir.");
    await sequelize.close();
    return;
  }

  let amount = 0;
  const byOrder = new Map();

  for (const item of items) {
    const order = item.ERP_order;
    const qty = billableQty(item);
    const line = money(qty * Number(item.price || 0));
    amount += line;

    const row = {
      itemId: item.id,
      orderId: order?.id,
      customer: order?.ERP_customer?.name || `cliente#${order?.customerId}`,
      orderDate: order?.date,
      paidAt: item.paidAt,
      qty,
      price: Number(item.price || 0),
      line,
      productId: item.productId,
      orderStatus: order?.status,
    };

    console.log(
      `#${row.itemId} pedido ${row.orderId} | ${row.customer} | prod ${row.productId} | ` +
        `qty ${row.qty} × $${row.price} = $${row.line} | ` +
        `order.date=${row.orderDate?.toISOString?.() || row.orderDate} | paidAt=${row.paidAt?.toISOString?.() || row.paidAt}`
    );

    if (!byOrder.has(row.orderId)) byOrder.set(row.orderId, []);
    byOrder.get(row.orderId).push(item);
  }

  console.log(`\nPedidos afectados: ${byOrder.size}`);
  console.log(`Monto aprox. líneas: $${money(amount)}`);

  if (!APPLY) {
    console.log("\nDry-run OK. Para aplicar:");
    console.log("  node scripts/seed-mark-paid-delivered.mjs --apply");
    await sequelize.close();
    return;
  }

  const result = await sequelize.transaction(async (t) => {
    let updatedItems = 0;
    let ordersStatusTouched = 0;

    for (const [orderId, orderItems] of byOrder) {
      const order = orderItems[0].ERP_order;
      const orderDate = order?.date;
      if (!orderDate) {
        console.warn(`Pedido ${orderId}: sin date, se omite.`);
        continue;
      }

      for (const item of orderItems) {
        await item.update(
          { deliveredAt: orderDate },
          { transaction: t, fields: ["deliveredAt"] }
        );
        updatedItems += 1;
      }

      // Misma regla que markItemAsDelivered: si todos tienen deliveredAt y el pedido
      // no está en "pagado", pasar a "entregado". Sin tocar stock ni movimientos.
      const allItems = await OrderItem.findAll({
        where: { orderId },
        attributes: ["id", "deliveredAt", "paidAt"],
        transaction: t,
      });
      const allDelivered = allItems.every((i) => !!i.deliveredAt);
      if (allDelivered && order.status !== "pagado" && order.status !== "entregado") {
        await order.update({ status: "entregado" }, { transaction: t, fields: ["status"] });
        ordersStatusTouched += 1;
      }
    }

    return { updatedItems, ordersStatusTouched };
  });

  console.log("\nAplicado:");
  console.log(`  Ítems con deliveredAt = order.date: ${result.updatedItems}`);
  console.log(`  Pedidos status → entregado: ${result.ordersStatusTouched}`);
  console.log("  Movimientos / stock: 0 (intencional)");

  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
