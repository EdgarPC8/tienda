import { promises as fs } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
import { Roles } from "../models/Roles.js";
import { Users } from "../models/Users.js";
import { Account, AccountRoles } from "../models/Account.js";
import { sequelize } from "./connection.js";
import { prepareTablesForRestore } from "./prepareTablesForRestore.js";
import { repairJsonFieldValue, deserializeJsonFields } from "../utils/jsonFieldUtils.js";
import { Notifications } from "../models/Notifications.js";

import {
  InventoryCategory,
  InventoryRecipe,
  InventoryMovement,
  InventoryProduct,
  InventoryUnit,
  InventoryBatch,
  HomeProduct,
  Store,
  Catalog,
  StoreExhibidor,
  StoreProduct,
  ProductCompareGroup,
  ProductCompareGroupItem,
  PricingTierGroup,
} from "../models/Inventory.js";
import { StoreStock } from "../models/StoreStock.js";
import {
  Customer,
  Order,
  OrderItem,
  Supplier,
  SupplierOrder,
  SupplierOrderItem,
  SupplierProductCode,
  OrderPaymentInstallment,
  SupplierOrderPaymentInstallment,
} from "../models/Orders.js";
import {
  Expense,
  Income,
  ItemGroup,
  ItemGroupItem,
  Payment,
  FinancialObligation,
  ObligationPayment,
  SupplierOrderPayment,
  SupplierPack,
  SupplierPackItem,
  RecurringExpenseTemplate,
  RecurringExpenseOccurrence,
} from "../models/Finance.js";
import {
  EditorTemplate,
  EditorTemplateGroup,
  EditorTemplateLayer,
  EditorLayerProp,
  EditorLayerBind,
  EditorDesign,
  EditorDesignLayerOverride,
} from "../models/Editor.js";
import { CashShift } from "../models/CashShift.js";
import { CashShiftMovement } from "../models/CashShiftMovement.js";
import { CashRegister } from "../models/CashRegister.js";
import { TaskPlan, TaskItem } from "../models/Tasks.js";
import {
  PublicidadCampaign,
  PublicidadPlaylistItem,
  PublicidadDevice,
} from "../models/Publicidad.js";
import { MediaAsset } from "../models/MediaAsset.js";
import { DocumentAttachment } from "../models/DocumentAttachment.js";
import {
  NotificationProgram,
  NotificationDispatchLog,
} from "../models/NotificationProgram.js";
import { License } from "../models/License.js";
import { Logs } from "../models/Logs.js";
import { UserData } from "../models/UserData.js";
import { AppSettings } from "../models/AppSettings.js";
import { AppEntitlement } from "../models/AppEntitlement.js";
import { SriBillingSettings, ElectronicInvoice } from "../models/SriBilling.js";

export const backupFilePath = resolve(__dirname, "backup.json");
export const backups = resolve(__dirname, "..", "backups");

/**
 * Tablas EdDeli incluidas en backup.json (guardar / recargar BD).
 * Solo EdDeli: no incluye módulos SoftEd ajenos (quiz/form/alumni/cv) aunque
 * compartan la misma BD MySQL.
 */
export const BACKUP_TABLE_ENTRIES = [
  { key: "Roles", model: Roles },
  { key: "Users", model: Users },
  { key: "Account", model: Account },
  { key: "AccountRoles", model: AccountRoles },
  { key: "UserData", model: UserData },
  { key: "Notifications", model: Notifications },
  { key: "NotificationProgram", model: NotificationProgram, sanitize: "NotificationProgram" },
  { key: "NotificationDispatchLog", model: NotificationDispatchLog },
  { key: "InventoryCategory", model: InventoryCategory, sanitize: "InventoryCategory" },
  { key: "InventoryUnit", model: InventoryUnit },
  { key: "InventoryProduct", model: InventoryProduct, sanitize: "InventoryProduct" },
  { key: "InventoryRecipe", model: InventoryRecipe },
  { key: "InventoryMovement", model: InventoryMovement },
  { key: "InventoryBatch", model: InventoryBatch },
  { key: "Store", model: Store },
  { key: "CashRegister", model: CashRegister },
  // StoreExhibidor tras Store y antes de StoreStock / StoreProduct (FK exhibidorId)
  { key: "StoreExhibidor", model: StoreExhibidor },
  { key: "CashShift", model: CashShift, sanitize: "CashShift" },
  { key: "CashShiftMovement", model: CashShiftMovement },
  { key: "Customer", model: Customer },
  { key: "Order", model: Order },
  { key: "OrderItem", model: OrderItem },
  { key: "OrderPaymentInstallment", model: OrderPaymentInstallment },
  { key: "Supplier", model: Supplier },
  { key: "SupplierOrder", model: SupplierOrder },
  { key: "SupplierOrderItem", model: SupplierOrderItem },
  { key: "SupplierOrderPaymentInstallment", model: SupplierOrderPaymentInstallment },
  { key: "SupplierProductCode", model: SupplierProductCode },
  { key: "TaskPlan", model: TaskPlan },
  { key: "TaskItem", model: TaskItem },
  { key: "PublicidadCampaign", model: PublicidadCampaign, sanitize: "PublicidadCampaign" },
  { key: "PublicidadPlaylistItem", model: PublicidadPlaylistItem, sanitize: "PublicidadPlaylistItem" },
  { key: "PublicidadDevice", model: PublicidadDevice },
  { key: "MediaAsset", model: MediaAsset, sanitize: "MediaAsset" },
  { key: "Expense", model: Expense },
  { key: "Income", model: Income },
  { key: "StoreStock", model: StoreStock },
  { key: "RecurringExpenseTemplate", model: RecurringExpenseTemplate },
  { key: "RecurringExpenseOccurrence", model: RecurringExpenseOccurrence },
  { key: "HomeProduct", model: HomeProduct },
  { key: "Catalog", model: Catalog },
  { key: "ProductCompareGroup", model: ProductCompareGroup },
  { key: "ProductCompareGroupItem", model: ProductCompareGroupItem },
  { key: "PricingTierGroup", model: PricingTierGroup, sanitize: "PricingTierGroup" },
  { key: "StoreProduct", model: StoreProduct },
  { key: "ItemGroup", model: ItemGroup },
  { key: "ItemGroupItem", model: ItemGroupItem },
  { key: "Payment", model: Payment },
  { key: "SupplierOrderPayment", model: SupplierOrderPayment },
  { key: "SupplierPack", model: SupplierPack },
  { key: "SupplierPackItem", model: SupplierPackItem },
  { key: "DocumentAttachment", model: DocumentAttachment },
  { key: "FinancialObligation", model: FinancialObligation },
  { key: "ObligationPayment", model: ObligationPayment },
  { key: "EditorTemplate", model: EditorTemplate },
  { key: "EditorTemplateGroup", model: EditorTemplateGroup },
  { key: "EditorTemplateLayer", model: EditorTemplateLayer },
  { key: "EditorLayerProp", model: EditorLayerProp },
  { key: "EditorLayerBind", model: EditorLayerBind },
  { key: "EditorDesign", model: EditorDesign },
  { key: "EditorDesignLayerOverride", model: EditorDesignLayerOverride },
  { key: "License", model: License },
  { key: "Logs", model: Logs },
  { key: "AppSettings", model: AppSettings },
  { key: "AppEntitlement", model: AppEntitlement },
  { key: "SriBillingSettings", model: SriBillingSettings },
  { key: "ElectronicInvoice", model: ElectronicInvoice },
];

export function summarizeBackupData(data) {
  const counts = {};
  for (const { key } of BACKUP_TABLE_ENTRIES) {
    const rows = data?.[key];
    counts[key] = Array.isArray(rows) ? rows.length : 0;
  }
  return counts;
}

/** Asegura que existan todas las claves del backup (arrays vacíos si faltan). */
export function ensureBackupShape(data) {
  const out = data && typeof data === "object" && !Array.isArray(data) ? { ...data } : {};
  for (const { key } of BACKUP_TABLE_ENTRIES) {
    if (!Array.isArray(out[key])) out[key] = [];
  }
  return out;
}

const VALID_MOVEMENT_REASONS = new Set([
  "ENTRADA_PRODUCCION",
  "ENTRADA_COMPRA",
  "ENTRADA_DEVOLUCION",
  "ENTRADA_OTRA",
  "SALIDA_VENTA",
  "SALIDA_YAPA",
  "SALIDA_DANIADO",
  "SALIDA_CADUCADO",
  "SALIDA_CONSUMO_INTERNO",
  "SALIDA_CONSUMO",
  "SALIDA_MERMA",
  "SALIDA_OTRA",
  "SALIDA_REEMPLAZO",
  "AJUSTE_ENTRADA",
  "AJUSTE_SALIDA",
  "PRODUCCION_FINAL",
]);

const MOVEMENT_REASON_ALIASES = {
  SALIDA_CONSUMO: "SALIDA_CONSUMO_INTERNO",
  SALIDA_MERMA: "SALIDA_DANIADO",
  PRODUCCION_FINAL: "ENTRADA_PRODUCCION",
  ENTRADA_DEVOLUCION: "ENTRADA_COMPRA",
};

/**
 * Parsea texto JSON de backup (archivo subido o backup.json).
 * Valida forma, normaliza claves y campos problemáticos.
 */
export function parseBackupJsonContent(content) {
  const stripped = String(content ?? "").replace(/^\uFEFF/, "").trim();
  if (!stripped) {
    throw new Error("El archivo está vacío");
  }

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    throw new Error(`JSON inválido: ${err.message}`);
  }

  if (parsed && typeof parsed === "object" && parsed.backup && typeof parsed.backup === "object") {
    parsed = parsed.backup;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "El JSON debe ser un objeto con tablas EdDeli (Roles, Users, Account, InventoryProduct, Order, …)",
    );
  }

  const shaped = ensureBackupShape(parsed);
  const hasRows = BACKUP_TABLE_ENTRIES.some(
    ({ key }) => Array.isArray(shaped[key]) && shaped[key].length > 0,
  );
  if (!hasRows) {
    throw new Error("El backup no contiene datos en ninguna tabla reconocida");
  }

  return prepareBackupForRestore(shaped);
}

/** Escribe backup.json normalizado en disco. */
export async function writeBackupToDisk(jsonData) {
  const normalized = prepareBackupForRestore(ensureBackupShape(jsonData));
  await fs.writeFile(backupFilePath, JSON.stringify(normalized, null, 2), "utf8");
  return { path: backupFilePath, tables: summarizeBackupData(normalized) };
}

const sanitizeRows = (rows, config = {}) => {
  if (!Array.isArray(rows)) return rows;
  const jsonStringFields = config.jsonStringFields || [];
  const emptyArrayToNull = config.emptyArrayToNull !== false;
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const next = { ...row };
    for (const field of jsonStringFields) {
      if (field in next) {
        next[field] = repairJsonFieldValue(next[field], { emptyArrayToNull });
      }
    }
    return next;
  });
};

/** Normaliza todos los campos JSON del backup (quita strings anidados y slashes corruptos). */
function sanitizeBackupJsonFields(data) {
  const out = { ...data };
  for (const [tableKey, config] of Object.entries(SANITIZE_CONFIG)) {
    if (Array.isArray(out[tableKey])) {
      out[tableKey] = sanitizeRows(out[tableKey], config);
    }
  }
  return out;
}

const SANITIZE_CONFIG = {
  InventoryCategory: {
    jsonStringFields: ["packageTiers", "mixMatchProductIds"],
  },
  InventoryProduct: {
    jsonStringFields: ["wholesaleRules", "packageTiers"],
  },
  PricingTierGroup: {
    jsonStringFields: ["packageTiers", "productIds"],
  },
  CashShift: {
    jsonStringFields: ["openingCashCounts", "closingCashCounts"],
  },
  NotificationProgram: {
    jsonStringFields: ["targetRoleIds"],
  },
  MediaAsset: {
    jsonStringFields: ["metadata"],
  },
  PublicidadCampaign: {
    jsonStringFields: ["screenIds", "musicTracks"],
    emptyArrayToNull: false,
  },
  PublicidadPlaylistItem: {
    jsonStringFields: ["menuItems"],
  },
};

const BULK_OPT = { returning: false };
const BULK_CHUNK_SIZE = 400;

async function bulkCreateRows(model, rows, opt) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return;
  for (let i = 0; i < list.length; i += BULK_CHUNK_SIZE) {
    await model.bulkCreate(list.slice(i, i + BULK_CHUNK_SIZE), opt);
  }
}

/** Resumen del backup.json en disco (solo lectura; no crea archivos). */
export async function readBackupFileSummary() {
  try {
    await fs.access(backupFilePath);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        exists: false,
        path: backupFilePath,
        sizeBytes: 0,
        sizeMB: 0,
        counts: {},
        totalRows: 0,
      };
    }
    throw error;
  }

  const st = await fs.stat(backupFilePath);
  const raw = await fs.readFile(backupFilePath, "utf8");
  const counts = summarizeBackupData(parseBackupJsonContent(raw));
  const totalRows = Object.values(counts).reduce((a, n) => a + n, 0);
  return {
    exists: true,
    path: backupFilePath,
    sizeBytes: st.size,
    sizeMB: Number((st.size / 1024 / 1024).toFixed(2)),
    modifiedAt: st.mtime.toISOString(),
    counts,
    totalRows,
  };
}

/** Resumen de la última copia guardada (panel de control). */
export async function getPanelBackupSummary() {
  const mainRaw = await readBackupFileSummary();
  const main = mainRaw.exists
    ? {
        filename: "backup.json",
        modifiedAt: mainRaw.modifiedAt ?? null,
        sizeBytes: mainRaw.sizeBytes,
        totalRows: mainRaw.totalRows,
      }
    : null;

  const stored = await listStoredBackups();
  const latestStored = stored[0] ?? null;

  let lastBackup = null;
  const candidates = [];
  if (main?.modifiedAt) candidates.push({ ...main, kind: "main" });
  if (latestStored) {
    candidates.push({
      filename: latestStored.filename,
      modifiedAt: latestStored.modifiedAt,
      sizeBytes: latestStored.sizeBytes,
      totalRows: latestStored.totalRows,
      kind: "stored",
    });
  }
  if (candidates.length) {
    candidates.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    const pick = candidates[0];
    lastBackup = {
      filename: pick.filename,
      modifiedAt: pick.modifiedAt,
      sizeBytes: pick.sizeBytes,
      totalRows: pick.totalRows,
      isMainFile: pick.kind === "main",
    };
  }

  return {
    hasBackup: Boolean(lastBackup),
    lastBackup,
    mainBackup: main,
  };
}

/**
 * Exige backup.json con datos reales antes de reset/importar.
 * No genera un JSON vacío (evita resetear la BD con solo 4 roles).
 */
export async function requireValidBackupFile() {
  const summary = await readBackupFileSummary();
  if (!summary.exists) {
    throw new Error(
      `No existe backup.json en ${backupFilePath}. ` +
        "Cópialo desde tu PC (scp) o súbelo en Comandos → Subir backup.json.",
    );
  }
  if ((summary.counts.Users ?? 0) === 0 && (summary.counts.InventoryProduct ?? 0) === 0) {
    const kb = (summary.sizeBytes / 1024).toFixed(0);
    throw new Error(
      `backup.json no tiene usuarios ni productos (${summary.totalRows} filas, ${kb} KB). ` +
        "Reemplázalo con tu copia real (~3 MB desde tu PC) antes de resetear.",
    );
  }
  return summary;
}

/** Evita FK rotas al restaurar backups viejos sin turnos de caja. */
export function prepareBackupForRestore(jsonData) {
  const data = sanitizeBackupJsonFields({ ...jsonData });

  const shifts = Array.isArray(data.CashShift) ? data.CashShift : [];
  const validShiftIds = new Set(shifts.map((s) => s?.id).filter((id) => id != null));

  if (Array.isArray(data.Order)) {
    data.Order = data.Order.map((order) => {
      if (!order || order.shiftId == null) return order;
      if (!validShiftIds.has(order.shiftId)) {
        return { ...order, shiftId: null };
      }
      return order;
    });
  }

  if (Array.isArray(data.CashShiftMovement)) {
    data.CashShiftMovement = data.CashShiftMovement.map((row) => {
      if (!row || row.shiftId == null) return row;
      if (!validShiftIds.has(row.shiftId)) return null;
      return row;
    }).filter(Boolean);
  }

  if (Array.isArray(data.InventoryMovement)) {
    data.InventoryMovement = data.InventoryMovement.map((row) => {
      if (!row || row.reason == null) return row;
      let reason = row.reason;
      if (!VALID_MOVEMENT_REASONS.has(reason)) {
        reason = MOVEMENT_REASON_ALIASES[reason] || null;
      }
      if (reason && !VALID_MOVEMENT_REASONS.has(reason)) reason = null;
      return reason === row.reason ? row : { ...row, reason };
    });
  }

  if (Array.isArray(data.AppSettings)) {
    data.AppSettings = data.AppSettings.map((row) => {
      if (!row || typeof row !== "object") return row;
      const next = { ...row };
      const tz = next.timezone != null ? String(next.timezone).trim() : "";
      if (!tz) next.timezone = "America/Guayaquil";
      // Backups antiguos sin flags de vista pública → defaults seguros (visibles).
      if (next.showPublicCatalog === undefined || next.showPublicCatalog === null) {
        next.showPublicCatalog = true;
      }
      if (next.showPublicStoresPropia === undefined || next.showPublicStoresPropia === null) {
        next.showPublicStoresPropia = true;
      }
      if (next.showPublicStoresVitrina === undefined || next.showPublicStoresVitrina === null) {
        next.showPublicStoresVitrina = true;
      }
      // Store: un solo local (aunque el backup venga de Eddeli con multistock).
      next.multiStockEnabled = false;
      return next;
    });
  }

  if (Array.isArray(data.Store)) {
    data.Store = data.Store.map((row) => {
      if (!row || typeof row !== "object") return row;
      const next = { ...row };
      // Backups sin locationKind / códigos SRI → defaults (revisar propias a mano).
      const kind = String(next.locationKind || "").trim().toLowerCase();
      next.locationKind = kind === "propia" ? "propia" : "vitrina";
      if (next.establishmentCode == null || String(next.establishmentCode).trim() === "") {
        next.establishmentCode = "001";
      }
      if (next.emissionPointCode == null || String(next.emissionPointCode).trim() === "") {
        next.emissionPointCode = "001";
      }
      return next;
    });
  }

  // Backups viejos sin StoreExhibidor: anula exhibidorId huérfanos.
  const exhibidores = Array.isArray(data.StoreExhibidor) ? data.StoreExhibidor : [];
  const validExhibidorIds = new Set(exhibidores.map((e) => e?.id).filter((id) => id != null));
  if (Array.isArray(data.StoreProduct)) {
    data.StoreProduct = data.StoreProduct.map((row) => {
      if (!row || row.exhibidorId == null) return row;
      if (!validExhibidorIds.has(row.exhibidorId)) {
        return { ...row, exhibidorId: null };
      }
      return row;
    });
  }
  if (Array.isArray(data.StoreStock)) {
    data.StoreStock = data.StoreStock.map((row) => {
      if (!row || row.exhibidorId == null) return row;
      if (!validExhibidorIds.has(row.exhibidorId)) {
        return { ...row, exhibidorId: null };
      }
      return row;
    });
  }

  return data;
}

async function setForeignKeyChecks(enabled, transaction) {
  const dialect = sequelize.getDialect?.() || "mysql";
  if (dialect !== "mysql") return;
  const value = enabled ? 1 : 0;
  await sequelize.query(`SET FOREIGN_KEY_CHECKS = ${value}`, { transaction });
}

/** Crea backup.json vacío si no existe (p. ej. tras git clone). */
export async function ensureBackupFileExists() {
  try {
    await fs.access(backupFilePath);
    return { created: false, path: backupFilePath };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const empty = ensureBackupShape({});
  empty.Roles = [
    { id: 1, name: "Programador" },
    { id: 2, name: "Administrador" },
    { id: 3, name: "Empleado" },
  ];
  const payload = JSON.stringify(empty, null, 2);
  await fs.writeFile(backupFilePath, payload, "utf8");
  console.log("backup.json no existía: creado en src/database/backup.json");
  return { created: true, path: backupFilePath };
}

/** Borra tablas, las recrea e importa backup.json (Comandos / scripts). */
export async function recreateDatabaseFromBackup({ forceFull = false } = {}) {
  await requireValidBackupFile();

  const prep = await prepareTablesForRestore(BACKUP_TABLE_ENTRIES, { forceFull });
  console.log(
    `📋 Preparación BD: modo=${prep.mode}` +
      (prep.recreated?.length ? `, recreadas=[${prep.recreated.join(", ")}]` : "") +
      (prep.truncated?.length ? `, truncadas=${prep.truncated.length} tablas` : ""),
  );

  const insertResult = await insertData();
  return {
    ...insertResult,
    resetMode: prep.mode,
    tablesRecreated: prep.recreated || [],
    tablesTruncated: prep.truncated || [],
    schemaAudit: prep.schemaAudit,
  };
}

/** Respaldo / restore solo tablas EdDeli (inventario, pedidos, finanzas, editor, notificaciones, cuentas). Quiz, forms, alumni, CV → softed/backend. */
export const insertData = async () => {
  await requireValidBackupFile();

  const raw = await fs.readFile(backupFilePath, "utf8");
  const jsonData = parseBackupJsonContent(raw);
  const counts = summarizeBackupData(jsonData);

  const t = await sequelize.transaction();
  try {
    await setForeignKeyChecks(false, t);
    const opt = { ...BULK_OPT, transaction: t };

    for (const entry of BACKUP_TABLE_ENTRIES) {
      let rows = jsonData[entry.key];
      if (entry.sanitize && SANITIZE_CONFIG[entry.sanitize]) {
        rows = deserializeJsonFields(rows, SANITIZE_CONFIG[entry.sanitize]);
      }
      try {
        await bulkCreateRows(entry.model, rows, opt);
      } catch (err) {
        const detail = err?.parent?.sqlMessage || err?.message || String(err);
        throw new Error(`Error al importar tabla ${entry.key}: ${detail}`);
      }
    }

    await setForeignKeyChecks(true, t);
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }

  console.log("Datos insertados correctamente desde backup.json. Filas:", counts);
  return { ok: true, tables: counts };
};

/**
 * @param {{ updateMainBackup?: boolean }} options
 * - updateMainBackup true (default): copia con fecha en src/backups/ y actualiza src/database/backup.json
 * - updateMainBackup false: solo copia con fecha en src/backups/ (antes de recargar BD)
 */
export const saveBackup = async ({ updateMainBackup = true } = {}) => {
  try {
    const fetched = await Promise.all(
      BACKUP_TABLE_ENTRIES.map((entry) => entry.model.findAll({ raw: true })),
    );

    const backupData = {};
    BACKUP_TABLE_ENTRIES.forEach((entry, index) => {
      let rows = fetched[index];
      if (entry.sanitize && SANITIZE_CONFIG[entry.sanitize]) {
        rows = sanitizeRows(rows, SANITIZE_CONFIG[entry.sanitize]);
      }
      backupData[entry.key] = rows;
    });

    const normalized = prepareBackupForRestore(ensureBackupShape(backupData));
    const counts = summarizeBackupData(normalized);

    await fs.mkdir(backups, { recursive: true });

    const now = new Date();
    const pad = (n) => n.toString().padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

    const backupFileName = `backup-${timestamp}.json`;
    const backupPath = resolve(backups, backupFileName);

    const payload = JSON.stringify(normalized, null, 2);
    await fs.writeFile(backupPath, payload, "utf8");
    if (updateMainBackup) {
      await fs.writeFile(backupFilePath, payload, "utf8");
    }

    console.log("Backup guardado en:", backupPath);
    if (updateMainBackup) {
      console.log("backup.json principal actualizado:", backupFilePath);
    }
    console.log("Filas por tabla:", counts);
    return { backupPath, counts, mainBackupUpdated: updateMainBackup };
  } catch (error) {
    console.error("Error al guardar el backup:", error);
    throw error;
  }
};

/** Acepta backup-FECHA.json y legacy backup-eddeli-FECHA.json */
const STORED_BACKUP_NAME = /^backup(?:-eddeli)?-[\w\-:.]+\.json$/i;

/** Valida nombre y devuelve ruta absoluta dentro de src/backups/. */
export function resolveStoredBackupPath(filename) {
  const base = String(filename || "").split(/[/\\]/).pop();
  if (!base || !STORED_BACKUP_NAME.test(base)) {
    throw new Error("Nombre de archivo de backup no válido");
  }
  const full = resolve(backups, base);
  if (!full.startsWith(backups)) {
    throw new Error("Ruta de backup no permitida");
  }
  return full;
}

async function summarizeBackupAtPath(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const counts = summarizeBackupData(parseBackupJsonContent(raw));
    const totalRows = Object.values(counts).reduce((a, n) => a + n, 0);
    return { counts, totalRows, valid: true };
  } catch {
    return { counts: {}, totalRows: 0, valid: false };
  }
}

/** Lista copias con fecha en src/backups/ (más recientes primero). */
export async function listStoredBackups() {
  await fs.mkdir(backups, { recursive: true });
  const names = await fs.readdir(backups);
  const files = [];

  for (const name of names) {
    if (!name.endsWith(".json") || !STORED_BACKUP_NAME.test(name)) continue;
    const filePath = resolve(backups, name);
    let st;
    try {
      st = await fs.stat(filePath);
      if (!st.isFile()) continue;
    } catch {
      continue;
    }

    const { counts, totalRows, valid } = await summarizeBackupAtPath(filePath);
    files.push({
      filename: name,
      sizeBytes: st.size,
      sizeMB: Number((st.size / 1024 / 1024).toFixed(2)),
      modifiedAt: st.mtime.toISOString(),
      counts,
      totalRows,
      valid,
    });
  }

  files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
  return files;
}

/** Resumen del backup fijo + listado de copias guardadas. */
export async function getBackupsWorkbench() {
  const mainRaw = await readBackupFileSummary();
  let mainModifiedAt = null;
  if (mainRaw.exists) {
    try {
      const st = await fs.stat(backupFilePath);
      mainModifiedAt = st.mtime.toISOString();
    } catch {
      /* ignore */
    }
  }

  const main = {
    ...mainRaw,
    filename: "backup.json",
    isMain: true,
    modifiedAt: mainModifiedAt,
    valid: mainRaw.exists && mainRaw.totalRows > 0,
  };

  const stored = await listStoredBackups();
  return { main, stored };
}

/** Copia un backup guardado a backup.json (fijo). */
export async function setMainBackupFromStored(filename) {
  const filePath = resolveStoredBackupPath(filename);
  await fs.access(filePath);
  const raw = await fs.readFile(filePath, "utf8");
  const normalized = parseBackupJsonContent(raw);
  return writeBackupToDisk(normalized);
}

/** Elimina una copia en src/backups/ (no el backup.json fijo). */
export async function deleteStoredBackup(filename) {
  const filePath = resolveStoredBackupPath(filename);
  await fs.unlink(filePath);
  return { deleted: filePath };
}

/**
 * Borra todas las copias con fecha en src/backups/ y guarda una sola nueva desde la BD.
 * No modifica backup.json fijo.
 */
export async function pruneStoredBackupsAndSaveFresh() {
  await fs.mkdir(backups, { recursive: true });
  const names = await fs.readdir(backups);

  let deletedCount = 0;
  for (const name of names) {
    if (!name.endsWith(".json") || !STORED_BACKUP_NAME.test(name)) continue;
    await fs.unlink(resolve(backups, name));
    deletedCount += 1;
  }

  const { backupPath, counts } = await saveBackup({ updateMainBackup: false });
  const filename = backupPath.split(/[/\\]/).pop();

  return { deletedCount, filename, backupPath, counts };
}

/** Descarga JSON de respaldo (GET …/comands/downloadBackup). */
export const downloadBackup = async (req, res) => {
  try {
    const { backupPath } = await saveBackup();
    const filename = backupPath.split(/[/\\]/).pop() || `backup-${Date.now()}.json`;
    res.download(backupPath, filename, (err) => {
      if (err) {
        console.error("Error al enviar el archivo:", err);
        res.status(500).send("Error al enviar el archivo.");
      }
    });
  } catch (error) {
    console.error("Error al realizar el backup:", error);
    res.status(500).send("Error al realizar el backup.");
  }
};
