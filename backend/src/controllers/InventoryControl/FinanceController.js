// controllers/financeController.js
import { Account } from "../../models/Account.js";
import { Income, Expense } from "../../models/Finance.js";
import { verifyJWT, getHeaderToken } from "../../libs/jwt.js";

// controllers/finance.controller.js
import { Op, fn, col, literal } from 'sequelize';
import { startOfMonth, endOfMonth, format, parse } from 'date-fns';
import { es } from 'date-fns/locale';
import { OrderItem } from "../../models/Orders.js";
import { ItemGroup, ItemGroupItem, Payment } from "../../models/Finance.js";
import { toFinanceDateTime } from "../../utils/financeDateTime.js";
import { buildFinanceDateColumnWhere } from "../../utils/financeDateUtils.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

/**
 * Si un grupo ya tiene abonos (group_payment), borra incomes "order_item" de esos
 * ítems para no sumar el doble en Finanzas (liquidación + Pago ítem #…).
 */
async function stripOrderItemIncomesWhenGroupAlreadyPaid() {
  try {
    const paidGroupRows = await Payment.findAll({
      where: { status: "completed" },
      attributes: ["groupId"],
      raw: true,
    });
    const groupIds = [...new Set(paidGroupRows.map((r) => Number(r.groupId)).filter(Boolean))];
    if (!groupIds.length) return;

    const links = await ItemGroupItem.findAll({
      where: { groupId: { [Op.in]: groupIds } },
      attributes: ["orderItemId"],
      raw: true,
    });
    const itemIds = [...new Set(links.map((l) => Number(l.orderItemId)).filter(Boolean))];
    if (!itemIds.length) return;

    await Income.destroy({
      where: {
        referenceType: "order_item",
        referenceId: { [Op.in]: itemIds },
      },
    });
  } catch (e) {
    console.warn("stripOrderItemIncomesWhenGroupAlreadyPaid:", e?.message || e);
  }
}

/**
 * Ingresos futuros / por cobrar: alineado con cobranzas por grupos.
 * - Ítems en un grupo abierto: solo el saldo (total líneas − abonos), no el bruto del ítem.
 * - Ítems sin grupo: cantidad cobrable × precio si paidAt es null.
 *   Cantidad cobrable = max(0, quantity − damagedQty − giftQty) — misma lógica que workbench.
 * Así los abonos (ya en Income) no duplican el monto en projectedBalance.
 */
export const getFinanceSummary = async (req, res) => {
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  const billableLineTotal = (it) => {
    const qty = toNum(it.quantity);
    const billable = Math.max(0, qty - toNum(it.damagedQty) - toNum(it.giftQty));
    return Number((billable * toNum(it.price)).toFixed(2));
  };

  try {
    await stripOrderItemIncomesWhenGroupAlreadyPaid();
    const [totalIncome, totalExpense, groupLinks, openGroups, completedPayments] = await Promise.all([
      Income.sum('amount'),
      Expense.sum('amount'),
      ItemGroupItem.findAll({ attributes: ['groupId', 'orderItemId'], raw: true }),
      ItemGroup.findAll({ where: { status: 'open' }, attributes: ['id'], raw: true }),
      Payment.findAll({ where: { status: 'completed' }, attributes: ['groupId', 'amount'], raw: true }),
    ]);

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
      paidByGroupId.set(gid, Number(((paidByGroupId.get(gid) || 0) + toNum(p.amount)).toFixed(2)));
    }

    let groupRemainingTotal = 0;
    const idsInOpenGroups = [...new Set([...itemsByOpenGroupId.values()].flat())];
    if (idsInOpenGroups.length > 0) {
      const groupedItems = await OrderItem.findAll({
        where: { id: { [Op.in]: idsInOpenGroups } },
        attributes: ['id', 'price', 'quantity', 'damagedQty', 'giftQty'],
        raw: true,
      });
      const lineTotalByItemId = new Map(
        groupedItems.map((it) => [it.id, billableLineTotal(it)])
      );

      for (const [groupId, itemIds] of itemsByOpenGroupId) {
        const totalCalc = itemIds.reduce((sum, id) => sum + (lineTotalByItemId.get(id) || 0), 0);
        const paid = paidByGroupId.get(groupId) || 0;
        groupRemainingTotal += Math.max(0, Number((totalCalc - paid).toFixed(2)));
      }
    }

    const ungroupedWhere = {
      paidAt: { [Op.is]: null },
      ...(groupedItemIds.size > 0 ? { id: { [Op.notIn]: [...groupedItemIds] } } : {}),
    };

    const futureIncomeRow = await OrderItem.findOne({
      attributes: [[
        fn(
          'COALESCE',
          fn(
            'SUM',
            literal(
              'price * GREATEST(0, quantity - COALESCE(damagedQty, 0) - COALESCE(giftQty, 0))'
            )
          ),
          0
        ),
        'futureIncome',
      ]],
      where: ungroupedWhere,
      raw: true,
    });

    const ungroupedFuture = toNum(futureIncomeRow?.futureIncome);
    const futureIncome = Number((groupRemainingTotal + ungroupedFuture).toFixed(2));
    const income = Number(totalIncome || 0);
    const expense = Number(totalExpense || 0);

    const now = new Date();
    const monthStart = format(startOfMonth(now), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(now), "yyyy-MM-dd");
    const monthDateWhere = buildFinanceDateColumnWhere(monthStart, monthEnd) || {};
    const [monthIncomeRaw, monthExpenseRaw] = await Promise.all([
      Income.sum("amount", { where: monthDateWhere }),
      Expense.sum("amount", { where: monthDateWhere }),
    ]);
    const monthIncome = Number(monthIncomeRaw || 0);
    const monthExpense = Number(monthExpenseRaw || 0);
    const monthBalance = Number((monthIncome - monthExpense).toFixed(2));
    const monthMarginPct =
      monthIncome > 0 ? Number(((monthBalance / monthIncome) * 100).toFixed(2)) : 0;

    // Margen del mes si se cobrara lo pendiente de pedidos.
    const monthIncomeWithPending = Number((monthIncome + futureIncome).toFixed(2));
    const monthBalanceWithPending = Number(
      (monthIncomeWithPending - monthExpense).toFixed(2),
    );
    const monthMarginWithPendingPct =
      monthIncomeWithPending > 0
        ? Number(((monthBalanceWithPending / monthIncomeWithPending) * 100).toFixed(2))
        : 0;

    // Mejor mes histórico por ganancia (ingresos − gastos).
    const [incomeByMonth, expenseByMonth] = await Promise.all([
      Income.findAll({
        attributes: [
          [fn("DATE_FORMAT", col("date"), "%Y-%m"), "monthKey"],
          [fn("SUM", col("amount")), "total"],
        ],
        group: [fn("DATE_FORMAT", col("date"), "%Y-%m")],
        raw: true,
      }),
      Expense.findAll({
        attributes: [
          [fn("DATE_FORMAT", col("date"), "%Y-%m"), "monthKey"],
          [fn("SUM", col("amount")), "total"],
        ],
        group: [fn("DATE_FORMAT", col("date"), "%Y-%m")],
        raw: true,
      }),
    ]);

    const monthMap = new Map();
    for (const row of incomeByMonth) {
      const key = row.monthKey;
      if (!key) continue;
      monthMap.set(key, {
        monthKey: key,
        income: toNum(row.total),
        expense: 0,
      });
    }
    for (const row of expenseByMonth) {
      const key = row.monthKey;
      if (!key) continue;
      const prev = monthMap.get(key) || { monthKey: key, income: 0, expense: 0 };
      prev.expense = toNum(row.total);
      monthMap.set(key, prev);
    }

    let bestMonth = null;
    for (const entry of monthMap.values()) {
      const balanceMonth = Number((entry.income - entry.expense).toFixed(2));
      if (!bestMonth || balanceMonth > bestMonth.balance) {
        bestMonth = {
          monthKey: entry.monthKey,
          balance: balanceMonth,
          income: entry.income,
          expense: entry.expense,
        };
      }
    }

    const currentMonthKey = format(now, "yyyy-MM");
    const bestMonthBalance = bestMonth ? Number(bestMonth.balance) : 0;
    const vsRecordPct =
      bestMonthBalance > 0
        ? Number(((monthBalance / bestMonthBalance) * 100).toFixed(2))
        : bestMonthBalance === 0 && monthBalance === 0
          ? 100
          : 0;
    const bestMonthLabel = bestMonth?.monthKey
      ? format(parse(bestMonth.monthKey, "yyyy-MM", new Date()), "MMMM yyyy", {
          locale: es,
        })
      : null;
    const isRecordMonth = Boolean(
      bestMonth?.monthKey && bestMonth.monthKey === currentMonthKey,
    );

    const balance = income - expense;
    const projectedBalance = balance + futureIncome;

    res.json({
      totalIncome: income,
      totalExpense: expense,
      balance,
      futureIncome,        // << nuevos ingresos esperados (órdenes no pagadas)
      projectedBalance,    // << balance proyectado = balance + futuros ingresos
      monthIncome,
      monthExpense,
      monthBalance,
      monthMarginPct,
      monthLabel: format(now, "MMMM yyyy", { locale: es }),
      monthIncomeWithPending,
      monthBalanceWithPending,
      monthMarginWithPendingPct,
      bestMonthBalance,
      bestMonthLabel,
      vsRecordPct,
      isRecordMonth,
    });
  } catch (error) {
    console.error('Error al obtener resumen financiero:', error);
    res.status(500).json({ message: 'Error interno al obtener resumen financiero' });
  }
};



/** Crear un nuevo ingreso */
export const createIncome = async (req, res) => {
  try {
    const { date, amount, concept, category, referenceId, referenceType } = req.body;

        const token = getHeaderToken(req);
      const user = await verifyJWT(token); // para createdBy
    const createdBy = user.accountId;
    const income = await Income.create({
      date: toFinanceDateTime(date),
      amount,
      concept,
      category,
      referenceId,
      referenceType,
      createdBy,
    });
    notifyOk("income.created", "Ingreso creado", { income });
    res.status(201).json(income);
  } catch (error) {
    console.error("Error al crear ingreso:", error);
    notifyFail("income.create_failed", "Error interno al crear ingreso", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error interno al crear ingreso" });
  }
};

/** Crear un nuevo gasto */
export const createExpense = async (req, res) => {
  try {
    const { date, amount, concept, category, referenceId, referenceType } = req.body;
      const token = getHeaderToken(req);
      const user = await verifyJWT(token); // para createdBy
    const createdBy = user.accountId;

    const expense = await Expense.create({
      date: toFinanceDateTime(date),
      amount,
      concept,
      category,
      referenceId,
      referenceType,
      createdBy,
    });
    notifyOk("expense.created", "Gasto creado", { expense });
    res.status(201).json(expense);
  } catch (error) {
    console.error("Error al crear gasto:", error);
    notifyFail("expense.create_failed", "Error interno al crear gasto", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error interno al crear gasto" });
  }
};

/** Obtener todos los ingresos */
export const getAllIncomes = async (req, res) => {
  try {
    await stripOrderItemIncomesWhenGroupAlreadyPaid();
    const incomes = await Income.findAll({
      include: [{ model: Account }],
      order: [
        ["date", "DESC"],
        ["id", "DESC"],
      ],
    });
    res.json(incomes);
  } catch (error) {
    console.error("Error al obtener ingresos:", error);
    res.status(500).json({ message: "Error interno al obtener ingresos" });
  }
};

/** Obtener todos los gastos */
export const getAllExpenses = async (req, res) => {
  try {
    const expenses = await Expense.findAll({
      include: [{ model: Account }],
      order: [
        ["date", "DESC"],
        ["id", "DESC"],
      ],
    });
    res.json(expenses);
  } catch (error) {
    console.error("Error al obtener gastos:", error);
    res.status(500).json({ message: "Error interno al obtener gastos" });
  }
};


/** Editar ingreso */
export const updateIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, amount, concept, category, referenceId, referenceType } = req.body;
    const income = await Income.findByPk(id);
    if (!income) {
      notifyFail("income.update_failed", `Ingreso #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: "Ingreso no encontrado" });
    }

    await income.update({
      date: toFinanceDateTime(date),
      amount,
      concept,
      category,
      referenceId,
      referenceType,
    });
    notifyOk("income.updated", `Ingreso #${id}`, { income });
    res.json(income);
  } catch (error) {
    console.error("Error al editar ingreso:", error);
    notifyFail("income.update_failed", `Error al editar ingreso #${req.params.id}`, { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error interno al editar ingreso" });
  }
};

/** Editar gasto */
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, amount, concept, category, referenceId, referenceType } = req.body;
    const expense = await Expense.findByPk(id);
    if (!expense) {
      notifyFail("expense.update_failed", `Gasto #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    await expense.update({
      date: toFinanceDateTime(date),
      amount,
      concept,
      category,
      referenceId,
      referenceType,
    });
    notifyOk("expense.updated", `Gasto #${id}`, { expense });
    res.json(expense);
  } catch (error) {
    console.error("Error al editar gasto:", error);
    notifyFail("expense.update_failed", `Error al editar gasto #${req.params.id}`, { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error interno al editar gasto" });
  }
};

/** Eliminar ingreso */
export const deleteIncome = async (req, res) => {
  try {
    const { id } = req.params;
    const income = await Income.findByPk(id);
    if (!income) {
      notifyFail("income.delete_failed", `Ingreso #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: "Ingreso no encontrado" });
    }

    await income.destroy();
    notifyOk("income.deleted", `Ingreso #${id}`, { incomeId: id });
    res.json({ message: "Ingreso eliminado" });
  } catch (error) {
    console.error("Error al eliminar ingreso:", error);
    notifyFail("income.delete_failed", `Error al eliminar ingreso #${req.params.id}`, { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error interno al eliminar ingreso" });
  }
};

/** Eliminar gasto */
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findByPk(id);
    if (!expense) {
      notifyFail("expense.delete_failed", `Gasto #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: "Gasto no encontrado" });
    }

    await expense.destroy();
    notifyOk("expense.deleted", `Gasto #${id}`, { expenseId: id });
    res.json({ message: "Gasto eliminado" });
  } catch (error) {
    console.error("Error al eliminar gasto:", error);
    notifyFail("expense.delete_failed", `Error al eliminar gasto #${req.params.id}`, { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error interno al eliminar gasto" });
  }
};
