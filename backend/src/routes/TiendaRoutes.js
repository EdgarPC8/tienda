import { Router } from "express";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import { tiendaUploadSingle } from "../middlewares/uploadTiendaMiddleware.js";
import {
  getSuppliers,
  createSupplier,
  getUnits,
  createUnit,
  getCategories,
  createCategory,
  getBrands,
  createBrand,
  getProducts,
  createProduct,
  updateProduct,
  createPurchase,
  openProductBoxes,
  getPurchases,
  getStockMovements,
  getExpiryAlerts,
  getFinanceEntries,
  createFinanceEntry,
  getFinanceSummary,
  getCustomers,
  createCustomer,
  updateCustomer,
  getOrders,
  createOrder,
  updateOrder,
  getSupplierOrders,
  createSupplierOrder,
  updateSupplierOrder,
} from "../controllers/TiendaController.js";

const router = Router();

// Catálogos base
router.get("/suppliers", isAuthenticated, getSuppliers);
router.post("/suppliers", isAuthenticated, createSupplier);
router.get("/units", isAuthenticated, getUnits);
router.post("/units", isAuthenticated, createUnit);
router.get("/categories", isAuthenticated, getCategories);
router.post("/categories", isAuthenticated, createCategory);
router.get("/brands", isAuthenticated, getBrands);
router.post("/brands", isAuthenticated, createBrand);
router.get("/products", isAuthenticated, getProducts);
router.post("/products", isAuthenticated, tiendaUploadSingle, createProduct);
router.put("/products/:id", isAuthenticated, tiendaUploadSingle, updateProduct);

// Compras + kardex
router.get("/purchases", isAuthenticated, getPurchases);
router.post("/purchases", isAuthenticated, createPurchase);
router.post("/open-box", isAuthenticated, openProductBoxes);
router.get("/movements", isAuthenticated, getStockMovements);
router.get("/expiry-alerts", isAuthenticated, getExpiryAlerts);
router.get("/finance/entries", isAuthenticated, getFinanceEntries);
router.post("/finance/entries", isAuthenticated, createFinanceEntry);
router.get("/finance/summary", isAuthenticated, getFinanceSummary);
router.get("/customers", isAuthenticated, getCustomers);
router.post("/customers", isAuthenticated, createCustomer);
router.put("/customers/:id", isAuthenticated, updateCustomer);
router.get("/orders", isAuthenticated, getOrders);
router.post("/orders", isAuthenticated, createOrder);
router.put("/orders/:id", isAuthenticated, updateOrder);
router.get("/supplier-orders", isAuthenticated, getSupplierOrders);
router.post("/supplier-orders", isAuthenticated, createSupplierOrder);
router.put("/supplier-orders/:id", isAuthenticated, updateSupplierOrder);

export default router;
