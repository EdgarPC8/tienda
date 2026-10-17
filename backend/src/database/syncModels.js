import { Account, AccountRoles } from "../models/Account.js";
import { Users } from "../models/Users.js";
import { Roles } from "../models/Roles.js";
import { SupplierAccount } from "../models/SupplierAccount.js";
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
  SupplierAccount,

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
 * Snapshot liviano: tablas → columnas con tipo/null/default.
 * Sirve para informar qué cambió tras sync.
 */
export async function captureSchemaSnapshot(db = sequelize) {
  const [rows] = await db.query(`
    SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName,
           COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable,
           COLUMN_DEFAULT AS columnDefault, EXTRA AS extra
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `);
  const tables = new Map();
  for (const row of rows || []) {
    if (!tables.has(row.tableName)) tables.set(row.tableName, new Map());
    tables.get(row.tableName).set(row.columnName, {
      type: row.columnType,
      nullable: row.nullable,
      default: row.columnDefault,
      extra: row.extra,
    });
  }
  return tables;
}

function colSig(col) {
  if (!col) return "";
  return `${col.type}|${col.nullable}|${col.default ?? ""}|${col.extra || ""}`;
}

/**
 * Compara dos snapshots y devuelve cambios legibles.
 */
export function diffSchemaSnapshots(before, after) {
  const createdTables = [];
  const droppedTables = [];
  const tableChanges = [];

  const beforeNames = new Set(before.keys());
  const afterNames = new Set(after.keys());

  for (const name of afterNames) {
    if (!beforeNames.has(name)) createdTables.push(name);
  }
  for (const name of beforeNames) {
    if (!afterNames.has(name)) droppedTables.push(name);
  }

  for (const tableName of afterNames) {
    if (!beforeNames.has(tableName)) continue;
    const prev = before.get(tableName);
    const next = after.get(tableName);
    const added = [];
    const removed = [];
    const changed = [];

    for (const [col, meta] of next) {
      if (!prev.has(col)) {
        added.push({ column: col, ...meta });
      } else if (colSig(prev.get(col)) !== colSig(meta)) {
        changed.push({ column: col, from: prev.get(col), to: meta });
      }
    }
    for (const col of prev.keys()) {
      if (!next.has(col)) removed.push(col);
    }

    if (added.length || removed.length || changed.length) {
      tableChanges.push({ table: tableName, added, removed, changed });
    }
  }

  return { createdTables, droppedTables, tableChanges };
}

export function printSchemaDiffReport(diff, { dbName } = {}) {
  const { createdTables, droppedTables, tableChanges } = diff;
  const hasChanges =
    createdTables.length || droppedTables.length || tableChanges.length;

  console.log("");
  console.log("═══ Informe de esquema" + (dbName ? ` · BD \`${dbName}\`` : "") + " ═══");

  if (!hasChanges) {
    console.log("Sin cambios: tablas y columnas ya coincidían con los modelos.");
    console.log("══════════════════════════════════════");
    return { hasChanges: false };
  }

  if (createdTables.length) {
    console.log(`\nTablas nuevas (${createdTables.length}):`);
    for (const t of createdTables) console.log(`  + ${t}`);
  }
  if (droppedTables.length) {
    console.log(`\nTablas ya no presentes en BD (${droppedTables.length}):`);
    for (const t of droppedTables) console.log(`  - ${t}`);
  }

  for (const ch of tableChanges) {
    console.log(`\nTabla \`${ch.table}\`:`);
    for (const col of ch.added) {
      console.log(
        `  + columna ${col.column}  (${col.type}${col.nullable === "YES" ? ", NULL" : ", NOT NULL"})`,
      );
    }
    for (const col of ch.removed) {
      console.log(`  - columna ${col}  (sigue en BD; Sequelize alter no la borra)`);
    }
    for (const col of ch.changed) {
      console.log(
        `  ~ columna ${col.column}: ${col.from.type} → ${col.to.type}` +
          (col.from.nullable !== col.to.nullable
            ? ` · null ${col.from.nullable}→${col.to.nullable}`
            : ""),
      );
    }
  }

  console.log("\n══════════════════════════════════════");
  return { hasChanges: true };
}

/**
 * Parches explícitos que deben existir aunque alter tarde o falle a medias.
 * Ej.: regularización de diferencia de caja (supervisión).
 */
export async function ensureCriticalSchemaPatches(db = sequelize) {
  const patches = [
    {
      table: "ERP_cash_shifts",
      columns: [
        ["differenceResolution", "VARCHAR(20) NULL"],
        ["differenceResolvedAt", "DATETIME NULL"],
        ["differenceFinanceId", "INT NULL"],
        ["differenceFinanceType", "VARCHAR(20) NULL"],
      ],
    },
  ];

  const applied = [];
  for (const { table, columns } of patches) {
    const [[exists]] = await db.query(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      { replacements: [table] },
    );
    if (!Number(exists?.c || 0)) continue;

    for (const [name, ddl] of columns) {
      const [rows] = await db.query(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        { replacements: [table, name] },
      );
      if (Number(rows?.[0]?.c || 0) > 0) continue;
      await db.query(
        `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(name)} ${ddl}`,
      );
      applied.push(`${table}.${name}`);
      console.log(`Parche: + ${table}.${name}`);
    }
  }
  return applied;
}

/**
 * Resuelve el nombre real de tabla (string o { tableName }).
 */
function resolveTableName(model) {
  const t = model.getTableName?.() ?? model.tableName ?? model.name;
  if (t && typeof t === "object") return t.tableName || t.name;
  return t;
}

/**
 * Crea tablas faltantes y añade columnas nuevas del modelo.
 * Evita `sync({ alter: true })` global: en MySQL reescribe tablas grandes y se cuelga.
 * No elimina columnas ni cambia tipos agresivamente (seguro en producción).
 */
async function syncModelSafe(model, { verbose = true } = {}) {
  const qi = sequelize.getQueryInterface();
  const table = resolveTableName(model);
  let created = false;
  let addedCols = [];

  let desc;
  try {
    desc = await qi.describeTable(table);
  } catch {
    desc = null;
  }

  if (!desc) {
    await model.sync({ alter: false, force: false });
    created = true;
    return { table, created, addedCols, status: "created" };
  }

  const attrs = model.rawAttributes || {};
  for (const [attrName, attr] of Object.entries(attrs)) {
    if (attrName === "id" && desc.id) continue;
    const col = attr.field || attrName;
    if (desc[col] || desc[attrName]) continue;
    try {
      await qi.addColumn(table, col, attr);
      addedCols.push(col);
    } catch (error) {
      const msg = error?.parent?.sqlMessage || error.message || "";
      // Columna creada en paralelo / ya existe
      if (/Duplicate column|ER_DUP_FIELDNAME/i.test(msg)) continue;
      throw error;
    }
  }

  return {
    table,
    created,
    addedCols,
    status: addedCols.length ? "columns_added" : "ok",
  };
}

/**
 * Alinea tablas con los modelos Sequelize.
 * En desarrollo normal NO se ejecuta: usa `npm run db:sync` tras cambiar modelos.
 * Imprime progreso por tabla y un informe de columnas/tablas nuevas o cambiadas.
 */
export async function syncDatabaseSchema({
  alter = isDbAlterSyncEnabled(),
  force = false,
  verbose = true,
} = {}) {
  if (!alter && !force) {
    return { skipped: true, reason: "DB_SYNC_ALTER no está activo" };
  }

  const [[dbRow]] = await sequelize.query(`SELECT DATABASE() AS db`);
  const dbName = dbRow?.db || process.env.DB_NAME || "?";

  const before = await captureSchemaSnapshot();

  if (verbose) {
    console.log(
      `\nSincronizando esquema → BD \`${dbName}\` (${MODELS_TO_SYNC.length} modelos)` +
        (force ? " [FORCE recreate]" : " [crear tablas + columnas faltantes]") +
        "…",
    );
  }

  await pruneDuplicateIndexes();

  const synced = [];
  const failed = [];
  const perTable = [];
  let i = 0;

  for (const model of MODELS_TO_SYNC) {
    i += 1;
    const table = resolveTableName(model);
    if (verbose) {
      process.stdout.write(`  [${i}/${MODELS_TO_SYNC.length}] ${table}… `);
    }
    try {
      if (force) {
        await model.sync({ force: true });
        perTable.push({ table, status: "force_recreated" });
        if (verbose) console.log("recreada");
      } else {
        const result = await syncModelSafe(model, { verbose });
        perTable.push(result);
        if (verbose) {
          if (result.created) console.log("tabla nueva");
          else if (result.addedCols.length) {
            console.log(`ok (+${result.addedCols.length} col)`);
          } else console.log("ok");
        }
      }
      synced.push(table);
    } catch (error) {
      const code = error?.parent?.code || error?.original?.code;
      if (code === "ER_TOO_MANY_KEYS") {
        if (verbose) console.log("reintento (índices)");
        console.warn(
          `Demasiados índices en ${table}. Se quitan duplicados y se reintenta.`,
        );
        await pruneDuplicateIndexes();
        const result = await syncModelSafe(model, { verbose });
        perTable.push(result);
        synced.push(table);
        if (verbose) console.log(`  [${i}/${MODELS_TO_SYNC.length}] ${table}… ok`);
        continue;
      }
      failed.push({ table, message: error?.parent?.sqlMessage || error.message });
      if (verbose) console.log("ERROR");
      console.warn(`  ⚠ ${table}: ${error?.parent?.sqlMessage || error.message}`);
    }
  }

  await pruneDuplicateIndexes();
  const patches = await ensureCriticalSchemaPatches();

  const after = await captureSchemaSnapshot();
  const diff = diffSchemaSnapshots(before, after);
  if (verbose) printSchemaDiffReport(diff, { dbName });

  return {
    skipped: false,
    dbName,
    models: synced,
    failed,
    patches,
    perTable,
    diff,
  };
}
