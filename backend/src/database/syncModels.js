import { Account, AccountRoles } from "../models/Account.js";
import { Users } from "../models/Users.js";
import { Roles } from "../models/Roles.js";
import { UserData } from "../models/UserData.js";
import { License } from "../models/License.js";
import { Logs } from "../models/Logs.js";
import { CashShift } from "../models/CashShift.js";
import { CashShiftMovement } from "../models/CashShiftMovement.js";
import { InventoryProduct, InventoryMovement, InventoryCategory, InventoryUnit, InventoryRecipe, HomeProduct, Catalog, Store, StoreExhibidor, StoreProduct, ProductCompareGroup, ProductCompareGroupItem, PricingTierGroup, InventoryBatch } from "../models/Inventory.js";
import { StoreStock } from "../models/StoreStock.js";
import { CashRegister } from "../models/CashRegister.js";
import { Customer, Order, OrderItem, Supplier, SupplierOrder, SupplierOrderItem, SupplierProductCode, OrderPaymentInstallment, SupplierOrderPaymentInstallment } from "../models/Orders.js";
import { TaskPlan, TaskItem } from "../models/Tasks.js";
import { PublicidadCampaign, PublicidadPlaylistItem, PublicidadDevice } from "../models/Publicidad.js";
import { MediaAsset } from "../models/MediaAsset.js";
import { ItemGroup, ItemGroupItem, FinancialObligation, ObligationPayment, Income, Expense, Payment, SupplierOrderPayment, SupplierPack, SupplierPackItem, RecurringExpenseTemplate, RecurringExpenseOccurrence } from "../models/Finance.js";
import { DocumentAttachment } from "../models/DocumentAttachment.js";
import { NotificationProgram, NotificationDispatchLog } from "../models/NotificationProgram.js";
import { Notifications } from "../models/Notifications.js";
import { EditorTemplate, EditorTemplateGroup, EditorTemplateLayer, EditorLayerProp, EditorLayerBind, EditorDesign, EditorDesignLayerOverride } from "../models/Editor.js";
import { AppSettings } from "../models/AppSettings.js";
import { AppEntitlement } from "../models/AppEntitlement.js";
import { SriBillingSettings, ElectronicInvoice } from "../models/SriBilling.js";

const MODELS_TO_SYNC = [
  // ── Sin FK externas ──
  AppSettings,
  AppEntitlement,
  SriBillingSettings,
  ElectronicInvoice,
  Users,
  Roles,
  Customer,
  InventoryUnit,
  InventoryCategory,
  Supplier,
  MediaAsset,
  PublicidadCampaign,
  NotificationProgram,
  TaskPlan,
  ProductCompareGroup,
  License,
  Logs,

  // ── FK a tablas del grupo anterior ──
  Account,
  UserData,
  Store,
  CashRegister,
  InventoryProduct,
  SupplierProductCode, // FK → suppliers + inventory_products
  CashShift,
  Order,
  SupplierOrder,
  PublicidadDevice,
  Notifications,
  TaskItem,
  AccountRoles,

  // ── FK a tablas del grupo anterior ──
  InventoryMovement,
  InventoryBatch,
  InventoryRecipe,
  HomeProduct,
  StoreExhibidor,
  StoreStock,
  StoreProduct,
  Catalog,
  ProductCompareGroupItem,
  PricingTierGroup,
  PublicidadPlaylistItem,
  OrderItem,
  OrderPaymentInstallment,
  SupplierOrderItem,
  SupplierOrderPaymentInstallment,
  CashShiftMovement,
  NotificationDispatchLog,

  // ── Editor ──
  EditorTemplate,
  EditorTemplateGroup,
  EditorTemplateLayer,
  EditorLayerProp,
  EditorLayerBind,
  EditorDesign,
  EditorDesignLayerOverride,

  // ── Finance ──
  ItemGroup,
  Income,
  Expense,
  FinancialObligation,
  RecurringExpenseTemplate,
  Payment,
  ItemGroupItem,
  SupplierPack,
  SupplierPackItem,
  SupplierOrderPayment,
  ObligationPayment,
  RecurringExpenseOccurrence,
  DocumentAttachment,
];

/** true solo si DB_SYNC_ALTER=1|true|yes (evita ALTER TABLE en cada reinicio de nodemon). */
export function isDbAlterSyncEnabled() {
  const v = String(process.env.DB_SYNC_ALTER || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Alinea tablas con los modelos Sequelize.
 * En desarrollo normal NO se ejecuta: usa `npm run db:sync` tras cambiar modelos.
 */
export async function syncDatabaseSchema({ alter = isDbAlterSyncEnabled(), force = false } = {}) {
  if (!alter && !force) {
    return { skipped: true, reason: "DB_SYNC_ALTER no está activo" };
  }

  for (const model of MODELS_TO_SYNC) {
    await model.sync({ alter: force ? false : alter, force });
  }

  return { skipped: false, models: MODELS_TO_SYNC.map((m) => m.tableName || m.name) };
}
