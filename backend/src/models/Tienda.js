import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

/**
 * Proveedor de mercadería.
 * Ejemplo: Mayorista de harina, bebidas, limpieza, etc.
 */
export const Supplier = sequelize.define(
  "tienda_suppliers",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(140), allowNull: false, unique: true },
    document: { type: DataTypes.STRING(30), allowNull: true },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    address: { type: DataTypes.STRING(240), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { timestamps: true }
);

/**
 * Unidades medibles con factor relativo a una "unidad base" del mismo grupo.
 * Ejemplo grupo "peso":
 * - libra factor 1
 * - arroba factor 25
 * - quintal factor 100
 */
export const MeasureUnit = sequelize.define(
  "tienda_measure_units",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    abbreviation: { type: DataTypes.STRING(20), allowNull: false },
    groupName: { type: DataTypes.STRING(50), allowNull: false, defaultValue: "unit" },
    factorToBase: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    isBase: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { timestamps: false }
);

export const ProductCategory = sequelize.define(
  "tienda_product_categories",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
    parentId: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["parentId"] },
      { fields: ["isActive"] },
      { fields: ["sortOrder"] },
    ],
  }
);

/**
 * Marca comercial del producto (Real, Nirsa, etc.).
 */
export const Brand = sequelize.define(
  "tienda_brands",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false, unique: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { timestamps: false }
);

/**
 * Producto comercial (sin recetas/producción).
 * Todo stock se guarda SIEMPRE en unidad base (baseUnitId).
 */
export const StoreProduct = sequelize.define(
  "tienda_products",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    sku: { type: DataTypes.STRING(80), allowNull: true, unique: true },
    barcode: { type: DataTypes.STRING(80), allowNull: true, unique: true },
    categoryId: { type: DataTypes.INTEGER, allowNull: true },
    brandId: { type: DataTypes.INTEGER, allowNull: true },
    baseUnitId: { type: DataTypes.INTEGER, allowNull: false },
    sizeLabel: { type: DataTypes.STRING(80), allowNull: true },
    stockBase: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    minStockBase: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    avgCostBase: { type: DataTypes.DECIMAL(12, 4), allowNull: false, defaultValue: 0 },
    salePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    taxType: {
      type: DataTypes.ENUM("gravado", "zero", "exento"),
      allowNull: false,
      defaultValue: "gravado",
    },
    taxRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 15 },
    primaryImageUrl: { type: DataTypes.STRING(500), allowNull: true },
    wholesaleMinQty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    wholesalePrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { timestamps: true }
);

export const Customer = sequelize.define(
  "tienda_customers",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(140), allowNull: false },
    ci: { type: DataTypes.STRING(20), allowNull: true, unique: true },
    nickname: { type: DataTypes.STRING(80), allowNull: true },
    email: { type: DataTypes.STRING(120), allowNull: true },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    secondaryPhone: { type: DataTypes.STRING(40), allowNull: true },
    address: { type: DataTypes.STRING(240), allowNull: true },
    city: { type: DataTypes.STRING(80), allowNull: true },
    reference: { type: DataTypes.STRING(240), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  { timestamps: true }
);

export const SaleOrder = sequelize.define(
  "tienda_orders",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATE, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("pendiente", "entregado", "pagado"),
      allowNull: false,
      defaultValue: "pendiente",
    },
  },
  { timestamps: true }
);

export const SaleOrderItem = sequelize.define(
  "tienda_order_items",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.FLOAT, allowNull: false },
    price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    taxType: {
      type: DataTypes.ENUM("gravado", "zero", "exento"),
      allowNull: false,
      defaultValue: "gravado",
    },
    taxRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 15 },
    taxBase: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    taxAmount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    lineTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    deliveredAt: { type: DataTypes.DATE, allowNull: true },
    paidAt: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: false }
);

export const SupplierOrder = sequelize.define(
  "tienda_supplier_orders",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    supplierId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATE, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("pendiente", "recibido", "cancelado"),
      allowNull: false,
      defaultValue: "pendiente",
    },
  },
  { timestamps: true }
);

export const SupplierOrderItem = sequelize.define(
  "tienda_supplier_order_items",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.FLOAT, allowNull: false },
    unitPrice: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  },
  { timestamps: false }
);

/**
 * Compra (cabecera).
 */
export const Purchase = sequelize.define(
  "tienda_purchases",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    supplierId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    invoiceNumber: { type: DataTypes.STRING(60), allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  },
  { timestamps: true }
);

/**
 * Compra (detalle).
 * Guarda cantidad en unidad comprada y cantidad equivalente en unidad base.
 */
export const PurchaseItem = sequelize.define(
  "tienda_purchase_items",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    purchaseId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    unitId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.FLOAT, allowNull: false },
    quantityBase: { type: DataTypes.FLOAT, allowNull: false },
    expiryDate: { type: DataTypes.DATEONLY, allowNull: true },
    unitPrice: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
    lineTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  },
  { timestamps: false }
);

/**
 * Kardex mínimo de movimientos de inventario.
 */
export const StockMovement = sequelize.define(
  "tienda_stock_movements",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    type: {
      type: DataTypes.ENUM("entrada_compra", "salida_venta", "ajuste_entrada", "ajuste_salida"),
      allowNull: false,
    },
    quantityBase: { type: DataTypes.FLOAT, allowNull: false },
    unitCostBase: { type: DataTypes.DECIMAL(12, 4), allowNull: true },
    referenceType: { type: DataTypes.STRING(40), allowNull: true },
    referenceId: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
  },
  { timestamps: true }
);

/**
 * Movimientos financieros manuales (ingresos y gastos no automáticos).
 * Las compras y ventas siguen existiendo en sus módulos y se pueden consolidar en reportes.
 */
export const FinanceEntry = sequelize.define(
  "tienda_finance_entries",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.ENUM("income", "expense"), allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    category: { type: DataTypes.STRING(80), allowNull: true },
    description: { type: DataTypes.STRING(240), allowNull: true },
    sourceType: { type: DataTypes.STRING(40), allowNull: false, defaultValue: "manual" },
    sourceId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { timestamps: true }
);

ProductCategory.hasMany(StoreProduct, { foreignKey: "categoryId" });
StoreProduct.belongsTo(ProductCategory, { foreignKey: "categoryId", as: "category" });
Brand.hasMany(StoreProduct, { foreignKey: "brandId" });
StoreProduct.belongsTo(Brand, { foreignKey: "brandId", as: "brand" });

// Jerarquía de categorías (padre -> hijos)
ProductCategory.belongsTo(ProductCategory, { foreignKey: "parentId", as: "parent" });
ProductCategory.hasMany(ProductCategory, { foreignKey: "parentId", as: "children" });

MeasureUnit.hasMany(StoreProduct, { foreignKey: "baseUnitId" });
StoreProduct.belongsTo(MeasureUnit, { foreignKey: "baseUnitId", as: "baseUnit" });

Supplier.hasMany(Purchase, { foreignKey: "supplierId" });
Purchase.belongsTo(Supplier, { foreignKey: "supplierId", as: "supplier" });

Purchase.hasMany(PurchaseItem, { foreignKey: "purchaseId", onDelete: "CASCADE" });
PurchaseItem.belongsTo(Purchase, { foreignKey: "purchaseId" });

StoreProduct.hasMany(PurchaseItem, { foreignKey: "productId" });
PurchaseItem.belongsTo(StoreProduct, { foreignKey: "productId", as: "product" });

MeasureUnit.hasMany(PurchaseItem, { foreignKey: "unitId" });
PurchaseItem.belongsTo(MeasureUnit, { foreignKey: "unitId", as: "unit" });

StoreProduct.hasMany(StockMovement, { foreignKey: "productId" });
StockMovement.belongsTo(StoreProduct, { foreignKey: "productId", as: "product" });

Customer.hasMany(SaleOrder, { foreignKey: "customerId" });
SaleOrder.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

SaleOrder.hasMany(SaleOrderItem, { foreignKey: "orderId", onDelete: "CASCADE" });
SaleOrderItem.belongsTo(SaleOrder, { foreignKey: "orderId" });

StoreProduct.hasMany(SaleOrderItem, { foreignKey: "productId" });
SaleOrderItem.belongsTo(StoreProduct, { foreignKey: "productId", as: "product" });

Supplier.hasMany(SupplierOrder, { foreignKey: "supplierId" });
SupplierOrder.belongsTo(Supplier, { foreignKey: "supplierId", as: "supplier" });

SupplierOrder.hasMany(SupplierOrderItem, { foreignKey: "orderId", onDelete: "CASCADE" });
SupplierOrderItem.belongsTo(SupplierOrder, { foreignKey: "orderId" });

StoreProduct.hasMany(SupplierOrderItem, { foreignKey: "productId" });
SupplierOrderItem.belongsTo(StoreProduct, { foreignKey: "productId", as: "product" });
