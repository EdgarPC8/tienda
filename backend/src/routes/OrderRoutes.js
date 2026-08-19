// routes/orderRoutes.js
import express from "express";
import {
  createCustomer,
  getAllCustomers,
  updateCustomer,
  deleteCustomer,
} from "../controllers/InventoryControl/CustomerController.js";

import {
  createOrder,
  posCheckout,
  getPosSales,
  updateOrderStatus,
  getAllOrders,
  updateOrder,
  addOrderItem,
  markOrderAsPaid,
  unmarkOrderAsPaid,
  markItemAsDelivered,
  markItemAsPaid,
  unmarkItemAsPaid,
  updateOrderItem,
  programmerDashboardOrderItemCorrection,
  deleteOrderItem,
  deleteOrder,
  command,
  getOrderStatusWorkbench,


} from "../controllers/InventoryControl/OrderController.js";


import {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from "../controllers/InventoryControl/SupplierController.js";
import {
  listSupplierProductCodes,
  resolveSupplierProductCode,
  upsertSupplierProductCodes,
  deleteSupplierProductCode,
} from "../controllers/InventoryControl/SupplierProductCodeController.js";
import {
  getSupplierOrders,
  createSupplierOrder,
  updateSupplierOrder,
  addSupplierOrderItem,
  deleteSupplierOrder,
  markSupplierOrderReceived,
  markSupplierOrderPaid,
  unmarkSupplierOrderPaid,
} from "../controllers/InventoryControl/SupplierOrderController.js";
import {
  exportOrdersMonth,
  importOrdersMonth,
} from "../controllers/InventoryControl/OrderMonthTransferController.js";
import {
  getSupplierPayablesWorkbench,
  paySupplierOrder,
  updateSupplierOrderPayment,
  deleteSupplierOrderPayment,
  createSupplierPack,
  paySupplierPack,
  updateSupplierPack,
  dissolveSupplierPack,
} from "../controllers/InventoryControl/SupplierPayablesController.js";

import { isAuthenticated, requireProgrammer } from "../middlewares/authMiddelware.js";
import { 
    // ✅ WORKBENCH
    getFinanceWorkbenchAll,
    getCustomerOrderCollectionSummary,
    payCustomerOrder,

    // ✅ NUEVO: Grupos por ITEMS
    createItemGroup,
    addItemsToGroup,
    updateItemGroup,
    deleteItemGroup,
    moveItemBetweenGroups,
  
    // ✅ NUEVO: Pagos/Abonos (Payment -> Income)
    payItemGroup,
    updateGroupPayment,
    deleteGroupPayment,

} from "../controllers/InventoryControl/OrderGroupFinanceController.js";


const router = express.Router();




// --------------------
// CMD — script one-off de mantenimiento (cliente hardcodeado en OrderController.command)
// En producción NO se expone. En dev: solo Programador autenticado.
// --------------------
if (process.env.NODE_ENV !== "production") {
  router.get("/cmd", isAuthenticated, requireProgrammer, command);
}

// --------------------
// WORKBENCH
// --------------------
router.get("/workbench/all", isAuthenticated, getFinanceWorkbenchAll);
router.get(
  "/workbench/orders/:orderId/summary",
  isAuthenticated,
  getCustomerOrderCollectionSummary
);
router.post(
  "/workbench/orders/:orderId/pay",
  isAuthenticated,
  payCustomerOrder
);

// =====================================================
// ✅ FINANCE WORKBENCH (NUEVO)
// =====================================================

/**
 * Crear grupo por items
 * POST /workbench/item-groups
 * body: { customerId, itemIds: number[], concept? }
 */
router.post("/workbench/item-groups", isAuthenticated, createItemGroup);

/**
 * Agregar ítems a un grupo existente
 * POST /workbench/item-groups/:groupId/add-items
 * body: { itemIds: number[] }
 */
router.post("/workbench/item-groups/:groupId/add-items", isAuthenticated, addItemsToGroup);

/**
 * Editar grupo (concept/status)
 * PUT /workbench/item-groups/:groupId
 * body: { concept?, status? } // status: "open" | "closed" | "cancelled"
 */
router.put("/workbench/item-groups/:groupId", isAuthenticated, updateItemGroup);

/**
 * Eliminar grupo (solo si no tiene pagos)
 * DELETE /workbench/item-groups/:groupId
 */
router.delete("/workbench/item-groups/:groupId", isAuthenticated, deleteItemGroup);

/**
 * Mover / quitar / agregar item a grupo
 * POST /workbench/item-groups/move-item
 * body: { orderItemId, toGroupId }  // toGroupId = null => quitar del grupo
 */
router.post("/workbench/item-groups/move-item", isAuthenticated, moveItemBetweenGroups);

/**
 * Abonar a un grupo (crea Payment + Income)
 * POST /workbench/item-groups/:groupId/pay
 * body: { amount, date?, note?, method? }
 */
router.post("/workbench/item-groups/:groupId/pay", isAuthenticated, payItemGroup);

/**
 * Editar un pago (sincroniza Income)
 * PUT /workbench/payments/:paymentId
 * body: { amount?, date?, note?, method?, status? }
 */
router.put("/workbench/payments/:paymentId", isAuthenticated, updateGroupPayment);

/**
 * Eliminar un pago (borra Income asociado)
 * DELETE /workbench/payments/:paymentId
 */
router.delete("/workbench/payments/:paymentId", isAuthenticated, deleteGroupPayment);

// =====================================================
// ✅ PROVEEDORES Y PEDIDOS A PROVEEDOR
// =====================================================
router.get("/suppliers", isAuthenticated, getAllSuppliers);
router.post("/suppliers", isAuthenticated, createSupplier);
router.put("/suppliers/:id", isAuthenticated, updateSupplier);
router.delete("/suppliers/:id", isAuthenticated, deleteSupplier);

router.get("/supplier-product-codes", isAuthenticated, listSupplierProductCodes);
router.get("/supplier-product-codes/resolve", isAuthenticated, resolveSupplierProductCode);
router.post("/supplier-product-codes/upsert", isAuthenticated, upsertSupplierProductCodes);
router.delete("/supplier-product-codes/:id", isAuthenticated, deleteSupplierProductCode);

router.get("/supplier-orders", isAuthenticated, getSupplierOrders);
router.post("/supplier-orders", isAuthenticated, createSupplierOrder);
router.post("/supplier-orders/:id/items", isAuthenticated, addSupplierOrderItem);
router.put("/supplier-orders/:id", isAuthenticated, updateSupplierOrder);
router.delete("/supplier-orders/:id", isAuthenticated, deleteSupplierOrder);
router.put("/supplier-orders/:id/received", isAuthenticated, markSupplierOrderReceived);
router.put("/supplier-orders/:id/paid", isAuthenticated, markSupplierOrderPaid);
router.put("/supplier-orders/:id/unmark-paid", isAuthenticated, unmarkSupplierOrderPaid);

// Cuentas por pagar (abonos a pedidos de proveedor)
router.get("/supplier-payables/workbench", isAuthenticated, getSupplierPayablesWorkbench);
router.post("/supplier-payables/packs", isAuthenticated, createSupplierPack);
router.put("/supplier-payables/packs/:packId", isAuthenticated, updateSupplierPack);
router.post("/supplier-payables/packs/:packId/dissolve", isAuthenticated, dissolveSupplierPack);
router.post("/supplier-payables/packs/:packId/pay", isAuthenticated, paySupplierPack);
router.post("/supplier-payables/orders/:orderId/pay", isAuthenticated, paySupplierOrder);
router.put("/supplier-payables/payments/:paymentId", isAuthenticated, updateSupplierOrderPayment);
router.delete("/supplier-payables/payments/:paymentId", isAuthenticated, deleteSupplierOrderPayment);

// =====================================================
// ✅ TRANSFERENCIA MES (export/import JSON clientes + proveedores)
// =====================================================
router.get("/month-transfer/export", isAuthenticated, exportOrdersMonth);
router.post("/month-transfer/import", isAuthenticated, importOrdersMonth);

// =====================================================
// ✅ ÓRDENES (LO TUYO NORMAL)
// =====================================================
router.get("/pos/sales", isAuthenticated, getPosSales);
router.post("/pos/checkout", isAuthenticated, posCheckout);
router.post("", isAuthenticated, createOrder);
router.post("/:orderId/items", isAuthenticated, addOrderItem);
router.put("/:id", isAuthenticated, updateOrder);
router.put("/:id/status", isAuthenticated, updateOrderStatus);
router.get("/status-workbench", isAuthenticated, getOrderStatusWorkbench);
router.get("", isAuthenticated, getAllOrders);

// Montado en /orders → ruta correcta /:id/mark-paid (antes /orders/:id duplicaba prefijo)
router.put("/:id/mark-paid", isAuthenticated, markOrderAsPaid);
router.put("/:id/unmark-paid", isAuthenticated, unmarkOrderAsPaid);

// =====================================================
// ✅ CLIENTES (LO TUYO NORMAL)
// =====================================================
router.post("/customers", isAuthenticated, createCustomer);
router.get("/customers", isAuthenticated, getAllCustomers);
router.put("/customers/:id", isAuthenticated, updateCustomer);
router.delete("/customers/:id", isAuthenticated, deleteCustomer);

// =====================================================
// ✅ ITEMS (LO TUYO NORMAL)
// =====================================================
router.put("/order-items/:itemId/mark-delivered", isAuthenticated, markItemAsDelivered);
router.put("/order-items/:itemId/mark-paid", isAuthenticated, markItemAsPaid);
router.put("/order-items/:itemId/unmark-paid", isAuthenticated, unmarkItemAsPaid);

router.patch(
  "/order-items/:itemId/programmer-dashboard",
  isAuthenticated,
  requireProgrammer,
  programmerDashboardOrderItemCorrection,
);

router.put(
  "/order-items/:itemId/programmer-dashboard",
  isAuthenticated,
  requireProgrammer,
  programmerDashboardOrderItemCorrection,
);

router.put("/order-items/:itemId", isAuthenticated, updateOrderItem);
router.delete("/order-items/:id", isAuthenticated, deleteOrderItem);

router.delete("/order/:id", isAuthenticated, deleteOrder);

export default router;
