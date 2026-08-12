// routes/financeRoutes.js
import { Router } from "express";
import {
  createIncome,
  updateIncome,
  deleteIncome,
  getAllIncomes,
  createExpense,
  updateExpense,
  deleteExpense,
  getAllExpenses,
  getFinanceSummary,
} from "../controllers/InventoryControl/FinanceController.js";
import { isAuthenticated, requireAdminOrProgrammer } from "../middlewares/authMiddelware.js";
import { getOrderAnalytics, getWeeklySales,getTopProductsDailySales,getProductRotationAnalysis,getIncomeExpenseBreakdown,getCustomerSalesSummary, getOrdersForCharts,getExpensesForChart } from "../controllers/InventoryControl/AnalyticsController.js";
import { getFinanceDashboard, getFinanceDashboardHero, getFinanceDashboardRest } from "../controllers/InventoryControl/DashboardController.js";
import { getCalendarMonthSummary, getCalendarDayDetail, getCalendarPeriodDetail, getCalendarYearSummary } from "../controllers/InventoryControl/CalendarFinanceController.js";
import {
  getObligationsWorkbench,
  getObligationById,
  createObligation,
  payObligation,
  cancelObligation,
} from "../controllers/InventoryControl/LoanObligationController.js";
import { getProductSeriesCharts, getProductSeriesDetail } from "../controllers/InventoryControl/ProductSeriesController.js";
import { getCashFlowMirror } from "../controllers/InventoryControl/CashFlowMirrorController.js";
import { getCashFlowCandles } from "../controllers/InventoryControl/CashFlowCandlestickController.js";
import {
  getRecurringWorkbench,
  createRecurringTemplate,
  updateRecurringTemplate,
  updateRecurringOccurrence,
  payRecurringOccurrence,
  skipRecurringOccurrence,
  generateRecurringOccurrences,
} from "../controllers/InventoryControl/RecurringExpenseController.js";


const router = new Router();

const adminOnly = [isAuthenticated, requireAdminOrProgrammer];

// ✅ Ingresos
router.post("/incomes", ...adminOnly, createIncome);
router.get("/incomes", ...adminOnly, getAllIncomes);
router.put("/incomes/:id", ...adminOnly, updateIncome);
router.delete("/incomes/:id", ...adminOnly, deleteIncome);

// ✅ Gastos
router.post("/expenses", ...adminOnly, createExpense);
router.get("/expenses", ...adminOnly, getAllExpenses);
router.put("/expenses/:id", ...adminOnly, updateExpense);
router.delete("/expenses/:id", ...adminOnly, deleteExpense);

// 📊 Resumen financiero
router.get("/summary", ...adminOnly, getFinanceSummary);
router.get("/dashboard/hero", ...adminOnly, getFinanceDashboardHero);
router.get("/dashboard/rest", ...adminOnly, getFinanceDashboardRest);
router.get("/dashboard", ...adminOnly, getFinanceDashboard);
router.get("/calendar-month", ...adminOnly, getCalendarMonthSummary);
router.get("/calendar-year", ...adminOnly, getCalendarYearSummary);
router.get("/calendar-day", ...adminOnly, getCalendarDayDetail);
router.get("/calendar-period", ...adminOnly, getCalendarPeriodDetail);


router.get("/overview", ...adminOnly, getOrderAnalytics);
router.get("/getWeeklySales", ...adminOnly, getWeeklySales);
router.get("/getTopProductsDailySales", ...adminOnly, getTopProductsDailySales);
router.get("/getProductRotationAnalysis", ...adminOnly, getProductRotationAnalysis);
router.get("/getIncomeExpenseBreakdown", ...adminOnly, getIncomeExpenseBreakdown);
router.get("/getCustomerSalesSummary", ...adminOnly, getCustomerSalesSummary);
router.get("/getOrdersForCharts", ...adminOnly, getOrdersForCharts);
router.get("/getExpensesForChart", ...adminOnly, getExpensesForChart);
router.get("/product-series", ...adminOnly, getProductSeriesCharts);
router.get("/product-series/detail", ...adminOnly, getProductSeriesDetail);
router.get("/cash-flow-mirror", ...adminOnly, getCashFlowMirror);
router.get("/cash-flow-candles", ...adminOnly, getCashFlowCandles);

// Préstamos y deudas (sin pedido)
router.get("/obligations/workbench", ...adminOnly, getObligationsWorkbench);
router.get("/obligations/:id", ...adminOnly, getObligationById);
router.post("/obligations", ...adminOnly, createObligation);
router.post("/obligations/:id/pay", ...adminOnly, payObligation);
router.patch("/obligations/:id/cancel", ...adminOnly, cancelObligation);

// Gastos recurrentes (arriendo, servicios, permisos)
router.get("/recurring/workbench", ...adminOnly, getRecurringWorkbench);
router.post("/recurring/templates", ...adminOnly, createRecurringTemplate);
router.put("/recurring/templates/:id", ...adminOnly, updateRecurringTemplate);
router.post("/recurring/generate", ...adminOnly, generateRecurringOccurrences);
router.patch("/recurring/occurrences/:id", ...adminOnly, updateRecurringOccurrence);
router.post("/recurring/occurrences/:id/pay", ...adminOnly, payRecurringOccurrence);
router.patch("/recurring/occurrences/:id/skip", ...adminOnly, skipRecurringOccurrence);

export default router;
