// routes/inventoryRoutes.js
import express from 'express';
import { isAuthenticated, requireProgrammer, requireAdminOrProgrammer } from "../middlewares/authMiddelware.js";

// Product Controllers
import {
  createProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  patchProductStock,
  getProductStoreStocks,
} from '../controllers/InventoryControl/ProductController.js';

import {
  getGenericIngredientsWorkbench,
  bootstrapGenericIngredients,
  createGenericIngredient,
  createPresentation,
  linkPresentation,
  unlinkPresentation,
} from '../controllers/InventoryControl/GenericIngredientController.js';

// Movement and Recipe Controllers (aún en InventoryController.js)
import { 
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  getRecipeCosting,
} from '../controllers/InventoryControl/RecipeController.js';

// Category Controllers
import {
  createCategory,
  getAllCategories,
  getAllCategoriesPublic,
  updateCategory,
  deleteCategory,
} from '../controllers/InventoryControl/CategoryController.js';

// Unit Controllers
import {
  createUnit,
  getAllUnits,
  updateUnit,
  deleteUnit,
} from '../controllers/InventoryControl/UnitController.js';

import {
  getBatches,
  getBatchesSummary,
  createBatch,
  updateBatch,
  writeOffBatch,
  closeBatch,
  splitBatch,
  deleteBatch,
} from '../controllers/InventoryControl/BatchController.js';

import { getInventoryValueSummary } from '../controllers/InventoryControl/InventoryValueController.js';


import {
  registerMovement,
  registerMovementsBatch,
  openPresentationMovement,
  getMovementsByProduct,
  getAllMovements,
  updateMovement,
  deleteMovement,
  updateMovementsDateBatch,
  registerProductionIntermediateFromPayload,
  registerProductionFinalFromPayload
} from '../controllers/InventoryControl/MovementController.js';


// routes/customerRoutes.js
import { 
  getAllCustomers,
  createCustomer,
  updateCustomer,
  deleteCustomer
 } from '../controllers/InventoryControl/CustomerController.js';
import {
  getAllSuppliers,
  createSupplier,
  updateSupplier,
  deleteSupplier,
} from '../controllers/InventoryControl/SupplierController.js';
import { simulateFromIntermediate, simulateProductionController } from '../controllers/InventoryControl/ProductionManagerController.js';
import { 
  getHomeProducts,
  getHomeProductById,
createHomeProduct,
updateHomeProduct,
deleteHomeProduct,
 } from '../controllers/InventoryControl/HomeProductController.js';   
import { edDeliUploadSingle } from '../middlewares/uploadEddDeliMiddleware.js';
import {
  getStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
} from "../controllers/InventoryControl/StoresController.js";
import {
  listCashRegisters,
  createCashRegister,
  updateCashRegister,
  deactivateCashRegister,
} from "../controllers/InventoryControl/CashRegisterController.js";
import {
  transferStock,
  getStocksByStore,
  getBodegaInfo,
} from "../controllers/InventoryControl/StoreStockController.js";
// CatalogController: CRUD admin + template-items (diseño promocional)
import {
  getCatalogEntries,
  createCatalogEntry,
  updateCatalogEntry,
  deleteCatalogEntry,
  reorderCatalogEntries,
  getPopularProducts,
  getAutoCatalogSeed,
  getCatalogTemplateItems,
} from "../controllers/InventoryControl/CatalogController.js";
// CatalogVitrinaController: vitrina/backery (CatalogPage)
import {
  getCatalogBySection,
  getCatalogBySections,
} from "../controllers/InventoryControl/CatalogVitrinaController.js";
import {
  getPublicCompareGroups,
  getCompareGroups,
  getCompareGroupById,
  createCompareGroup,
  updateCompareGroup,
  deleteCompareGroup,
  bootstrapPastelesCompareGroup,
} from "../controllers/InventoryControl/ProductCompareGroupController.js";
import {
  getAllTierGroups,
  getTierGroupById,
  createTierGroup,
  updateTierGroup,
  deleteTierGroup,
  migrateTierGroupsFromCategories,
} from "../controllers/InventoryControl/PricingTierGroupController.js";

import {
  getProductsByStore,
  addProductsToStore,
  removeProductFromStore,
  toggleStoreProduct,
  getStoresByProduct,
} 
from '../controllers/InventoryControl/StoreProductsController.js';

import {
  listStoreExhibidores,
  createStoreExhibidor,
  updateStoreExhibidor,
  deleteStoreExhibidor,
} from "../controllers/InventoryControl/StoreExhibidorController.js";

const router = express.Router();


// productos de una tienda (lectura pública; mutaciones requieren sesión)
router.get("/stores/:storeId/products", getProductsByStore);
router.post("/stores/:storeId/products", isAuthenticated, addProductsToStore);
router.delete("/stores/:storeId/products/:productId", isAuthenticated, removeProductFromStore);
router.patch("/stores/:storeId/products/:productId", isAuthenticated, toggleStoreProduct);

// Exhibidores del local (organización; no stock)
router.get("/stores/:storeId/exhibidores", isAuthenticated, listStoreExhibidores);
router.post("/stores/:storeId/exhibidores", isAuthenticated, createStoreExhibidor);
router.put("/stores/:storeId/exhibidores/:exhibidorId", isAuthenticated, updateStoreExhibidor);
router.delete("/stores/:storeId/exhibidores/:exhibidorId", isAuthenticated, deleteStoreExhibidor);

// tiendas que tienen un producto (opcional)
// router.get("/products/:productId/stores", getStoresByProduct);


// ----------------------------------
// 📋 CATÁLOGO (CatalogController + CatalogVitrinaController)
// ----------------------------------
// CatalogController: admin CRUD, template-items (publicidad), populares
router.get("/getPopularProducts", isAuthenticated, requireAdminOrProgrammer, getPopularProducts);
router.get("/getAutoCatalogSeed", isAuthenticated, requireAdminOrProgrammer, getAutoCatalogSeed);
router.get("/catalog", isAuthenticated, requireAdminOrProgrammer, getCatalogEntries);
router.get("/catalog/template-items", isAuthenticated, requireAdminOrProgrammer, getCatalogTemplateItems);
router.post("/catalog", isAuthenticated, createCatalogEntry);
router.put("/catalog/:id", isAuthenticated, updateCatalogEntry);
router.delete("/catalog/:id", isAuthenticated, deleteCatalogEntry);
router.post("/catalog/reorder", isAuthenticated, reorderCatalogEntries);
// CatalogVitrinaController: vitrina /backery (CatalogPage)
router.get("/catalog/section/:section", getCatalogBySection);   // → CatalogPage
router.get("/catalog/sections", getCatalogBySections);

// Grupos comparativos (pasteles, etc.)
router.get("/compare-groups/public", getPublicCompareGroups);
router.get("/compare-groups", isAuthenticated, getCompareGroups);
router.get("/compare-groups/:id", isAuthenticated, getCompareGroupById);
router.post("/compare-groups", isAuthenticated, createCompareGroup);
router.post("/compare-groups/bootstrap-pasteles", isAuthenticated, bootstrapPastelesCompareGroup);
router.put("/compare-groups/:id", isAuthenticated, updateCompareGroup);
router.delete("/compare-groups/:id", isAuthenticated, deleteCompareGroup);

// Tramos (grupos categoría + productos + precios por cantidad en caja)
router.get("/tier-groups", isAuthenticated, getAllTierGroups);
router.get("/tier-groups/:id", isAuthenticated, getTierGroupById);
router.post("/tier-groups", isAuthenticated, createTierGroup);
router.post("/tier-groups/migrate-from-categories", isAuthenticated, migrateTierGroupsFromCategories);
router.put("/tier-groups/:id", isAuthenticated, updateTierGroup);
router.delete("/tier-groups/:id", isAuthenticated, deleteTierGroup);



// Locales: GET público (catálogo / punto de venta); crear/editar/borrar solo autenticado
router.get("/stores/", getStores);
router.get("/stores/:id", getStoreById);
router.post("/stores/", isAuthenticated, edDeliUploadSingle, createStore);
router.put("/stores/:id", isAuthenticated, edDeliUploadSingle, updateStore);
router.delete("/stores/:id", isAuthenticated, deleteStore);

router.get("/stores/:storeId/registers", isAuthenticated, listCashRegisters);
router.post("/stores/:storeId/registers", isAuthenticated, createCashRegister);
router.put("/registers/:id", isAuthenticated, updateCashRegister);
router.delete("/registers/:id", isAuthenticated, deactivateCashRegister);

router.get("/bodega", isAuthenticated, getBodegaInfo);
router.get("/stores/:storeId/stocks", isAuthenticated, getStocksByStore);
router.post("/store-stocks/transfer", isAuthenticated, transferStock);

// ----------------------------------
// 🔁 Home Products
// ----------------------------------

router.get('/homeproducts', getHomeProducts);
router.post("/homeproducts", isAuthenticated, edDeliUploadSingle, createHomeProduct);
router.put("/homeproducts/:id", isAuthenticated, edDeliUploadSingle, updateHomeProduct);
router.delete("/homeproducts/:id", isAuthenticated, deleteHomeProduct);



// ----------------------------------
// 🔁 CLIENTES
// ----------------------------------

router.get('/customers', isAuthenticated, getAllCustomers);
router.post('/customers', isAuthenticated, createCustomer);
router.put('/customers/:id', isAuthenticated, updateCustomer);
router.delete('/customers/:id', isAuthenticated, deleteCustomer);

router.get('/suppliers', isAuthenticated, getAllSuppliers);
router.post('/suppliers', isAuthenticated, createSupplier);
router.put('/suppliers/:id', isAuthenticated, updateSupplier);
router.delete('/suppliers/:id', isAuthenticated, deleteSupplier);
// ----------------------------------
// 📦 PRODUCTOS
// ----------------------------------
router.post('/products', isAuthenticated, edDeliUploadSingle, createProduct);            // Crear producto
router.get('/products', isAuthenticated, getAllProducts);           // Obtener todos los productos
router.patch('/products/:id/stock', isAuthenticated, requireProgrammer, patchProductStock);
router.get('/products/:id/store-stocks', isAuthenticated, getProductStoreStocks);
router.put('/products/:id', isAuthenticated, edDeliUploadSingle, updateProduct);        // Editar producto
router.delete('/products/:id', isAuthenticated, deleteProduct);     // Eliminar producto

// ----------------------------------
// 🧪 INSUMOS GENÉRICOS Y PRESENTACIONES
// ----------------------------------
router.get('/generic-ingredients', isAuthenticated, getGenericIngredientsWorkbench);
router.post('/generic-ingredients/bootstrap', isAuthenticated, bootstrapGenericIngredients);
router.post('/generic-ingredients', isAuthenticated, createGenericIngredient);
router.post('/generic-ingredients/:genericId/presentations', isAuthenticated, createPresentation);
router.patch('/generic-ingredients/presentations/:productId/link', isAuthenticated, linkPresentation);
router.patch('/generic-ingredients/presentations/:productId/unlink', isAuthenticated, unlinkPresentation);

// ----------------------------------
// 🔁 MOVIMIENTOS
// ----------------------------------
// Registrar un nuevo movimiento de inventario
router.post('/movements', isAuthenticated, registerMovement);
router.post('/movements/batch', isAuthenticated, registerMovementsBatch);
router.post('/movements/open-presentation', isAuthenticated, openPresentationMovement);
router.put('/movements/batch/date', isAuthenticated, updateMovementsDateBatch);
router.put('/movements/:movementId', isAuthenticated, updateMovement);
router.delete('/movements/:movementId', isAuthenticated, deleteMovement);
router.get("/simulate-production", isAuthenticated,simulateProductionController);
router.get("/simulateFromIntermediate", isAuthenticated,simulateFromIntermediate);

// Obtener todos los movimientos por producto
router.get('/movements',isAuthenticated, getAllMovements);
router.get('/movements/:productId',isAuthenticated, getMovementsByProduct);

router.post("/registerProductionIntermediateFromPayload", isAuthenticated,registerProductionIntermediateFromPayload);
router.post("/registerProductionFinalFromPayload", isAuthenticated,registerProductionFinalFromPayload);

// ----------------------------------
// 🍳 RECETAS (opcional)
// ----------------------------------


// Obtener receta de un producto final
router.get('/recipes/:productFinalId', isAuthenticated, getRecipe);
router.get('/recipes/getRecipeCosting/:productFinalId', isAuthenticated, getRecipeCosting);

// Crear receta completa (uno o varios insumos)
router.post('/recipes', isAuthenticated, createRecipe);

// Editar cantidad de un insumo en la receta
router.put('/recipes/:id', isAuthenticated, updateRecipe);

// Eliminar un insumo de la receta
router.delete('/recipes/:id', isAuthenticated, deleteRecipe);

// ----------------------------------
// 🏷️ CATEGORÍAS
// ----------------------------------
router.post('/categories', isAuthenticated, requireAdminOrProgrammer, createCategory);
router.get('/categories/public', getAllCategoriesPublic);
router.get('/categories', isAuthenticated, getAllCategories);
router.put('/categories/:id', isAuthenticated, requireAdminOrProgrammer, updateCategory);
router.delete('/categories/:id', isAuthenticated, requireAdminOrProgrammer, deleteCategory);

// ----------------------------------
// 📏 UNIDADES
// ----------------------------------
router.post('/units', isAuthenticated, createUnit);                 // Crear unidad
router.get('/units', isAuthenticated, getAllUnits);                 // Listar unidades
router.put('/units/:id', isAuthenticated, updateUnit);              // Editar unidad
router.delete('/units/:id', isAuthenticated, deleteUnit);           // Eliminar unidad

// ----------------------------------
// 📦 LOTES Y VENCIMIENTOS
// ----------------------------------
router.get('/batches/summary', isAuthenticated, getBatchesSummary);
router.get('/batches', isAuthenticated, getBatches);
router.post('/batches', isAuthenticated, createBatch);
router.put('/batches/:id', isAuthenticated, updateBatch);
router.post('/batches/:id/write-off', isAuthenticated, writeOffBatch);
router.post('/batches/:id/close', isAuthenticated, closeBatch);
router.post('/batches/:id/split', isAuthenticated, splitBatch);
router.delete('/batches/:id', isAuthenticated, deleteBatch);

// ----------------------------------
// 💰 VALOR DE INVENTARIO
// ----------------------------------
router.get('/value-summary', isAuthenticated, getInventoryValueSummary);




export default router;
