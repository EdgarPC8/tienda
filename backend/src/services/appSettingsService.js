import { AppSettings } from "../models/AppSettings.js";
import { sequelize } from "../database/connection.js";
import { DataTypes } from "sequelize";
import fs from "fs";
import path from "path";
import fileDirName from "../libs/file-dirname.js";
import {
  normalizeMoneyDisplayDecimals,
  normalizeMoneyRoundingMode,
} from "../utils/moneyPrecision.js";
import {
  DEFAULT_RECEIPT_DETAIL_SETTINGS,
  normalizeReceiptDetailSettings,
  serializeReceiptDetailSettings,
} from "../utils/receiptDetailSettings.js";
import {
  DEFAULT_THEME_PALETTE,
  normalizeThemePalette,
  serializeThemePalette,
} from "../utils/themePaletteSettings.js";

const { __dirname } = fileDirName(import.meta);
const IMG_BASE = path.resolve(__dirname, "../img");

export const DEFAULT_APP_SETTINGS = {
  id: 1,
  name: "Tienda",
  alias: "Tienda",
  version: "1.0.0",
  description: "Aplicación sin configurar. Definí nombre, logo y opciones en Sistema → Configuración.",
  author: "Raptor",
  logoPath: null,
  iconPath: null,
  phone: "",
  socialWhatsapp: "",
  socialFacebook: "",
  socialInstagram: "",
  socialTiktok: "",
  socialEmail: "",
  mediaFolderPrefix: "sistema",
  cajaQuickCategoryMatch: "",
  walkInCustomerLabel: "Consumidor Final",
  timezone: "America/Guayaquil",
  showPublicCatalog: false,
  showPublicStoresPropia: false,
  showPublicStoresVitrina: false,
  // Tienda: un solo stock general (sin varios locales). Multistock se activa por config/gestor.
  multiStockEnabled: false,
  showProductCostInSelect: false,
  moneyDisplayDecimals: 2,
  moneyRoundingMode: "up",
  ordersAllowDeliverStockAdjust: true,
  suggestOpenPackOnPosShortage: false,
  cajaAllowCreateProductFromSelect: false,
  cajaAllowCreateProductFromScan: false,
  cajaAllowEditProductFromCart: false,
  cajaSuggestUpdateProductPrice: false,
  receiptDetailSettings: { ...DEFAULT_RECEIPT_DETAIL_SETTINGS },
  themePalette: normalizeThemePalette(DEFAULT_THEME_PALETTE),
};

let cache = { ...DEFAULT_APP_SETTINGS };

export function getAppSettingsSync() {
  return cache;
}

export function mediaFolderPrefix() {
  const p = String(cache.mediaFolderPrefix || "sistema").trim() || "sistema";
  return p.replace(/\/+$/, "");
}

export function mediaSubfolder(...parts) {
  const segs = [mediaFolderPrefix(), ...parts].filter(Boolean);
  return segs.join("/");
}

export function logosFolder() {
  return mediaSubfolder("logos");
}

export function iconsFolder() {
  return mediaSubfolder("icons");
}

export function qrFolder() {
  return mediaSubfolder("qr");
}

export function defaultLogoPath(prefix = mediaFolderPrefix()) {
  return `${prefix}/logos/logo.jpeg`;
}

export function defaultIconPath(prefix = mediaFolderPrefix()) {
  return `${prefix}/icons/icon.jpeg`;
}

function ensureDirRel(rel) {
  if (!rel) return;
  fs.mkdirSync(path.join(IMG_BASE, rel), { recursive: true });
}

/** Carpetas estándar: {prefix}/logos, {prefix}/icons y {prefix}/qr */
export function ensureStandardAssetDirs(prefix = mediaFolderPrefix()) {
  ensureDirRel(`${prefix}/logos`);
  ensureDirRel(`${prefix}/icons`);
  ensureDirRel(`${prefix}/qr`);
}

async function migrateSettingsRow(row) {
  const prefix = String(row.mediaFolderPrefix || "sistema").trim() || "sistema";
  const patch = {};

  const alias = String(row.alias || "").trim();
  const name = String(row.name || "").trim();
  const author = String(row.author || "").trim();
  const stillEddeliTemplate =
    /^eddeli$/i.test(alias) ||
    /eddeli/i.test(name) ||
    /panader/i.test(name) ||
    /^softed$/i.test(author);

  // Clonado desde EdDeli: marca Raptor; Store sin multistock por defecto.
  if (stillEddeliTemplate) {
    Object.assign(patch, {
      name: DEFAULT_APP_SETTINGS.name,
      alias: DEFAULT_APP_SETTINGS.alias,
      description: DEFAULT_APP_SETTINGS.description,
      author: DEFAULT_APP_SETTINGS.author,
      logoPath: null,
      iconPath: null,
      phone: "",
      socialWhatsapp: "",
      socialFacebook: "",
      socialInstagram: "",
      socialTiktok: "",
      socialEmail: "",
      cajaQuickCategoryMatch: "",
      showPublicCatalog: false,
      showPublicStoresPropia: false,
      showPublicStoresVitrina: false,
      multiStockEnabled: false,
    });
  } else if (
    row.logoPath === `${prefix}/logo.jpeg` ||
    row.logoPath === "EdDeli/logo.jpeg" ||
    row.logoPath === "EdDeli/logos/logo.jpeg"
  ) {
    patch.logoPath = null;
  }

  const tz = row.timezone != null ? String(row.timezone).trim() : "";
  if (!tz) {
    patch.timezone = DEFAULT_APP_SETTINGS.timezone;
  }

  if (Object.keys(patch).length) {
    await row.update(patch);
    Object.assign(row, patch);
  }

  ensureStandardAssetDirs(prefix);
  return row;
}

export function getMediaFolders() {
  const p = mediaFolderPrefix();
  return {
    video: [`${p}/media`, `${p}/videos`, "videos", "publicidad/videos"],
    audio: [`${p}/media`, `${p}/audio`, `${p}/music`, "publicidad/audio"],
    image: [`${p}/publicidad`, `${p}/ads`, `${p}/banners`],
  };
}

async function ensureAppSettingsSchema() {
  const qi = sequelize.getQueryInterface();
  let table;
  try {
    table = await qi.describeTable("app_settings");
  } catch {
    return;
  }
  if (!table.timezone) {
    await qi.addColumn("app_settings", "timezone", {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "America/Guayaquil",
    });
  }
  if (!table.iconPath) {
    await qi.addColumn("app_settings", "iconPath", {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: null,
    });
  }
  const boolCols = [
    ["showPublicCatalog", false],
    ["showPublicStoresPropia", false],
    ["showPublicStoresVitrina", false],
    ["multiStockEnabled", false],
    ["showProductCostInSelect", false],
    ["ordersAllowDeliverStockAdjust", true],
    ["suggestOpenPackOnPosShortage", false],
    ["cajaAllowCreateProductFromSelect", false],
    ["cajaAllowCreateProductFromScan", false],
    ["cajaAllowEditProductFromCart", false],
    ["cajaSuggestUpdateProductPrice", false],
  ];
  for (const [col, def] of boolCols) {
    if (!table[col]) {
      await qi.addColumn("app_settings", col, {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: def,
      });
    }
  }
  if (!table.moneyDisplayDecimals) {
    await qi.addColumn("app_settings", "moneyDisplayDecimals", {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
    });
  }
  if (!table.moneyRoundingMode) {
    await qi.addColumn("app_settings", "moneyRoundingMode", {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "up",
    });
  }
  if (!table.receiptDetailSettings) {
    await qi.addColumn("app_settings", "receiptDetailSettings", {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }
  if (!table.themePalette) {
    await qi.addColumn("app_settings", "themePalette", {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  }
}

/** Amplía columnas de precio a DECIMAL(14,6) si aún no lo son. */
export async function ensureInventoryProductMoneySchema() {
  const qi = sequelize.getQueryInterface();
  const targets = [
    { table: "ERP_inventory_products", cols: ["price", "supplierPrice", "distributorPrice"] },
    { table: "ERP_inventory_movements", cols: ["price"] },
    { table: "ERP_home_products", cols: ["priceOverride"] },
    { table: "ERP_catalog", cols: ["priceOverride"] },
    { table: "ERP_order_items", cols: ["price"] },
    { table: "ERP_supplier_order_items", cols: ["unitPrice"] },
    {
      table: "ERP_finance_supplier_pack_items",
      cols: ["allocatedUnitPrice", "previousUnitPrice"],
    },
    { table: "ERP_publicidad_playlist_items", cols: ["price"] },
  ];

  for (const { table, cols } of targets) {
    let desc;
    try {
      desc = await qi.describeTable(table);
    } catch {
      continue;
    }
    for (const col of cols) {
      if (!desc[col]) continue;
      const type = String(desc[col].type || "");
      if (/\(14\s*,\s*6\)/i.test(type)) continue;
      try {
        await qi.changeColumn(table, col, {
          type: DataTypes.DECIMAL(14, 6),
          allowNull: desc[col].allowNull !== false,
          defaultValue: desc[col].defaultValue ?? null,
        });
      } catch (e) {
        console.warn(`ensureInventoryProductMoneySchema ${table}.${col}:`, e?.message || e);
      }
    }
  }
}

function asBool(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const s = String(value).trim().toLowerCase();
  if (["0", "false", "no", "off"].includes(s)) return false;
  if (["1", "true", "yes", "on"].includes(s)) return true;
  return fallback;
}

/** Defaults listos para columnas TEXT (JSON serializado). */
function defaultsForDb() {
  return {
    ...DEFAULT_APP_SETTINGS,
    receiptDetailSettings: serializeReceiptDetailSettings(
      DEFAULT_APP_SETTINGS.receiptDetailSettings,
    ),
    themePalette: serializeThemePalette(DEFAULT_APP_SETTINGS.themePalette),
  };
}

export async function loadAppSettings() {
  await ensureAppSettingsSchema();
  await ensureInventoryProductMoneySchema();
  await AppSettings.sync();
  let row = await AppSettings.findByPk(1);
  if (!row) {
    row = await AppSettings.create({ id: 1, ...defaultsForDb() });
  }
  row = await migrateSettingsRow(row);
  const raw = row.toJSON();
  cache = {
    ...DEFAULT_APP_SETTINGS,
    ...raw,
    showPublicCatalog: asBool(raw.showPublicCatalog, false),
    showPublicStoresPropia: asBool(raw.showPublicStoresPropia, false),
    showPublicStoresVitrina: asBool(raw.showPublicStoresVitrina, false),
    multiStockEnabled: asBool(raw.multiStockEnabled, false),
    showProductCostInSelect: asBool(raw.showProductCostInSelect, false),
    ordersAllowDeliverStockAdjust: asBool(raw.ordersAllowDeliverStockAdjust, true),
    suggestOpenPackOnPosShortage: asBool(raw.suggestOpenPackOnPosShortage, false),
    cajaAllowCreateProductFromSelect: asBool(raw.cajaAllowCreateProductFromSelect, false),
    cajaAllowCreateProductFromScan: asBool(raw.cajaAllowCreateProductFromScan, false),
    cajaAllowEditProductFromCart: asBool(raw.cajaAllowEditProductFromCart, false),
    cajaSuggestUpdateProductPrice: asBool(raw.cajaSuggestUpdateProductPrice, false),
    moneyDisplayDecimals: normalizeMoneyDisplayDecimals(raw.moneyDisplayDecimals, 2),
    moneyRoundingMode: normalizeMoneyRoundingMode(raw.moneyRoundingMode, "up"),
    receiptDetailSettings: normalizeReceiptDetailSettings(raw.receiptDetailSettings),
    themePalette: normalizeThemePalette(raw.themePalette),
  };
  ensureStandardAssetDirs(cache.mediaFolderPrefix);
  return cache;
}

export async function updateAppSettings(payload) {
  const patch = { ...payload };
  for (const key of [
    "showPublicCatalog",
    "showPublicStoresPropia",
    "showPublicStoresVitrina",
    "multiStockEnabled",
  ]) {
    if (key in patch) patch[key] = asBool(patch[key], false);
  }
  if ("showProductCostInSelect" in patch) {
    patch.showProductCostInSelect = asBool(patch.showProductCostInSelect, false);
  }
  if ("ordersAllowDeliverStockAdjust" in patch) {
    patch.ordersAllowDeliverStockAdjust = asBool(
      patch.ordersAllowDeliverStockAdjust,
      true,
    );
  }
  if ("suggestOpenPackOnPosShortage" in patch) {
    patch.suggestOpenPackOnPosShortage = asBool(
      patch.suggestOpenPackOnPosShortage,
      false,
    );
  }
  if ("cajaAllowCreateProductFromSelect" in patch) {
    patch.cajaAllowCreateProductFromSelect = asBool(
      patch.cajaAllowCreateProductFromSelect,
      false,
    );
  }
  if ("cajaAllowCreateProductFromScan" in patch) {
    patch.cajaAllowCreateProductFromScan = asBool(
      patch.cajaAllowCreateProductFromScan,
      false,
    );
  }
  if ("cajaAllowEditProductFromCart" in patch) {
    patch.cajaAllowEditProductFromCart = asBool(
      patch.cajaAllowEditProductFromCart,
      false,
    );
  }
  if ("cajaSuggestUpdateProductPrice" in patch) {
    patch.cajaSuggestUpdateProductPrice = asBool(
      patch.cajaSuggestUpdateProductPrice,
      false,
    );
  }
  if ("moneyDisplayDecimals" in patch) {
    patch.moneyDisplayDecimals = normalizeMoneyDisplayDecimals(
      patch.moneyDisplayDecimals,
      2,
    );
  }
  if ("moneyRoundingMode" in patch) {
    patch.moneyRoundingMode = normalizeMoneyRoundingMode(
      patch.moneyRoundingMode,
      "up",
    );
  }
  if ("receiptDetailSettings" in patch) {
    patch.receiptDetailSettings = serializeReceiptDetailSettings(
      patch.receiptDetailSettings,
    );
  }
  if ("themePalette" in patch) {
    patch.themePalette = serializeThemePalette(patch.themePalette);
  }
  let row = await AppSettings.findByPk(1);
  if (!row) {
    row = await AppSettings.create({ id: 1, ...defaultsForDb(), ...patch });
  } else {
    await row.update(patch);
  }
  const raw = row.toJSON();
  cache = {
    ...DEFAULT_APP_SETTINGS,
    ...raw,
    showPublicCatalog: asBool(raw.showPublicCatalog, false),
    showPublicStoresPropia: asBool(raw.showPublicStoresPropia, false),
    showPublicStoresVitrina: asBool(raw.showPublicStoresVitrina, false),
    multiStockEnabled: asBool(raw.multiStockEnabled, false),
    showProductCostInSelect: asBool(raw.showProductCostInSelect, false),
    ordersAllowDeliverStockAdjust: asBool(raw.ordersAllowDeliverStockAdjust, true),
    suggestOpenPackOnPosShortage: asBool(raw.suggestOpenPackOnPosShortage, false),
    cajaAllowCreateProductFromSelect: asBool(raw.cajaAllowCreateProductFromSelect, false),
    cajaAllowCreateProductFromScan: asBool(raw.cajaAllowCreateProductFromScan, false),
    cajaAllowEditProductFromCart: asBool(raw.cajaAllowEditProductFromCart, false),
    cajaSuggestUpdateProductPrice: asBool(raw.cajaSuggestUpdateProductPrice, false),
    moneyDisplayDecimals: normalizeMoneyDisplayDecimals(raw.moneyDisplayDecimals, 2),
    moneyRoundingMode: normalizeMoneyRoundingMode(raw.moneyRoundingMode, "up"),
    receiptDetailSettings: normalizeReceiptDetailSettings(raw.receiptDetailSettings),
    themePalette: normalizeThemePalette(raw.themePalette),
  };
  return cache;
}

export function toPublicSettings(data = cache) {
  return {
    name: data.name,
    alias: data.alias,
    version: data.version,
    description: data.description,
    author: data.author,
    logoPath: data.logoPath,
    iconPath: data.iconPath,
    phone: data.phone,
    socials: {
      whatsapp: data.socialWhatsapp || "",
      facebook: data.socialFacebook || "",
      instagram: data.socialInstagram || "",
      tiktok: data.socialTiktok || "",
      email: data.socialEmail || "",
    },
    mediaFolderPrefix: data.mediaFolderPrefix,
    logoFolder: logosFolder(),
    iconFolder: iconsFolder(),
    qrFolder: qrFolder(),
    cajaQuickCategoryMatch: data.cajaQuickCategoryMatch || "",
    walkInCustomerLabel: data.walkInCustomerLabel || "Consumidor Final",
    timezone: data.timezone || "America/Guayaquil",
    showPublicCatalog: asBool(data.showPublicCatalog, false),
    showPublicStoresPropia: asBool(data.showPublicStoresPropia, false),
    showPublicStoresVitrina: asBool(data.showPublicStoresVitrina, false),
    multiStockEnabled: asBool(data.multiStockEnabled, false),
    showProductCostInSelect: asBool(data.showProductCostInSelect, false),
    ordersAllowDeliverStockAdjust: asBool(data.ordersAllowDeliverStockAdjust, true),
    suggestOpenPackOnPosShortage: asBool(data.suggestOpenPackOnPosShortage, false),
    cajaAllowCreateProductFromSelect: asBool(data.cajaAllowCreateProductFromSelect, false),
    cajaAllowCreateProductFromScan: asBool(data.cajaAllowCreateProductFromScan, false),
    cajaAllowEditProductFromCart: asBool(data.cajaAllowEditProductFromCart, false),
    cajaSuggestUpdateProductPrice: asBool(data.cajaSuggestUpdateProductPrice, false),
    moneyDisplayDecimals: normalizeMoneyDisplayDecimals(data.moneyDisplayDecimals, 2),
    moneyRoundingMode: normalizeMoneyRoundingMode(data.moneyRoundingMode, "up"),
    receiptDetailSettings: normalizeReceiptDetailSettings(data.receiptDetailSettings),
    themePalette: normalizeThemePalette(data.themePalette),
  };
}
