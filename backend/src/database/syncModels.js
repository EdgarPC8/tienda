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
import { AppNews } from "../models/AppNews.js";
import { SriBillingSettings, ElectronicInvoice } from "../models/SriBilling.js";
import { sequelize } from "./connection.js";

const MODELS_TO_SYNC = [
  // ── Sin FK externas ──
  AppSettings,
  AppEntitlement,
  AppNews,
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

function quoteIdent(name) {
  return `\`${String(name).replace(/`/g, "``")}\``;
}

function keepScore(idx, fkNames) {
  let score = 0;
  if (idx.name === "PRIMARY") score += 1000;
  if (fkNames.has(`${idx.table}.${idx.name}`)) score += 500;
  if (idx.unique) score += 100;
  if (!/_\d+$/.test(idx.name)) score += 50;
  score -= idx.name.length / 1000;
  return score;
}

/**
 * Sequelize alter va dejando índices repetidos (sku, sku_2, sku_3…).
 * MySQL corta en 64. Esto deja uno por las mismas columnas antes del ALTER.
 */
export async function pruneDuplicateIndexes(db = sequelize) {
  const [rows] = await db.query(`
    SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX
  `);
  const [fks] = await db.query(`
    SELECT TABLE_NAME, CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  const fkNames = new Set(
    (fks || []).map((row) => `${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`),
  );

  const byIndex = new Map();
  for (const row of rows || []) {
    const key = `${row.TABLE_NAME}\0${row.INDEX_NAME}`;
    if (!byIndex.has(key)) {
      byIndex.set(key, {
        table: row.TABLE_NAME,
        name: row.INDEX_NAME,
        unique: Number(row.NON_UNIQUE) === 0,
        cols: [],
      });
    }
    byIndex.get(key).cols[Number(row.SEQ_IN_INDEX) - 1] = row.COLUMN_NAME;
  }

  const groups = new Map();
  for (const idx of byIndex.values()) {
    const sig = `${idx.table}\0${idx.cols.filter(Boolean).join(",")}`;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(idx);
  }

  let dropped = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const keep = [...list].sort(
      (a, b) => keepScore(b, fkNames) - keepScore(a, fkNames),
    )[0];
    for (const idx of list) {
      if (idx === keep || idx.name === "PRIMARY") continue;
      if (fkNames.has(`${idx.table}.${idx.name}`)) continue;
      try {
        await db.query(
          `ALTER TABLE ${quoteIdent(idx.table)} DROP INDEX ${quoteIdent(idx.name)}`,
        );
        dropped += 1;
        console.log(`Índice duplicado quitado: ${idx.table}.${idx.name}`);
      } catch (error) {
        console.warn(
          `No se pudo quitar ${idx.table}.${idx.name}: ${error?.parent?.sqlMessage || error.message}`,
        );
      }
    }
  }
  if (dropped) {
    console.log(`Índices duplicados eliminados: ${dropped}`);
  }
  return dropped;
}

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

  const syncOptions = { alter: force ? false : alter, force };
  await pruneDuplicateIndexes();

  for (const model of MODELS_TO_SYNC) {
    try {
      await model.sync(syncOptions);
    } catch (error) {
      const code = error?.parent?.code || error?.original?.code;
      if (code !== "ER_TOO_MANY_KEYS") throw error;
      console.warn(
        `Demasiados índices en ${model.tableName || model.name}. Se quitan duplicados y se reintenta.`,
      );
      await pruneDuplicateIndexes();
      await model.sync(syncOptions);
    }
  }

  await pruneDuplicateIndexes();

  return { skipped: false, models: MODELS_TO_SYNC.map((m) => m.tableName || m.name) };
}
