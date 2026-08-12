/**
 * Seed / corrección: ítems SIN pagar y SIN marcar entregados
 * (ya entregados en la práctica, falta solo la marca).
 *
 * Criterio: paidAt IS NULL AND deliveredAt IS NULL
 * Acción:   deliveredAt = Order.date
 *
 * NO crea InventoryMovement
 * NO ajusta stock / StoreStock
 * NO setea deliveredStoreId
 * NO marca paidAt (siguen sin pagar)
 *
 * Uso:
 *   node scripts/seed-mark-unpaid-delivered.mjs
 *   node scripts/seed-mark-unpaid-delivered.mjs --customer=32
 *   node scripts/seed-mark-unpaid-delivered.mjs --apply
 *   node scripts/seed-mark-unpaid-delivered.mjs --customer=32 --apply
 */
import "dotenv/config";
import { Op } from "sequelize";
import { sequelize } from "../src/database/connection.js";
import { Order, OrderItem, Customer } from "../src/models/Orders.js";

const APPLY = process.argv.includes("--apply");
const customerArg = process.argv.find((a) => a.startsWith("--customer="));
const CUSTOMER_ID = customerArg ? Number(customerArg.split("=")[1]) : null;

function billableQty(item) {
  const sold = Number(item.soldQty || 0);
  return sold > 0 ? sold : Number(item.quantity || 0);
}

function money(n) {
  return Number(Number(n || 0).toFixed(2));
}

async function main() {
  await sequelize.authenticate();

  const orderWhere = {};
  if (Number.isFinite(CUSTOMER_ID) && CUSTOMER_ID > 0) {
    orderWhere.customerId = CUSTOMER_ID;
  }

  const items = await OrderItem.findAll({
    where: {
      paidAt: null,
      deliveredAt: null,
    },
    include: [
      {
        model: Order,
        as: "ERP_order",
        required: true,
        where: Object.keys(orderWhere).length ? orderWhere : undefined,
        attributes: ["id", "date", "status", "notes", "customerId"],
        include: [{ model: Customer, as: "ERP_customer", attributes: ["id", "name"] }],
      },
    ],
    order: [["id", "ASC"]],
  });

  console.log("=== Seed: sin pagar + sin entregar → deliveredAt = order.date ===");
  console.log(`Modo: ${APPLY ? "APPLY (escribe BD)" : "DRY-RUN (no escribe)"}`);
  if (CUSTOMER_ID) console.log(`Filtro cliente: ${CUSTOMER_ID}`);
  console.log(`Ítems candidatos: ${items.length}\n`);

  if (!items.length) {
    console.log("Nada que corregir.");
    await sequelize.close();
    return;
  }

  let amount = 0;
  const byCustomer = new Map();
  const byOrder = new Map();

  for (const item of items) {
    const order = item.ERP_order;
    const qty = billableQty(item);
    const line = money(qty * Number(item.price || 0));
    amount += line;
    const customerName = order?.ERP_customer?.name || `cliente#${order?.customerId}`;
    const customerId = order?.customerId;

    console.log(
      `#${item.id} pedido ${order?.id} | ${customerName} | prod ${item.productId} | ` +
        `qty ${qty} × $${item.price} = $${line} | ` +
        `order.date=${order?.date?.toISOString?.() || order?.date} | status=${order?.status}`
    );

    if (!byCustomer.has(customerId)) {
      byCustomer.set(customerId, { name: customerName, items: 0, orders: new Set(), amount: 0 });
    }
    const c = byCustomer.get(customerId);
    c.items += 1;
    c.orders.add(order?.id);
    c.amount = money(c.amount + line);

    if (!byOrder.has(order.id)) byOrder.set(order.id, []);
    byOrder.get(order.id).push(item);
  }

  console.log("\nPor cliente:");
  for (const [id, c] of [...byCustomer.entries()].sort((a, b) => b[1].items - a[1].items)) {
    console.log(
      `  #${id} ${c.name}: ${c.items} ítem(s), ${c.orders.size} pedido(s), $${c.amount}`
    );
  }

  console.log(`\nPedidos afectados: ${byOrder.size}`);
  console.log(`Monto aprox. líneas: $${money(amount)}`);

  if (!APPLY) {
    console.log("\nDry-run OK. Para aplicar:");
    console.log("  node scripts/seed-mark-unpaid-delivered.mjs --apply");
    if (!CUSTOMER_ID) {
      console.log("  node scripts/seed-mark-unpaid-delivered.mjs --customer=32 --apply   # solo Liwington");
    }
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

      const allItems = await OrderItem.findAll({
        where: { orderId },
        attributes: ["id", "deliveredAt", "paidAt"],
        transaction: t,
      });
      const allDelivered = allItems.every((i) => !!i.deliveredAt);
      const allPaid = allItems.every((i) => !!i.paidAt);
      if (allDelivered && !allPaid && order.status !== "entregado" && order.status !== "pagado") {
        await order.update({ status: "entregado" }, { transaction: t, fields: ["status"] });
        ordersStatusTouched += 1;
      }
    }

    return { updatedItems, ordersStatusTouched };
  });

  console.log("\nAplicado:");
  console.log(`  Ítems con deliveredAt = order.date: ${result.updatedItems}`);
  console.log(`  Pedidos status → entregado: ${result.ordersStatusTouched}`);
  console.log("  paidAt / movimientos / stock: sin cambios (intencional)");

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
