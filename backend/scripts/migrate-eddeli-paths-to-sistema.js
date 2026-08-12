/**
 * Migra medios legacy EdDeli/ → sistema/ (backup, img, files, BD) y elimina carpetas alumni/EdDeli.
 * Uso: npm run db:migrate:paths-to-sistema
 */
import "dotenv/config";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { sequelize } from "../src/database/connection.js";
import {
  backupFilePath,
  writeBackupToDisk,
  parseBackupJsonContent,
  BACKUP_TABLE_ENTRIES,
} from "../src/database/insertData.js";
import { loadAppSettings } from "../src/services/appSettingsService.js";
import { migrateValueDeep } from "../src/utils/mediaPathUtils.js";
import { InventoryProduct } from "../src/models/Inventory.js";
import { PublicidadCampaign, PublicidadPlaylistItem } from "../src/models/Publicidad.js";
import { DocumentAttachment } from "../src/models/DocumentAttachment.js";
import {
  EditorTemplate,
  EditorLayerProp,
  EditorLayerBind,
} from "../src/models/Editor.js";
import { AppSettings } from "../src/models/AppSettings.js";
import { MediaAsset } from "../src/models/MediaAsset.js";
import { resolveTableName } from "../src/database/dbSchemaCompare.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_BASE = path.resolve(__dirname, "../src/img");
const FILES_BASE = path.resolve(__dirname, "../src/files");
const FROM_PREFIX = "EdDeli/";
const TO_PREFIX = "sistema/";

const BACKUP_TABLES_TO_MIGRATE = new Set([
  "InventoryProduct",
  "PublicidadCampaign",
  "PublicidadPlaylistItem",
  "DocumentAttachment",
  "EditorTemplate",
  "EditorLayerProp",
  "EditorLayerBind",
  "AppSettings",
  "Store",
  "HomeProduct",
  "Catalog",
  "StoreProduct",
  "MediaAsset",
  "Notifications",
  "NotificationProgram",
]);

function migrateBackupData(data) {
  const out = { ...data };
  let rowsTouched = 0;
  for (const [table, rows] of Object.entries(out)) {
    if (!Array.isArray(rows) || !BACKUP_TABLES_TO_MIGRATE.has(table)) continue;
    out[table] = rows.map((row) => {
      if (!row || typeof row !== "object") return row;
      const before = JSON.stringify(row);
      const next = migrateValueDeep(row);
      if (JSON.stringify(next) !== before) rowsTouched += 1;
      return next;
    });
  }
  return { data: out, rowsTouched };
}

async function copyDirMerge(srcAbs, destAbs) {
  let copied = 0;
  let stat;
  try {
    stat = await fs.stat(srcAbs);
  } catch {
    return copied;
  }
  if (!stat.isDirectory()) return copied;

  await fs.mkdir(destAbs, { recursive: true });
  const entries = await fs.readdir(srcAbs, { withFileTypes: true });
  for (const entry of entries) {
    const from = path.join(srcAbs, entry.name);
    const to = path.join(destAbs, entry.name);
    if (entry.isDirectory()) {
      copied += await copyDirMerge(from, to);
    } else if (entry.isFile()) {
      try {
        await fs.access(to);
      } catch {
        await fs.copyFile(from, to);
        copied += 1;
      }
    }
  }
  return copied;
}

async function updateStringColumn(model, column) {
  const table = resolveTableName(model);
  const [result] = await sequelize.query(
    `UPDATE \`${table}\` SET \`${column}\` = REPLACE(\`${column}\`, :from, :to) WHERE \`${column}\` LIKE :like`,
    { replacements: { from: FROM_PREFIX, to: TO_PREFIX, like: `%${FROM_PREFIX}%` } },
  );
  return result?.affectedRows ?? 0;
}

async function updateJsonColumn(model, column) {
  const table = resolveTableName(model);
  const [rows] = await sequelize.query(
    `SELECT id, \`${column}\` AS val FROM \`${table}\` WHERE \`${column}\` LIKE :like`,
    { replacements: { like: `%EdDeli/%` } },
  );
  let updated = 0;
  for (const row of rows) {
    let val = row.val;
    if (typeof val === "string") {
      try {
        val = JSON.parse(val);
      } catch {
        continue;
      }
    }
    const next = migrateValueDeep(val);
    await sequelize.query(
      `UPDATE \`${table}\` SET \`${column}\` = :val WHERE id = :id`,
      { replacements: { id: row.id, val: JSON.stringify(next) } },
    );
    updated += 1;
  }
  return updated;
}

async function migrateDatabase() {
  return {
    inventoryPrimary: await updateStringColumn(InventoryProduct, "primaryImageUrl"),
    publicidadPlaylistMedia: await updateStringColumn(PublicidadPlaylistItem, "mediaPath"),
    publicidadPlaylistContent: await updateStringColumn(PublicidadPlaylistItem, "contentId"),
    publicidadPlaylistSubtitle: await updateStringColumn(PublicidadPlaylistItem, "subtitle"),
    documentAttachment: await updateStringColumn(DocumentAttachment, "filePath"),
    mediaAssetPath: await updateStringColumn(MediaAsset, "relativePath"),
    mediaAssetFolder: await updateStringColumn(MediaAsset, "folder"),
    editorTemplateBg: await updateStringColumn(EditorTemplate, "backgroundSrc"),
    editorLayerProp: await updateStringColumn(EditorLayerProp, "valueText"),
    editorLayerBind: await updateStringColumn(EditorLayerBind, "fallbackSrc"),
    appLogo: await updateStringColumn(AppSettings, "logoPath"),
    publicidadCampaignMusic: await updateJsonColumn(PublicidadCampaign, "musicTracks"),
  };
}

async function removeLegacyDirs() {
  const removed = [];
  for (const base of [IMG_BASE, FILES_BASE]) {
    for (const name of ["EdDeli", "alumni"]) {
      const target = path.join(base, name);
      try {
        await fs.rm(target, { recursive: true, force: true });
        removed.push(path.relative(path.resolve(__dirname, ".."), target));
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

async function main() {
  console.log("=== Migración completa → sistema/ ===\n");

  const raw = readFileSync(backupFilePath, "utf8");
  const parsed = parseBackupJsonContent(raw);
  const { data: migratedBackup, rowsTouched } = migrateBackupData(parsed);
  await writeBackupToDisk(migratedBackup);
  console.log(`✅ backup.json (${rowsTouched} filas de medios)`);

  const imgCopied = await copyDirMerge(
    path.join(IMG_BASE, "EdDeli"),
    path.join(IMG_BASE, "sistema"),
  );
  const filesCopied = await copyDirMerge(
    path.join(FILES_BASE, "EdDeli"),
    path.join(FILES_BASE, "sistema"),
  );
  console.log(`✅ img: ${imgCopied} archivos · files: ${filesCopied} archivos copiados a sistema/`);

  await sequelize.authenticate();
  const dbStats = await migrateDatabase();
  console.log("✅ BD:", dbStats);

  const removed = await removeLegacyDirs();
  if (removed.length) console.log("✅ Eliminado:", removed.join(", "));

  await loadAppSettings();
  const settings = await AppSettings.findByPk(1, { raw: true });
  console.log("\nAppSettings:", {
    mediaFolderPrefix: settings?.mediaFolderPrefix,
    logoPath: settings?.logoPath,
  });

  await sequelize.close();
  console.log("\nListo.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
