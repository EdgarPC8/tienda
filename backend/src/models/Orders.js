import { DataTypes, Sequelize } from 'sequelize';
import { sequelize } from '../database/connection.js';
import { InventoryProduct } from './Inventory.js';
import { CashShift } from './CashShift.js';
import { CashRegister } from './CashRegister.js';

// Tabla de clientes
export const Customer = sequelize.define("ERP_customers", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  /** Nombre completo (denormalizado para listados / pedidos). */
  name: { type: DataTypes.STRING, allowNull: false },
  firstName: { type: DataTypes.STRING(120), allowNull: true },
  secondName: { type: DataTypes.STRING(120), allowNull: true },
  firstLastName: { type: DataTypes.STRING(120), allowNull: true },
  secondLastName: { type: DataTypes.STRING(120), allowNull: true },
  /**
   * Tipo identificación SRI: 04 RUC, 05 cédula, 06 pasaporte,
   * 07 consumidor final, 08 id. exterior.
   */
  identType: {
    type: DataTypes.STRING(2),
    allowNull: true,
    defaultValue: "05",
  },
  /** Número de documento (cédula / RUC / pasaporte). */
  cedula: { type: DataTypes.STRING(32), allowNull: true },
  phone: { type: DataTypes.STRING },
  address: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  timestamps: true,
});

// Tabla de pedidos (cabecera)
export const Order = sequelize.define("ERP_orders", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  customerId: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM("pendiente", "entregado", "pagado"),
    defaultValue: "pendiente"
  },
  notes: { type: DataTypes.TEXT },
  shiftId: { type: DataTypes.INTEGER, allowNull: true },
  /** Caja del local que registró la venta POS */
  cashRegisterId: { type: DataTypes.INTEGER, allowNull: true },
  /** Cuenta del vendedor / cajero que registró la venta POS */
  sellerAccountId: { type: DataTypes.INTEGER, allowNull: true },
  paymentMethod: { type: DataTypes.STRING(40), allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true },
  documentType: {
    type: DataTypes.STRING(30),
    allowNull: true,
    comment: "factura | nota_venta | documento | consumidor_final",
  },
  date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: Sequelize.NOW
  },
  financeIncomeId: { type: DataTypes.INTEGER, allowNull: true }

  
}, {
  timestamps: true,
});

// Tabla de detalles del pedido (productos)
export const OrderItem = sequelize.define("ERP_order_items", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.FLOAT, allowNull: false },
  price: { type: DataTypes.DECIMAL(14, 6), allowNull: false },
  soldQty: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
    comment: "Cantidad realmente vendida (cobrable)"
  },
  
  damagedQty: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
    comment: "Cantidad dañada / merma"
  },
  
  giftQty: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
    comment: "Cantidad entregada como yapa"
  },
  
  replacedQty: {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
    comment: "Cantidad entregada como reemplazo"
  },
  
  deliveredAt: {
    type: DataTypes.DATE,
    allowNull: true, // null means not delivered yet
  },
  /** Local desde el que salió el stock al entregar (multistock). */
  deliveredStoreId: { type: DataTypes.INTEGER, allowNull: true },
  paidAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: "Fecha cuando quedó totalmente pagado (último pago)",
  },
  /** Agrupa líneas en una paca del pedido a cliente. */
  packKey: { type: DataTypes.STRING(64), allowNull: true },
  packName: { type: DataTypes.STRING(120), allowNull: true },
  lotCode: { type: DataTypes.STRING(80), allowNull: true },
  expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
  manufacturedAt: { type: DataTypes.DATEONLY, allowNull: true },
  
  
}, {
  timestamps: false,
});

// Proveedores
export const Supplier = sequelize.define("ERP_suppliers", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  tradeName: { type: DataTypes.STRING(150), allowNull: true },
  identType: {
    type: DataTypes.STRING(2),
    allowNull: true,
    defaultValue: "04",
  },
  identNumber: { type: DataTypes.STRING(32), allowNull: true },
  category: { type: DataTypes.STRING(80), allowNull: true },
  contactName: { type: DataTypes.STRING(120), allowNull: true },
  contactRole: { type: DataTypes.STRING(80), allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  whatsapp: { type: DataTypes.STRING(40), allowNull: true },
  email: { type: DataTypes.STRING(120), allowNull: true },
  invoiceEmail: { type: DataTypes.STRING(120), allowNull: true },
  website: { type: DataTypes.STRING(200), allowNull: true },
  address: { type: DataTypes.STRING(250), allowNull: true },
  city: { type: DataTypes.STRING(80), allowNull: true },
  province: { type: DataTypes.STRING(80), allowNull: true },
  bankName: { type: DataTypes.STRING(80), allowNull: true },
  bankAccountType: { type: DataTypes.STRING(40), allowNull: true },
  bankAccountNumber: { type: DataTypes.STRING(64), allowNull: true },
  paymentTermDays: { type: DataTypes.INTEGER, allowNull: true },
  preferredPaymentMethod: { type: DataTypes.STRING(40), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  timestamps: true,
});

// Pedidos a proveedor (compras planificadas)
export const SupplierOrder = sequelize.define("ERP_supplier_orders", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  supplierId: { type: DataTypes.INTEGER, allowNull: false },
  date: { type: DataTypes.DATE, allowNull: false, defaultValue: Sequelize.NOW },
  notes: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM("pendiente", "recibido", "cancelado"),
    allowNull: false,
    defaultValue: "pendiente",
  },
  receivedAt: { type: DataTypes.DATE, allowNull: true },
  /** Local donde entró el stock al marcar recibido (multistock). */
  receivedStoreId: { type: DataTypes.INTEGER, allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true },
  paymentMethod: { type: DataTypes.STRING(40), allowNull: true },
  financeExpenseId: { type: DataTypes.INTEGER, allowNull: true },
  /** Nº de factura del proveedor (XML SRI / digitado). */
  invoiceNumber: { type: DataTypes.STRING(80), allowNull: true },
}, {
  timestamps: true,
});

export const SupplierOrderItem = sequelize.define("ERP_supplier_order_items", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  orderId: { type: DataTypes.INTEGER, allowNull: false },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.FLOAT, allowNull: false },
  unitPrice: { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
  /** Descuento de línea en $ (como en factura SRI). */
  discount: { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
  taxRate: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false,
    defaultValue: 0,
    comment: "% IVA aplicado al ítem (0 = sin IVA)",
  },
  /** Agrupa líneas en una paca del pedido (no es SupplierPack de cobranzas). */
  packKey: { type: DataTypes.STRING(64), allowNull: true },
  packName: { type: DataTypes.STRING(120), allowNull: true },
  /** Código de lote / lote del proveedor. */
  lotCode: { type: DataTypes.STRING(80), allowNull: true },
  /** Fecha de vencimiento del lote (al recibir se crea InventoryBatch). */
  expiresAt: { type: DataTypes.DATEONLY, allowNull: true },
  /** Fecha de elaboración (opcional). */
  manufacturedAt: { type: DataTypes.DATEONLY, allowNull: true },
  /** Lote de inventario creado al recibir. */
  inventoryBatchId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  timestamps: false,
});

/**
 * Código del producto según el proveedor (factura XML / catálogo del proveedor).
 * Mismo producto puede tener distinto código con otro proveedor.
 */
export const SupplierProductCode = sequelize.define(
  "ERP_supplier_product_codes",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    supplierId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    /** codigoPrincipal / codigoAuxiliar del XML o código interno del proveedor */
    supplierCode: { type: DataTypes.STRING(80), allowNull: false },
    notes: { type: DataTypes.STRING(200), allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        name: "uniq_supplier_product_code",
        fields: ["supplierId", "supplierCode"],
      },
    ],
  },
);

// Relaciones
Customer.hasMany(Order, { foreignKey: "customerId", as: "ERP_orders" });
Order.belongsTo(Customer, { foreignKey: "customerId", as: "ERP_customer" });

Order.hasMany(OrderItem, { foreignKey: "orderId", onDelete: "CASCADE", as: "ERP_order_items" });
OrderItem.belongsTo(Order, { foreignKey: "orderId", as: "ERP_order" });

InventoryProduct.hasMany(OrderItem, { foreignKey: "productId" });
OrderItem.belongsTo(InventoryProduct, { foreignKey: "productId", as: "ERP_inventory_product" });

CashShift.hasMany(Order, { foreignKey: 'shiftId', as: 'orders' });
Order.belongsTo(CashShift, { foreignKey: 'shiftId', as: 'shift' });

CashRegister.hasMany(Order, { foreignKey: 'cashRegisterId', as: 'orders' });
Order.belongsTo(CashRegister, { foreignKey: 'cashRegisterId', as: 'cashRegister' });

Supplier.hasMany(SupplierOrder, { foreignKey: 'supplierId', onDelete: 'RESTRICT' });
SupplierOrder.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'ERP_supplier' });

SupplierOrder.hasMany(SupplierOrderItem, {
  foreignKey: 'orderId',
  as: 'ERP_supplier_order_items',
  onDelete: 'CASCADE',
});
SupplierOrderItem.belongsTo(SupplierOrder, { foreignKey: 'orderId' });

InventoryProduct.hasMany(SupplierOrderItem, { foreignKey: 'productId' });
SupplierOrderItem.belongsTo(InventoryProduct, {
  foreignKey: 'productId',
  as: 'ERP_inventory_product',
});

Supplier.hasMany(SupplierProductCode, {
  foreignKey: "supplierId",
  as: "ERP_supplier_product_codes",
  onDelete: "CASCADE",
});
SupplierProductCode.belongsTo(Supplier, { foreignKey: "supplierId", as: "ERP_supplier" });

InventoryProduct.hasMany(SupplierProductCode, {
  foreignKey: "productId",
  as: "ERP_supplier_product_codes",
  onDelete: "CASCADE",
});
SupplierProductCode.belongsTo(InventoryProduct, {
  foreignKey: "productId",
  as: "ERP_inventory_product",
});

/** Cuotas / calendario de pago — pedido cliente */
export const OrderPaymentInstallment = sequelize.define(
  "ERP_order_payment_installments",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.STRING(255), allowNull: true },
  },
  { timestamps: true },
);

/** Cuotas / calendario de pago — pedido proveedor */
export const SupplierOrderPaymentInstallment = sequelize.define(
  "ERP_supplier_order_payment_installments",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    sequence: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    dueDate: { type: DataTypes.DATEONLY, allowNull: false },
    amount: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.STRING(255), allowNull: true },
  },
  { timestamps: true },
);

Order.hasMany(OrderPaymentInstallment, {
  foreignKey: "orderId",
  as: "ERP_order_payment_installments",
  onDelete: "CASCADE",
});
OrderPaymentInstallment.belongsTo(Order, { foreignKey: "orderId", as: "ERP_order" });

SupplierOrder.hasMany(SupplierOrderPaymentInstallment, {
  foreignKey: "orderId",
  as: "ERP_supplier_order_payment_installments",
  onDelete: "CASCADE",
});
SupplierOrderPaymentInstallment.belongsTo(SupplierOrder, {
  foreignKey: "orderId",
  as: "ERP_supplier_order",
});
