// models/Finance.js
import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

import { Account } from "./Account.js";
import { InventoryProduct, Store } from "./Inventory.js";

// ✅ Ajusta a tu proyecto real:
import { OrderItem, Customer, Supplier, SupplierOrder, SupplierOrderItem } from "./Orders.js";

// =====================================================
// 1) GRUPO de ítems (deuda agrupada)
// =====================================================
export const ItemGroup = sequelize.define("ERP_finance_item_groups", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "Cliente dueño del grupo",
  },

  concept: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Grupo de pago",
    comment: "Nombre/nota del grupo",
  },

  status: {
    type: DataTypes.ENUM("open", "closed", "cancelled"),
    allowNull: false,
    defaultValue: "open",
    comment: "Estado del grupo",
  },

  // (opcional pero útil para mostrar “foto” del total al crear)
  totalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: "Total del grupo al momento de crearlo (snapshot)",
  },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
});

// Puente grupo <-> item
export const ItemGroupItem = sequelize.define("ERP_finance_item_group_items", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  groupId: { type: DataTypes.INTEGER, allowNull: false },
  orderItemId: { type: DataTypes.INTEGER, allowNull: false },
});

// =====================================================
// 2) PAYMENT (Abono al grupo / dinero que entra)
// ✅ Cada abono crea 1 Income
// referenceType: "group_payment"
// referenceId: payment.id
// =====================================================
export const Payment = sequelize.define("ERP_finance_payments", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  customerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "Cliente que realiza el pago/abono",
  },

  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "Grupo al que se aplica el abono",
  },

  date: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: "Fecha y hora del pago/abono",
  },

  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: "Monto del abono",
  },

  method: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "efectivo",
    comment: "Forma de pago",
  },

  note: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "Observación opcional",
  },

  status: {
    type: DataTypes.ENUM("completed", "cancelled"),
    allowNull: false,
    defaultValue: "completed",
    comment: "Estado del pago/abono",
  },

  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "Usuario que registró el pago",
  },
});

// =====================================================
// 3) INCOME (Contabilidad)
// ✅ Regla: 1 Payment = 1 Income
// referenceType = "group_payment"
// referenceId   = payment.id
// =====================================================
export const Income = sequelize.define("ERP_finance_incomes", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  date: { type: DataTypes.DATE, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },

  concept: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },

  referenceId: { type: DataTypes.INTEGER, allowNull: true },
  referenceType: { type: DataTypes.STRING, allowNull: true },

  status: {
    type: DataTypes.ENUM("pending", "paid"),
    allowNull: false,
    defaultValue: "paid",
  },

  counterpartyName: { type: DataTypes.STRING, allowNull: true },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
});

// =====================================================
// 4) EXPENSE
// =====================================================
export const Expense = sequelize.define("ERP_finance_expenses", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  date: { type: DataTypes.DATE, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },

  concept: { type: DataTypes.STRING, allowNull: false },
  category: { type: DataTypes.STRING, allowNull: false },

  referenceId: { type: DataTypes.INTEGER, allowNull: true },
  referenceType: { type: DataTypes.STRING, allowNull: true },

  status: {
    type: DataTypes.ENUM("pending", "paid"),
    allowNull: false,
    defaultValue: "paid",
  },

  counterpartyName: { type: DataTypes.STRING, allowNull: true },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
});

// =====================================================
// 5) ABONOS A PEDIDOS DE PROVEEDOR (cuentas por pagar)
// Cada abono crea 1 Expense (referenceType: supplier_order_abono)
// =====================================================
export const SupplierOrderPayment = sequelize.define("ERP_finance_supplier_order_payments", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  supplierOrderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "Pedido a proveedor",
  },

  supplierId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "Proveedor",
  },

  /** Si el abono viene de una paca/cartón multi-pedido */
  supplierPackId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Paca/cartón de compra (opcional)",
  },

  date: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: "Fecha y hora del abono",
  },

  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: "Monto del abono",
  },

  method: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "efectivo",
  },

  note: {
    type: DataTypes.STRING,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM("completed", "cancelled"),
    allowNull: false,
    defaultValue: "completed",
  },

  expenseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Expense contable asociado",
  },

  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

// =====================================================
// 5b) PACA / CARTÓN de compra a proveedor
// Agrupa líneas (incluso de pedidos distintos) con un valor total
// que se reparte en precio unitario. Al pagar se desglosa por pedido.
// =====================================================
export const SupplierPack = sequelize.define("ERP_finance_supplier_packs", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  supplierId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },

  concept: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: "Paca / cartón",
  },

  packAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: "Valor total de la paca",
  },

  /** carton = paca con reprecio; order_group = agrupar pedidos para abonar (sin tocar precios) */
  kind: {
    type: DataTypes.ENUM("carton", "order_group"),
    allowNull: false,
    defaultValue: "carton",
  },

  /** JSON array de supplierOrderId (grupos de pago por pedido) */
  memberOrderIds: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM("open", "closed", "cancelled"),
    allowNull: false,
    defaultValue: "open",
  },

  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
});

export const SupplierPackItem = sequelize.define("ERP_finance_supplier_pack_items", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  packId: { type: DataTypes.INTEGER, allowNull: false },

  supplierOrderId: { type: DataTypes.INTEGER, allowNull: false },

  supplierOrderItemId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: "Una línea solo puede estar en una paca",
  },

  quantity: {
    type: DataTypes.DECIMAL(12, 3),
    allowNull: false,
  },

  allocatedUnitPrice: {
    type: DataTypes.DECIMAL(14, 6),
    allowNull: false,
  },

  /** Precio unitario de la línea antes de armar la paca (para desglosar). */
  previousUnitPrice: {
    type: DataTypes.DECIMAL(14, 6),
    allowNull: true,
  },

  allocatedLineTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
});

// =====================================================
// 6) OBLIGACIONES (préstamos / deudas sin pedido)
// receivable = te deben (prestaste) → apertura Expense, cobros Income
// payable    = debes tú        → apertura Income, pagos Expense
// =====================================================
export const FinancialObligation = sequelize.define("ERP_finance_obligations", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  direction: {
    type: DataTypes.ENUM("receivable", "payable"),
    allowNull: false,
    comment: "receivable=por cobrar (prestaste), payable=por pagar (debes)",
  },

  partyType: {
    type: DataTypes.ENUM("customer", "employee", "supplier", "other"),
    allowNull: false,
    defaultValue: "other",
  },

  customerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Opcional si partyType=customer",
  },

  partyName: {
    type: DataTypes.STRING(150),
    allowNull: false,
    comment: "Nombre visible (empleado, proveedor, etc.)",
  },

  concept: {
    type: DataTypes.STRING(250),
    allowNull: false,
  },

  originalAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },

  openDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },

  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  status: {
    type: DataTypes.ENUM("open", "closed", "cancelled"),
    allowNull: false,
    defaultValue: "open",
  },

  initialFinanceType: {
    type: DataTypes.ENUM("income", "expense"),
    allowNull: true,
    comment: "Tipo del movimiento contable inicial",
  },

  initialFinanceId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  note: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  timestamps: true,
  indexes: [
    { fields: ["direction", "status"] },
    { fields: ["customerId"] },
    { fields: ["partyName"] },
  ],
});

export const ObligationPayment = sequelize.define("ERP_finance_obligation_payments", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  obligationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "ERP_finance_obligations", key: "id" },
    onDelete: "CASCADE",
  },

  date: { type: DataTypes.DATE, allowNull: false },
  amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  method: { type: DataTypes.STRING, allowNull: false, defaultValue: "efectivo" },
  note: { type: DataTypes.STRING(500), allowNull: true },

  financeType: {
    type: DataTypes.ENUM("income", "expense"),
    allowNull: false,
  },

  financeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: "ID en Income o Expense",
  },

  status: {
    type: DataTypes.ENUM("completed", "cancelled"),
    allowNull: false,
    defaultValue: "completed",
  },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  timestamps: true,
  indexes: [{ fields: ["obligationId"] }],
});

// =====================================================
// 6) GASTOS RECURRENTES (arriendo, servicios, permisos)
// Plantilla por local + cuotas generadas por período
// =====================================================
export const RecurringExpenseTemplate = sequelize.define("ERP_finance_recurring_templates", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  storeId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Punto de venta / local (null = gasto general)",
  },

  name: {
    type: DataTypes.STRING(200),
    allowNull: false,
    comment: "Ej: Arriendo Local Centro",
  },

  category: {
    type: DataTypes.ENUM("arriendo", "servicios", "permisos", "otros"),
    allowNull: false,
    defaultValue: "otros",
  },

  amountType: {
    type: DataTypes.ENUM("fixed", "variable"),
    allowNull: false,
    defaultValue: "fixed",
    comment: "fixed=arriendo, variable=luz/agua",
  },

  frequency: {
    type: DataTypes.ENUM("monthly", "quarterly", "annual"),
    allowNull: false,
    defaultValue: "monthly",
  },

  baseAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
    comment: "Monto fijo o estimado de referencia",
  },

  dueDayOfMonth: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    comment: "Día del mes de vencimiento (1-31)",
  },

  dueMonth: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Mes de vencimiento anual (1-12)",
  },

  providerName: {
    type: DataTypes.STRING(150),
    allowNull: true,
    comment: "Arrendador, CNEL, ETAPA, municipio, etc.",
  },

  note: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  reminderDaysBefore: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 7,
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  timestamps: true,
  indexes: [
    { fields: ["storeId"] },
    { fields: ["isActive"] },
    { fields: ["frequency"] },
  ],
});

export const RecurringExpenseOccurrence = sequelize.define("ERP_finance_recurring_occurrences", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  templateId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "ERP_finance_recurring_templates", key: "id" },
    onDelete: "CASCADE",
  },

  periodKey: {
    type: DataTypes.STRING(20),
    allowNull: false,
    comment: "2026-06 | 2026-Q2 | 2026",
  },

  dueDate: {
    type: DataTypes.DATE,
    allowNull: false,
  },

  expectedAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  },

  actualAmount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: "Monto real (variable) al pagar",
  },

  status: {
    type: DataTypes.ENUM("pending", "paid", "skipped"),
    allowNull: false,
    defaultValue: "pending",
  },

  expenseId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Gasto contable al pagar",
  },

  paidDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  note: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  lastReminderAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },

  createdBy: { type: DataTypes.INTEGER, allowNull: false },
}, {
  timestamps: true,
  indexes: [
    { unique: true, fields: ["templateId", "periodKey"] },
    { fields: ["status"] },
    { fields: ["dueDate"] },
  ],
});

// =====================================================
// 7) RELACIONES (continuación)
// =====================================================

// Income/Expense -> Account
Income.belongsTo(Account, { foreignKey: "createdBy" });
Expense.belongsTo(Account, { foreignKey: "createdBy" });

// Expense -> InventoryProduct (si referenceId apunta a producto)
InventoryProduct.hasMany(Expense, { foreignKey: "referenceId" });
Expense.belongsTo(InventoryProduct, { foreignKey: "referenceId" });

// Grupo -> Account
ItemGroup.belongsTo(Account, { foreignKey: "createdBy" });

// Grupo -> Items
ItemGroup.hasMany(ItemGroupItem, { foreignKey: "groupId", onDelete: "CASCADE" });
ItemGroupItem.belongsTo(ItemGroup, { foreignKey: "groupId" });

// ✅ Regla: un item solo puede pertenecer a 1 grupo
OrderItem.hasOne(ItemGroupItem, { foreignKey: "orderItemId" });
ItemGroupItem.belongsTo(OrderItem, { foreignKey: "orderItemId" });

// Payment -> Account
Payment.belongsTo(Account, { foreignKey: "createdBy" });

// Payment -> Group
Payment.belongsTo(ItemGroup, { foreignKey: "groupId" });
ItemGroup.hasMany(Payment, { foreignKey: "groupId" });

// Abonos a pedidos de proveedor
SupplierOrderPayment.belongsTo(Account, { foreignKey: "createdBy" });
SupplierOrderPayment.belongsTo(Supplier, { foreignKey: "supplierId", as: "supplier" });
SupplierOrderPayment.belongsTo(SupplierOrder, {
  foreignKey: "supplierOrderId",
  as: "supplierOrder",
});
SupplierOrder.hasMany(SupplierOrderPayment, {
  foreignKey: "supplierOrderId",
  as: "payments",
  onDelete: "CASCADE",
});
SupplierOrderPayment.belongsTo(Expense, { foreignKey: "expenseId", as: "expense" });

SupplierPack.belongsTo(Account, { foreignKey: "createdBy" });
SupplierPack.belongsTo(Supplier, { foreignKey: "supplierId", as: "supplier" });
SupplierPack.hasMany(SupplierPackItem, {
  foreignKey: "packId",
  as: "items",
  onDelete: "CASCADE",
});
SupplierPackItem.belongsTo(SupplierPack, { foreignKey: "packId", as: "pack" });
SupplierPackItem.belongsTo(SupplierOrder, {
  foreignKey: "supplierOrderId",
  as: "supplierOrder",
});
SupplierPackItem.belongsTo(SupplierOrderItem, {
  foreignKey: "supplierOrderItemId",
  as: "orderItem",
});
SupplierOrderPayment.belongsTo(SupplierPack, {
  foreignKey: "supplierPackId",
  as: "pack",
});
SupplierPack.hasMany(SupplierOrderPayment, {
  foreignKey: "supplierPackId",
  as: "payments",
});

FinancialObligation.belongsTo(Account, { foreignKey: "createdBy" });
FinancialObligation.hasMany(ObligationPayment, {
  foreignKey: "obligationId",
  as: "payments",
  onDelete: "CASCADE",
});
ObligationPayment.belongsTo(FinancialObligation, {
  foreignKey: "obligationId",
  as: "obligation",
});
ObligationPayment.belongsTo(Account, { foreignKey: "createdBy" });

FinancialObligation.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

RecurringExpenseTemplate.belongsTo(Account, { foreignKey: "createdBy" });
RecurringExpenseTemplate.belongsTo(Store, { foreignKey: "storeId", as: "store" });
RecurringExpenseTemplate.hasMany(RecurringExpenseOccurrence, {
  foreignKey: "templateId",
  as: "occurrences",
  onDelete: "CASCADE",
});
RecurringExpenseOccurrence.belongsTo(RecurringExpenseTemplate, {
  foreignKey: "templateId",
  as: "template",
});
RecurringExpenseOccurrence.belongsTo(Expense, { foreignKey: "expenseId", as: "expense" });
RecurringExpenseOccurrence.belongsTo(Account, { foreignKey: "createdBy" });

/*
  ✅ RECOMENDACIONES (migrations):
  1) Evitar duplicar Income por Payment:
     UNIQUE(referenceType, referenceId) en ERP_finance_incomes

  2) Evitar que un item esté en 2 grupos:
     UNIQUE(orderItemId) en ERP_finance_item_group_items

  3) (Opcional) Evitar 2 pagos “idénticos” por error humano:
     index(groupId, date, amount)
*/
