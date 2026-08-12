import 'dotenv/config';
import { sequelize } from '../src/database/connection.js';
import { Order, OrderItem, Customer } from '../src/models/Orders.js';
import { Op } from 'sequelize';

const patterns = ['liw', 'liv', 'lig', 'wgt', 'ton'];

function section(title) {
  console.log('\n' + '='.repeat(72));
  console.log(title);
  console.log('='.repeat(72));
}

try {
  section('1) Clientes cuyo nombre coincide con liw|liv|lig|wgt|ton');
  const customers = await Customer.findAll({
    where: {
      [Op.or]: patterns.map((p) => ({ name: { [Op.like]: `%${p}%` } })),
    },
    order: [['id', 'ASC']],
    raw: true,
  });
  const seen = new Set();
  for (const c of customers) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    console.log(`  id=${c.id}  name=${JSON.stringify(c.name)}`);
  }
  console.log(`Total distintos: ${seen.size}`);

  function scoreName(name) {
    const n = (name || '').toLowerCase();
    let s = 0;
    for (const p of patterns) if (n.includes(p)) s += 1;
    if (/liw/.test(n) && /wgt|ton/.test(n)) s += 3;
    if (/liv/.test(n) && /ston|ton/.test(n)) s += 2;
    return s;
  }
  let best = null;
  let bestScore = -1;
  for (const c of customers) {
    const sc = scoreName(c.name);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  if (!best && customers.length) best = customers[0];

  section(`2) Ítems sin entregar (deliveredAt IS NULL) — cliente: id=${best?.id} ${best?.name ?? 'N/A'}`);
  if (best) {
    const items = await OrderItem.findAll({
      where: { deliveredAt: null },
      include: [
        {
          model: Order,
          as: 'ERP_order',
          where: { customerId: best.id },
          required: true,
          attributes: ['id', 'date', 'status', 'customerId'],
        },
      ],
      order: [['id', 'ASC']],
    });
    console.log(`Total ítems: ${items.length}`);
    for (const it of items) {
      const o = it.ERP_order;
      console.log(
        JSON.stringify({
          orderId: o.id,
          orderDate: o.date,
          orderStatus: o.status,
          itemId: it.id,
          qty: it.quantity,
          price: it.price,
          productId: it.productId,
          paidAt: it.paidAt,
          deliveredAt: it.deliveredAt,
          lineAmount: Number(it.quantity) * Number(it.price),
        })
      );
    }
  } else {
    console.log('No hay cliente candidato.');
  }

  section('3) Ítems: deliveredAt IS NULL AND paidAt IS NULL (sin marcar entregados y sin pagar)');

  const [totals] = await sequelize.query(`
    SELECT
      COUNT(*) AS itemCount,
      COUNT(DISTINCT oi.orderId) AS orderCount,
      COALESCE(SUM(oi.quantity * oi.price), 0) AS amount
    FROM ERP_order_items oi
    WHERE oi.deliveredAt IS NULL AND oi.paidAt IS NULL
  `);
  const t = totals[0];
  console.log('Totales:', {
    itemCount: Number(t.itemCount),
    distinctOrders: Number(t.orderCount),
    approxAmount: Number(t.amount),
  });

  const [byCustomer] = await sequelize.query(`
    SELECT
      c.id AS customerId,
      c.name AS name,
      COUNT(*) AS itemCount,
      COUNT(DISTINCT oi.orderId) AS orderCount,
      COALESCE(SUM(oi.quantity * oi.price), 0) AS amount
    FROM ERP_order_items oi
    INNER JOIN ERP_orders o ON o.id = oi.orderId
    INNER JOIN ERP_customers c ON c.id = o.customerId
    WHERE oi.deliveredAt IS NULL AND oi.paidAt IS NULL
    GROUP BY c.id, c.name
    ORDER BY itemCount DESC
    LIMIT 20
  `);
  console.log('\nTop 20 por cantidad de ítems:');
  for (const row of byCustomer) {
    console.log(
      `  customerId=${row.customerId}  name=${JSON.stringify(row.name)}  itemCount=${row.itemCount}  orderCount=${row.orderCount}  amount=${Number(row.amount)}`
    );
  }

  const topCustomerIds = byCustomer.map((r) => r.customerId);
  if (topCustomerIds.length) {
    const placeholders = topCustomerIds.map(() => '?').join(',');
    const [mixed] = await sequelize.query(
      `
      SELECT DISTINCT o.customerId
      FROM ERP_order_items oi
      INNER JOIN ERP_orders o ON o.id = oi.orderId
      WHERE o.customerId IN (${placeholders})
        AND oi.deliveredAt IS NOT NULL
      `,
      { replacements: topCustomerIds }
    );
    console.log(
      `\nDe los top-20 clientes anteriores, cuántos tienen al menos OTRO ítem ya entregado (deliveredAt NOT NULL): ${mixed.length}`
    );
    if (mixed.length) {
      console.log('  customerIds con entrega mixta:', mixed.map((m) => m.customerId).join(', '));
    }
  }

  const [allCustIdsRows] = await sequelize.query(`
    SELECT DISTINCT o.customerId
    FROM ERP_order_items oi
    INNER JOIN ERP_orders o ON o.id = oi.orderId
    WHERE oi.deliveredAt IS NULL AND oi.paidAt IS NULL
  `);
  const allCustIds = allCustIdsRows.map((r) => r.customerId);
  if (allCustIds.length) {
    const ph = allCustIds.map(() => '?').join(',');
    const [mixedAll] = await sequelize.query(
      `
      SELECT DISTINCT o.customerId
      FROM ERP_order_items oi
      INNER JOIN ERP_orders o ON o.id = oi.orderId
      WHERE o.customerId IN (${ph})
        AND oi.deliveredAt IS NOT NULL
      `,
      { replacements: allCustIds }
    );
    console.log(
      `En TODO el conjunto (todos los clientes con ítems sin entregar/sin pagar), clientes con al menos un ítem ya entregado: ${mixedAll.length} de ${allCustIds.length}`
    );
  }

  section('4) Ítems entregados pero sin pagar (paidAt IS NULL, deliveredAt IS NOT NULL) — top 10 clientes');

  const [deliveredUnpaid] = await sequelize.query(`
    SELECT
      c.id AS customerId,
      c.name AS name,
      COUNT(*) AS itemCount,
      COALESCE(SUM(oi.quantity * oi.price), 0) AS amount
    FROM ERP_order_items oi
    INNER JOIN ERP_orders o ON o.id = oi.orderId
    INNER JOIN ERP_customers c ON c.id = o.customerId
    WHERE oi.paidAt IS NULL AND oi.deliveredAt IS NOT NULL
    GROUP BY c.id, c.name
    ORDER BY itemCount DESC
    LIMIT 10
  `);
  let totalDU = 0;
  for (const row of deliveredUnpaid) {
    totalDU += Number(row.itemCount);
    console.log(
      `  customerId=${row.customerId}  name=${JSON.stringify(row.name)}  itemCount=${row.itemCount}  amount=${Number(row.amount)}`
    );
  }
  const [duTotal] = await sequelize.query(`
    SELECT COUNT(*) AS c FROM ERP_order_items WHERE paidAt IS NULL AND deliveredAt IS NOT NULL
  `);
  console.log(`Total global ítems en esta categoría: ${duTotal[0].c} (top 10 cubre ${totalDU} ítems)`);

  section('Fin');
} catch (err) {
  console.error('ERROR:', err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
