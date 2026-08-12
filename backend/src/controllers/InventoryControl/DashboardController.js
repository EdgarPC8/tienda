import { Op, literal } from "sequelize";
import { getFinanceSummary } from "./FinanceController.js";
import {
  getOrderAnalytics,
  getIncomeExpenseBreakdown,
} from "./AnalyticsController.js";
import { getFinanceWorkbenchAll } from "./OrderGroupFinanceController.js";
import { InventoryProduct } from "../../models/Inventory.js";
import { invokeController, buildProductsStockAlerts } from "../../utils/invokeController.js";
import { computeObligationsDashboardData } from "./LoanObligationController.js";
import { computeRecurringDashboardData } from "./RecurringExpenseController.js";
import { computeBatchesDashboardAlerts } from "./BatchController.js";

const emptyObligations = {
  summary: { totalReceivable: 0, totalPayable: 0, openCount: 0 },
  topOpen: [],
};

const emptyRecurring = {
  summary: {
    monthlyFixed: 0,
    monthlyVariableEstimate: 0,
    monthlyBurden: 0,
    pendingThisMonth: 0,
    paidThisMonth: 0,
    activeTemplates: 0,
    overdueCount: 0,
    monthIncome: 0,
    gapToCover: 0,
    dailySalesTarget: 0,
    daysLeftInMonth: 1,
    isProfitable: false,
  },
  upcoming: [],
  overdue: [],
};

const emptyBatchesAlerts = { expired: [], expiring: [], ok: [], warnDays: 30 };

/** Solo productos en alerta de stock (sin cargar catálogo completo). */
async function fetchProductsStockAlerts() {
  const products = await InventoryProduct.findAll({
    attributes: ["id", "name", "price", "stock", "minStock", "type", "isActive"],
    where: {
      [Op.or]: [
        { stock: { [Op.lte]: 0 } },
        literal("`stock` > 0 AND `stock` <= `minStock`"),
      ],
    },
  });
  return buildProductsStockAlerts(products);
}

/**
 * GET /finance/dashboard/hero — solo lo necesario para las cards superiores.
 * Rápido: summary + obligaciones (préstamos/deudas de las cards).
 */
export const getFinanceDashboardHero = async (req, res) => {
  try {
    const [summary, obligations] = await Promise.all([
      invokeController(getFinanceSummary, req),
      computeObligationsDashboardData(),
    ]);

    return res.json({
      summary: summary ?? {},
      obligations: obligations ?? emptyObligations,
    });
  } catch (error) {
    console.error("getFinanceDashboardHero:", error);
    return res.status(error?.status || 500).json({
      message: error?.data?.message || error?.message || "Error al cargar resumen del dashboard",
    });
  }
};

/**
 * GET /finance/dashboard/rest — paneles inferiores (stock, estados, etc.).
 * Sin workbench completo (la tabla de clientes lo pide aparte).
 */
export const getFinanceDashboardRest = async (req, res) => {
  try {
    const [overView, incomeExpenseBreakdown, productsStock, recurring, batchesAlerts] =
      await Promise.all([
        invokeController(getOrderAnalytics, req),
        invokeController(getIncomeExpenseBreakdown, req),
        fetchProductsStockAlerts(),
        computeRecurringDashboardData(),
        computeBatchesDashboardAlerts(30),
      ]);

    return res.json({
      overView: Array.isArray(overView) ? overView : [],
      incomeExpenseBreakdown: incomeExpenseBreakdown ?? {},
      productsStock: productsStock ?? {
        agotados: [],
        porAgotarse: [],
        critico: [],
        bajo: [],
        precaucion: [],
      },
      recurring: recurring ?? emptyRecurring,
      batchesAlerts: batchesAlerts ?? emptyBatchesAlerts,
    });
  } catch (error) {
    console.error("getFinanceDashboardRest:", error);
    return res.status(error?.status || 500).json({
      message: error?.data?.message || error?.message || "Error al cargar paneles del dashboard",
    });
  }
};

/**
 * GET /finance/dashboard — carga agregada completa (compatibilidad).
 */
export const getFinanceDashboard = async (req, res) => {
  try {
    const [hero, rest, workbench] = await Promise.all([
      (async () => {
        const [summary, obligations] = await Promise.all([
          invokeController(getFinanceSummary, req),
          computeObligationsDashboardData(),
        ]);
        return { summary, obligations };
      })(),
      (async () => {
        const [overView, incomeExpenseBreakdown, productsStock, recurring, batchesAlerts] =
          await Promise.all([
            invokeController(getOrderAnalytics, req),
            invokeController(getIncomeExpenseBreakdown, req),
            fetchProductsStockAlerts(),
            computeRecurringDashboardData(),
            computeBatchesDashboardAlerts(30),
          ]);
        return {
          overView,
          incomeExpenseBreakdown,
          productsStock,
          recurring,
          batchesAlerts,
        };
      })(),
      invokeController(getFinanceWorkbenchAll, req),
    ]);

    return res.json({
      summary: hero.summary ?? {},
      overView: Array.isArray(rest.overView) ? rest.overView : [],
      incomeExpenseBreakdown: rest.incomeExpenseBreakdown ?? {},
      workbench: {
        customers: workbench?.customers ?? [],
        orders: workbench?.orders ?? [],
        groups: workbench?.groups ?? [],
        payments: workbench?.payments ?? [],
      },
      productsStock: rest.productsStock ?? {
        agotados: [],
        porAgotarse: [],
        critico: [],
        bajo: [],
        precaucion: [],
      },
      batchesAlerts: rest.batchesAlerts ?? emptyBatchesAlerts,
      obligations: hero.obligations ?? emptyObligations,
      recurring: rest.recurring ?? emptyRecurring,
      expenses: [],
      orders: [],
      expensesForChart: [],
    });
  } catch (error) {
    console.error("getFinanceDashboard:", error);
    return res.status(error?.status || 500).json({
      message: error?.data?.message || error?.message || "Error al cargar dashboard",
    });
  }
};
