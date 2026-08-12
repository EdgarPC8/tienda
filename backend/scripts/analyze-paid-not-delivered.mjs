import 'dotenv/config';
import { Op, fn, col, literal } from 'sequelize';
import { sequelize } from '../src/database/connection.js';
import { Order, OrderItem, Customer } from '../src/models/Orders.js';

const itemWhere = {
  paidAt: { [Op.ne]: null },
  deliveredAt: null,
};

async function main() {
  const totalItems = await OrderItem.count({ where: itemWhere });

  const distinctOrders = await OrderItem.count({
    where: itemWhere,
    distinct: true,
    col: 'orderId',
  });

  const amountRow = await OrderItem.findOne({
    where: itemWhere,
    attributes: [
      [
        fn(
          'SUM',
          literal(
            '(CASE WHEN COALESCE(`soldQty`, 0) > 0 THEN `soldQty` ELSE `quantity` END) * `price`'
          )
        ),
        'approxAmount',
      ],
    ],
    raw: true,
  });
  const approxAmount = Number(amountRow?.approxAmount ?? 0);

  const byMonth = await sequelize.query(
    `SELECT DATE_FORMAT(o.date, '%Y-%m') AS yearMonth,
            COUNT(i.id) AS itemCount,
            COUNT(DISTINCT i.orderId) AS orderCount
     FROM ERP_order_items i
     INNER JOIN ERP_orders o ON i.orderId = o.id
     WHERE i.paidAt IS NOT NULL AND i.deliveredAt IS NULL
     GROUP BY DATE_FORMAT(o.date, '%Y-%m')
     ORDER BY yearMonth ASC`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const topCustomers = await sequelize.query(
    `SELECT o.customerId,
            MAX(c.name) AS customerName,
            COUNT(i.id) AS itemCount
     FROM ERP_order_items i
     INNER JOIN ERP_orders o ON i.orderId = o.id
     LEFT JOIN ERP_customers c ON o.customerId = c.id
     WHERE i.paidAt IS NOT NULL AND i.deliveredAt IS NULL
     GROUP BY o.customerId
     ORDER BY itemCount DESC
     LIMIT 15`,
    { type: sequelize.QueryTypes.SELECT }
  );

  const sample = await OrderItem.findAll({
    where: itemWhere,
    attributes: [
      'id',
      'orderId',
      'productId',
      'quantity',
      'soldQty',
      'price',
      'paidAt',
      'deliveredStoreId',
    ],
    include: [
      {
        model: Order,
        as: 'ERP_order',
        attributes: ['date', 'notes'],
        required: true,
        include: [
          {
            model: Customer,
            as: 'ERP_customer',
            attributes: ['name'],
            required: false,
          },
        ],
      },
    ],
    order: [['id', 'ASC']],
    limit: 20,
  });

  const notesOrders = await sequelize.query(
    `SELECT COUNT(DISTINCT i.orderId) AS cnt
     FROM ERP_order_items i
     INNER JOIN ERP_orders o ON i.orderId = o.id
     WHERE i.paidAt IS NOT NULL AND i.deliveredAt IS NULL
       AND (o.notes LIKE '%CAJA_POS%' OR o.notes LIKE '%#PANADERIA%')`,
    { type: sequelize.QueryTypes.SELECT }
  );
  const notesOrderCount = Number(notesOrders[0]?.cnt ?? 0);

  const withDeliveredStoreId = await OrderItem.count({
    where: {
      ...itemWhere,
      deliveredStoreId: { [Op.ne]: null },
    },
  });

  console.log('=== Análisis: ítems pagados (paidAt) sin entregar (deliveredAt) ===\n');
  console.log('1. Total ítems:', totalItems);
  console.log('2. Pedidos distintos:', distinctOrders);
  console.log('3. Monto aprox:', approxAmount.toFixed(2));
  console.log('\n4. Desglose por año-mes (order.date):');
  console.table(
    byMonth.map((r) => ({
      yearMonth: r.yearMonth,
      itemCount: Number(r.itemCount),
      orderCount: Number(r.orderCount),
    }))
  );
  console.log('\n5. Top 15 clientes por cantidad de ítems:');
  console.table(
    topCustomers.map((r) => ({
      customerId: r.customerId,
      customerName: r.customerName ?? '(sin nombre)',
      itemCount: Number(r.itemCount),
    }))
  );
  console.log('\n6. Muestra de 20 filas:');
  const sampleRows = sample.map((it) => {
    const o = it.ERP_order;
    return {
      orderId: it.orderId,
      itemId: it.id,
      orderDate: o?.date,
      paidAt: it.paidAt,
      quantity: it.quantity,
      soldQty: it.soldQty,
      price: it.price,
      productId: it.productId,
      customer: o?.ERP_customer?.name ?? null,
    };
  });
  console.table(sampleRows);
  console.log('\n7. Pedidos con notas CAJA_POS o #PANADERIA:', notesOrderCount);
  console.log('8. Ítems con deliveredStoreId definido:', withDeliveredStoreId, 'de', totalItems);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
