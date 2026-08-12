import { Customer, Order, OrderItem } from "../../models/Orders.js";
import { Op, fn, col,literal } from 'sequelize';
const dias = ['L', 'M', 'W', 'J', 'V', 'S', 'D'];
import { startOfDay, endOfDay, subMonths, format, addDays, differenceInDays, parseISO,isValid as isValidDate  } from 'date-fns';

import { InventoryMovement, InventoryProduct } from "../../models/Inventory.js";

import { Income, Expense } from "../../models/Finance.js";
import {
  isWalkInPosOrder,
  walkInPosOrderExcludeWhere,
} from "../../utils/posOrderUtils.js";
import { buildFinanceDateWhere, buildFinanceDateColumnWhere } from "../../utils/financeDateUtils.js";

export const getExpensesForChart = async (req, res) => {
  try {
    const { startDate, endDate, referenceId, category, insumosOnly } = req.query;

    const andClauses = [];
    const dateClause = buildFinanceDateColumnWhere(startDate, endDate);
    if (dateClause) andClauses.push(dateClause);

    const onlyInsumos = insumosOnly === "1" || insumosOnly === "true";

    if (referenceId) andClauses.push({ referenceId: Number(referenceId) });
    if (category) andClauses.push({ category });

    const where = andClauses.length ? { [Op.and]: andClauses } : {};

    const expenses = await Expense.findAll({
      where,
      attributes: [
        "id",
        "date",
        "amount",
        "concept",
        "category",
        "createdBy",
        "referenceId",
        "referenceType",
      ],
      include: [
        {
          model: InventoryProduct,
          attributes: ["name", "type", "isGenericIngredient", "genericProductId"],
          required: onlyInsumos,
          ...(onlyInsumos
            ? {
                where: {
                  type: { [Op.in]: ["raw", "intermediate"] },
                },
              }
            : {}),
        },
      ],
      order: [["date", "ASC"]],
    });

    const shaped = expenses.map((e) => {
      const product = e.ERP_inventory_product;
      const item = {
        id: e.id,
        date: e.date,
        amount: Number(e.amount ?? 0),
        concept: e.concept ?? null,
        category: e.category ?? null,
        createdBy: e.createdBy ?? null,
      };

      if (e.referenceId) {
        item.referenceId = e.referenceId;
        item.referenceType = e.referenceType ?? null;
        item.productName = product?.name || `Producto #${e.referenceId}`;
        item.productType = product?.type ?? null;
        item.isGenericIngredient = Boolean(product?.isGenericIngredient);
        item.genericProductId = product?.genericProductId ?? null;
      }
      return item;
    });

    return res.json(shaped);
  } catch (error) {
    console.error("getExpensesForChart error:", error);
    return res.status(500).json({
      message: "Error al obtener gastos para gráfico",
      error: error.message,
    });
  }
};


export const getOrdersForCharts = async (req, res) => {
  try {
    // filtros opcionales ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const { start, end } = req.query;

    const where = {};
    if (start || end) {
      const s = start ? startOfDay(parseISO(start)) : undefined;
      const e = end ? endOfDay(parseISO(end)) : undefined;
      if (s && e) where.createdAt = { $between: [s, e] };
      else if (s) where.createdAt = { $gte: s };
      else if (e) where.createdAt = { $lte: e };
    }

    const orders = await Order.findAll({
      where,
      include: [
        { model: Customer, as: "ERP_customer", attributes: ["name"] },
        { model: OrderItem, as: "ERP_order_items" },
      ],
      order: [["createdAt", "ASC"]],
    });

    const shaped = orders.map((o) => ({
      id: o.id,
      date: format(new Date(o.date), 'dd/MM/yyyy HH:mm:ss'),
      ERP_customer: { name: o.ERP_customer?.name ?? "Cliente" },
      ERP_order_items: (o.ERP_order_items || []).map((it) => ({
        id: it.id,
        quantity: Number(it.quantity ?? 0),
        price: Number(it.price ?? 0),
        paidAt: it.paidAt ? format(new Date(it.paidAt), 'dd/MM/yyyy HH:mm:ss') : null,
        deliveredAt: it.deliveredAt ? format(new Date(it.deliveredAt), 'dd/MM/yyyy HH:mm:ss') : null,
      })),
    }));

    res.json(shaped);
  } catch (err) {
    console.error("getOrdersForCharts error:", err);
    res.status(500).json({ message: "Error al obtener órdenes para gráficos" });
  }
};



export const getCustomerSalesSummary = async (req, res) => {
  const toNum = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };

  const maxDate = (dates) => {
    const valid = dates
      .map(d => (d ? new Date(d) : null))
      .filter(d => d && !Number.isNaN(d.getTime()));
    if (!valid.length) return null;
    return new Date(Math.max(...valid.map(d => d.getTime())));
  };

  try {
    const customers = await Customer.findAll({
      attributes: ["id", "name", "phone", "email"],
      include: [
        {
          model: Order,
          as: "ERP_orders",
          required: false,
          where: walkInPosOrderExcludeWhere(Op),
          attributes: ["id", "date", "createdAt", "updatedAt", "notes"],
          include: [
            {
              model: OrderItem,
              as: "ERP_order_items",
              attributes: [
                "id",
                "productId",
                "quantity",
                "price",
                "paidAt",
                "deliveredAt",
                "damagedQty",
                "giftQty",
              ],
              include: [
                {
                  model: InventoryProduct,
                  as: "ERP_inventory_product",
                  attributes: ["id", "name"],
                },
              ],
            },
          ],
        },
      ],
    });

    const data = customers.map((c) => {
      const orders = (Array.isArray(c.ERP_orders) ? c.ERP_orders : []).filter(
        (o) => !isWalkInPosOrder(o),
      );

      let totalQuantity = 0;
      let totalPrice = 0;
      let totalAmount = 0;
      let paidFromOrders = 0;
      let totalOrdersNoPaid = 0;
      let totalAmountDeuda = 0;

      const productMap = new Map();

      orders.forEach((o) => {
        paidFromOrders += toNum(o?.paidAmount, 0);

        const items = Array.isArray(o.ERP_order_items) ? o.ERP_order_items : [];
        items.forEach((item) => {
          const qty = toNum(item.quantity);
          const price = toNum(item.price);
          const amt = qty * price;

          totalQuantity += qty;
          totalPrice += price;
          totalAmount += amt;

          if (!item.paidAt) {
            totalOrdersNoPaid += 1;
            totalAmountDeuda += amt; // deuda por ítems no pagados
          }

          const p = item.ERP_inventory_product || {};
          const productId = p?.id ?? item.productId ?? null;
          const key = String(productId);

          if (!productMap.has(key)) {
            productMap.set(key, {
              productId,
              name: p?.name ?? '(sin nombre)',
              totalQuantity: 0,
              totalPrice: 0,
              totalAmount: 0,
              pendingQuantity: 0,
              pendingAmount: 0,
            });
          }
          const agg = productMap.get(key);
          agg.totalQuantity += qty;
          agg.totalPrice += price;
          agg.totalAmount += amt;
          if (!item.paidAt) {
            agg.pendingQuantity += qty;
            agg.pendingAmount += amt;
          }
        });
      });

      const productSummary = Array.from(productMap.values())
        .sort((a, b) => b.totalAmount - a.totalAmount);

      // Opciones de deuda:
      // - revenuePending = totalAmount - paidFromOrders (global por orden)
      // - totalAmountDeuda = suma de ítems no pagados (más estricto)
      const revenuePending = Math.max(0, totalAmount - paidFromOrders);

      const lastOrderAt =
        maxDate(
          orders.map(o => o?.date ?? o?.createdAt ?? o?.updatedAt ?? null)
        ) || null;

      return {
        customerId: c.id,
        customer: {
          id: c.id,
          name: c.name,
          phone: c.phone ?? null,
          email: c.email ?? null,
        },
        totalQuantity,
        totalPrice,
        totalAmount,
        totalOrdersNoPaid,
        totalAmountDeuda,
        revenuePending,
        lastOrderAt,
        ordersCount: orders.length,
        // Sin `orders` anidados: el front usa productSummary (payload ~10× más liviano).
        productSummary,
      };
    });

    // ===== ORDEN REQUERIDO =====
    // Prioridad:
    // 1) Clientes con deuda primero (de mayor a menor)
    // 2) Si ambos tienen deuda: desempatar por mayor totalAmount
    // 3) Si ninguno tiene deuda: ordenar por mayor totalAmount
    const sorted = [...data].sort((a, b) => {
      // Elige la métrica de deuda que prefieras:
      // const debtA = toNum(a.totalAmountDeuda);
      // const debtB = toNum(b.totalAmountDeuda);
      const debtA = toNum(a.revenuePending); // ← usando revenuePending
      const debtB = toNum(b.revenuePending);

      const hasDebtA = debtA > 0;
      const hasDebtB = debtB > 0;

      // 1) deudores arriba
      if (hasDebtA !== hasDebtB) return hasDebtB - hasDebtA;

      if (hasDebtA && hasDebtB) {
        // 2) ambos con deuda: más deuda primero
        if (debtB !== debtA) return debtB - debtA;
        // luego mayor "ganancia"
        const gainDiff = toNum(b.totalAmount) - toNum(a.totalAmount);
        if (gainDiff !== 0) return gainDiff;
      }

      // 3) ninguno con deuda: mayor "ganancia" primero
      const gainDiff = toNum(b.totalAmount) - toNum(a.totalAmount);
      if (gainDiff !== 0) return gainDiff;

      // desempate final opcional por fecha del último pedido (más reciente primero)
      const tA = a.lastOrderAt ? new Date(a.lastOrderAt).getTime() : 0;
      const tB = b.lastOrderAt ? new Date(b.lastOrderAt).getTime() : 0;
      return tB - tA;
    });

    return res.json(sorted);
  } catch (error) {
    console.error('Error en getCustomerSalesSummary:', error);
    return res.status(500).json({
      message: 'Error al obtener resumen por cliente',
      error: String(error?.message || error),
    });
  }
};



export const getIncomeExpenseBreakdown = async (req, res) => {
  // Utils locales (dentro del controlador)
  const toNum = (v, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : def;
  };
  const round2 = (n) => Number.parseFloat(toNum(n).toFixed(2));

  try {
    const { startDate, endDate } = req.query;
    const commonWhere = buildFinanceDateWhere(startDate, endDate);

    // --- Totales globales (crudos)
    const [totalIncomeRaw, totalExpenseRaw] = await Promise.all([
      Income.sum("amount", { where: commonWhere }),
      Expense.sum("amount", { where: commonWhere }),
    ]);

    const totalIncome = round2(totalIncomeRaw || 0);
    const totalExpense = round2(totalExpenseRaw || 0);
    const totalOverall = round2(totalIncome + totalExpense);

    // --- Sumas por categoría (crudo)
    const [incomeCats, expenseCats] = await Promise.all([
      Income.findAll({
        attributes: ["category", [fn("SUM", col("amount")), "total"]],
        where: commonWhere,
        group: ["category"],
      }),
      Expense.findAll({
        attributes: ["category", [fn("SUM", col("amount")), "total"]],
        where: commonWhere,
        group: ["category"],
      }),
    ]);

    // --- Subgrupos crudos (NO porcentaje)
    const incomeGroup = incomeCats.map((row) => {
      const cat = row.get("category") ?? "Sin categoría";
      const total = round2(row.get("total") || 0);
      return { label: String(cat), value: total }; // value = monto crudo
    });

    const expenseGroup = expenseCats.map((row) => {
      const cat = row.get("category") ?? "Sin categoría";
      const total = round2(row.get("total") || 0);
      return { label: String(cat), value: total }; // value = monto crudo
    });

    // --- Plataformas crudas (NO porcentaje)
    const platforms = [
      { label: "Ingresos", value: totalIncome }, // value = monto crudo
      { label: "Gastos", value: totalExpense },  // value = monto crudo
    ];

    // --- Payload crudo para que el frontend calcule % según necesite
    const payload = {
      platforms,
      groups: {
        Ingresos: incomeGroup,
        Gastos: expenseGroup,
      },
      meta: {
        totals: {
          income: totalIncome,
          expense: totalExpense,
          overall: totalOverall,
        },
        range: {
          startDate: startDate || null,
          endDate: endDate || null,
        },
      },
    };

    if (req.query.detail === "1") {
      const [incomeRows, expenseRows] = await Promise.all([
        Income.findAll({
          where: commonWhere,
          attributes: ["id", "date", "concept", "category", "amount", "counterpartyName"],
          order: [["date", "DESC"], ["id", "DESC"]],
        }),
        Expense.findAll({
          where: commonWhere,
          attributes: ["id", "date", "concept", "category", "amount", "counterpartyName", "referenceId"],
          include: [
            { model: InventoryProduct, as: "ERP_inventory_product", attributes: ["name"], required: false },
          ],
          order: [["date", "DESC"], ["id", "DESC"]],
        }),
      ]);

      payload.incomeLines = incomeRows.map((r) => ({
        id: r.id,
        date: r.date,
        concept: r.concept,
        category: r.category ?? "Sin categoría",
        amount: round2(r.amount),
        counterpartyName: r.counterpartyName,
      }));

      payload.expenseLines = expenseRows.map((r) => ({
        id: r.id,
        date: r.date,
        concept: r.concept,
        category: r.category ?? "Sin categoría",
        amount: round2(r.amount),
        counterpartyName: r.counterpartyName,
        productName: r.ERP_inventory_product?.name ?? null,
      }));
    }

    return res.json(payload);
  } catch (error) {
    console.error("Error en getIncomeExpenseBreakdown:", error);
    return res.status(500).json({
      message: "Error al obtener desglose de Ingresos/Gastos por categoría",
      error,
    });
  }
};
export const getProductRotationAnalysis = async (req, res) => {
  try {
    const products = await InventoryProduct.findAll();

    const results = [];

    for (const product of products) {
      const movements = await InventoryMovement.findAll({
        where: {
          productId: product.id,
        },
        order: [["date", "ASC"]],
      });

      let stock = 0;
      const entradas = [];
      const agotamientos = [];

      for (const move of movements) {
        if (move.type === "entrada") {
          entradas.push({ date: move.date, quantity: move.quantity });
          stock += move.quantity;
        } else if (["salida", "produccion"].includes(move.type)) {
          stock -= move.quantity;
          if (stock <= 0) {
            agotamientos.push({ date: move.date });
            stock = 0;
          }
        }
      }

      // Necesitamos al menos una entrada y un agotamiento para calcular
      if (entradas.length === 0 || agotamientos.length === 0) continue;

      const ultimaEntrada = entradas[entradas.length - 1].date;
      const ultimoAgotamiento = agotamientos[agotamientos.length - 1].date;

      const diasHastaAgotar = differenceInDays(ultimoAgotamiento, ultimaEntrada);
      const cantidadConsumida = entradas[entradas.length - 1].quantity;

      const consumoPromedioPorDia =
        diasHastaAgotar > 0 ? cantidadConsumida / diasHastaAgotar : 0;

      // Calcular ciclos entre entradas y agotamientos (mínimo 2 eventos cada uno)
      const ciclos = Math.min(entradas.length, agotamientos.length);
      const ciclosDias = [];

      for (let i = 0; i < ciclos; i++) {
        const dias = differenceInDays(
          parseISO(agotamientos[i].date.toISOString()),
          parseISO(entradas[i].date.toISOString())
        );
        if (dias > 0) ciclosDias.push(dias);
      }

      const cicloPromedio = ciclosDias.length
        ? ciclosDias.reduce((a, b) => a + b, 0) / ciclosDias.length
        : 0;

      results.push({
        producto: product.name,
        ultimaCompra: format(new Date(ultimaEntrada), "yyyy-MM-dd"),
        ultimoAgotamiento: format(new Date(ultimoAgotamiento), "yyyy-MM-dd"),
        diasHastaAgotar,
        consumoPromedioPorDia: parseFloat(consumoPromedioPorDia.toFixed(2)),
        cicloPromedio: parseFloat(cicloPromedio.toFixed(2)),
        unidad: product.unitId === 1 ? "unidades/día" : "kg/día", // puedes ajustar según tu lógica
      });
    }

    res.json(results);
  } catch (error) {
    console.error("Error en getProductRotationAnalysis:", error);
    res.status(500).json({
      message: "Error al calcular rotación de productos",
      error,
    });
  }
};

const orderIncludePaidTop = {
  model: Order,
  as: "ERP_order",
  attributes: [],
  where: { status: 'pagado' },
};
const orderIncludeAnyTop = {
  model: Order,
  as: "ERP_order",
  attributes: [],
  required: true,
};

/**
 * Top 5 + series diarias para un criterio: 'paid' | 'delivered' | 'order'
 * (order = fecha creación pedido pagado).
 */
async function buildTopProductsDailyForMode(dateBy, startDate, endDate) {
  let topProductsData;
  if (dateBy === 'paid') {
    topProductsData = await OrderItem.findAll({
      attributes: ['productId', [fn('SUM', col('quantity')), 'totalSold']],
      where: {
        paidAt: { [Op.between]: [startDate, endDate] },
      },
      include: [orderIncludePaidTop],
      group: ['productId'],
      order: [[fn('SUM', col('quantity')), 'DESC']],
      limit: 5,
    });
  } else if (dateBy === 'delivered') {
    topProductsData = await OrderItem.findAll({
      attributes: ['productId', [fn('SUM', col('quantity')), 'totalSold']],
      where: {
        deliveredAt: { [Op.between]: [startDate, endDate] },
      },
      include: [orderIncludeAnyTop],
      group: ['productId'],
      order: [[fn('SUM', col('quantity')), 'DESC']],
      limit: 5,
    });
  } else {
    topProductsData = await OrderItem.findAll({
      attributes: ['productId', [fn('SUM', col('quantity')), 'totalSold']],
      include: [
        {
          model: Order,
          as: "ERP_order",
          attributes: [],
          where: {
            status: 'pagado',
            createdAt: { [Op.between]: [startDate, endDate] },
          },
        },
      ],
      group: ['productId'],
      order: [[fn('SUM', col('quantity')), 'DESC']],
      limit: 5,
    });
  }

  const topProductIds = topProductsData.map((p) => p.productId);

  const products =
    topProductIds.length > 0
      ? await InventoryProduct.findAll({
          where: { id: topProductIds },
        })
      : [];

  const productMap = {};
  for (const product of products) {
    productMap[product.id] = product.name;
  }

  if (topProductIds.length === 0) {
    return { products: [], dataset: [], datasetAmount: [] };
  }

  const dataset = [];
  const datasetAmount = [];
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

  for (let i = 0; i <= totalDays; i++) {
    const day = addDays(startDate, i);
    const dayStart = startOfDay(day);
    const dayEnd = endOfDay(day);

    const dataPointQty = {
      date: format(day, 'yyyy-MM-dd'),
    };
    const dataPointAmt = {
      date: format(day, 'yyyy-MM-dd'),
    };

    let items;
    if (dateBy === 'paid') {
      items = await OrderItem.findAll({
        attributes: [
          'productId',
          [fn('SUM', col('quantity')), 'sold'],
          [fn('SUM', literal('`quantity` * `price`')), 'revenue'],
        ],
        where: {
          productId: { [Op.in]: topProductIds },
          paidAt: { [Op.between]: [dayStart, dayEnd] },
        },
        include: [orderIncludePaidTop],
        group: ['productId'],
      });
    } else if (dateBy === 'delivered') {
      items = await OrderItem.findAll({
        attributes: [
          'productId',
          [fn('SUM', col('quantity')), 'sold'],
          [fn('SUM', literal('`quantity` * `price`')), 'revenue'],
        ],
        where: {
          productId: { [Op.in]: topProductIds },
          deliveredAt: { [Op.between]: [dayStart, dayEnd] },
        },
        include: [orderIncludeAnyTop],
        group: ['productId'],
      });
    } else {
      items = await OrderItem.findAll({
        attributes: [
          'productId',
          [fn('SUM', col('quantity')), 'sold'],
          [fn('SUM', literal('`quantity` * `price`')), 'revenue'],
        ],
        where: {
          productId: { [Op.in]: topProductIds },
        },
        include: [
          {
            model: Order,
            as: "ERP_order",
            attributes: [],
            where: {
              status: 'pagado',
              createdAt: { [Op.between]: [dayStart, dayEnd] },
            },
          },
        ],
        group: ['productId'],
      });
    }

    for (const productId of topProductIds) {
      const item = items.find((row) => row.productId === productId);
      const sold = item ? parseFloat(item.get('sold')) : 0;
      const revenue = item ? parseFloat(item.get('revenue')) : 0;
      dataPointQty[productId] = Number.isFinite(sold) ? sold : 0;
      dataPointAmt[productId] = Number.isFinite(revenue) ? revenue : 0;
    }

    topProductIds.forEach((id) => {
      if (!(id in dataPointQty)) dataPointQty[id] = 0;
      if (!(id in dataPointAmt)) dataPointAmt[id] = 0;
    });

    dataset.push(dataPointQty);
    datasetAmount.push(dataPointAmt);
  }

  const productList = topProductIds
    .map((id) => {
      const name = productMap[id];
      if (!name) return null;
      return { id, name };
    })
    .filter((p) => p !== null);

  return { products: productList, dataset, datasetAmount };
}

/** Una sola respuesta: pago y entrega (el front cambia vista sin nueva petición). */
export const getTopProductsDailySales = async (req, res) => {
  try {
    const today = new Date();
    const startDate = startOfDay(subMonths(today, 1));
    const endDate = endOfDay(today);

    const [paid, delivered] = await Promise.all([
      buildTopProductsDailyForMode('paid', startDate, endDate),
      buildTopProductsDailyForMode('delivered', startDate, endDate),
    ]);

    res.json({ paid, delivered });
  } catch (error) {
    console.error("Error en getTopProductsDailySales:", error);
    res.status(500).json({
      message: "Error al obtener ventas diarias por producto",
      error,
    });
  }
};

export const getWeeklySales = async (req, res) => {
  try {
    const today = new Date();
    const todayIndex = (today.getDay() + 6) % 7; // lunes = 0, domingo = 6

    const labels = [];
    const values = [];

    for (let i = 0; i < 7; i++) {
      const offset = i <= todayIndex ? i - todayIndex : i - todayIndex - 7;
      const day = new Date(today);
      day.setDate(today.getDate() + offset);

      const label = `${dias[i]} ${format(day, 'dd/MM')}`;
      labels.push(label);

      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);

      const orders = await Order.findAll({
        where: {
          status: 'pagado',
          createdAt: {
            [Op.between]: [dayStart, dayEnd],
          },
        },
        include: [
          {
            model: OrderItem,
            as: 'ERP_order_items',
          },
        ],
      });

      const total = orders.reduce((sum, order) => {
        const orderTotal = order.ERP_order_items.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0
        );
        return sum + orderTotal;
      }, 0);

      values.push(total);
    }

    res.json({ labels, values });
  } catch (error) {
    console.error("Error al obtener ventas semanales:", error);
    res.status(500).json({ message: "Error al obtener ventas diarias", error });
  }
};


export const getOrderAnalytics = async (req, res) => {
  try {
    // Solo ids + flags de pago/entrega (sin productos ni montos).
    const orders = await Order.findAll({
      attributes: ["id"],
      include: {
        model: OrderItem,
        as: "ERP_order_items",
        attributes: ["paidAt", "deliveredAt"],
      },
    });

    let totalUnpaid = 0;
    let totalPaidUndelivered = 0;
    let totalUnpaidUndelivered = 0;
    let totalDeliveredUnpaid = 0;

    for (const order of orders) {
      const items = order.ERP_order_items || [];
      if (!items.length) continue;

      const allPaid = items.every((i) => !!i.paidAt);
      const allDelivered = items.every((i) => !!i.deliveredAt);

      if (!allPaid) totalUnpaid += 1;
      if (allPaid && !allDelivered) totalPaidUndelivered += 1;
      if (!allPaid && !allDelivered) totalUnpaidUndelivered += 1;
      if (allDelivered && !allPaid) totalDeliveredUnpaid += 1;
    }

    const analyticsData = [
      { id: "unpaidOrders", label: "No Pagados", value: totalUnpaid },
      { id: "paidUndeliveredOrders", label: "Pagados no Entregados", value: totalPaidUndelivered },
      { id: "unpaidUndeliveredOrders", label: "No Pagados ni Entregados", value: totalUnpaidUndelivered },
      { id: "deliveredUnpaidOrders", label: "Entregados no Pagados", value: totalDeliveredUnpaid },
    ];

    res.json(analyticsData);
  } catch (error) {
    console.error("Error en getOrderAnalytics:", error);
    res.status(500).json({ message: "Error al calcular estadísticas", error });
  }
};


