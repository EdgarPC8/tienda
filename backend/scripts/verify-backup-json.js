/**
 * Verifica que backup.json y el flujo de guardado no tengan JSON corrupto (////).
 * Uso: node scripts/verify-backup-json.js
 */
import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseBackupJsonContent,
  prepareBackupForRestore,
  backupFilePath,
} from "../src/database/insertData.js";
import { repairJsonFieldValue } from "../src/utils/jsonFieldUtils.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function countCorruptSlashes(text) {
  const quad = (text.match(/\/{4}/g) || []).length;
  const longEscape = (text.match(/\\{8,}/g) || []).length;
  return { quad, longEscape };
}

function checkJsonFieldsInBackup(data) {
  const issues = [];
  const checks = [
    ["InventoryCategory", ["packageTiers", "mixMatchProductIds"]],
    ["InventoryProduct", ["packageTiers", "wholesaleRules"]],
    ["PricingTierGroup", ["packageTiers", "productIds"]],
    ["PublicidadCampaign", ["screenIds", "musicTracks"]],
    ["PublicidadPlaylistItem", ["menuItems"]],
  ];

  for (const [table, fields] of checks) {
    for (const row of data[table] || []) {
      for (const field of fields) {
        const raw = row[field];
        if (raw == null) continue;
        const s = typeof raw === "string" ? raw : JSON.stringify(raw);
        if (typeof raw === "string") {
          issues.push(`${table}#${row.id} ${field}: guardado como string`);
        }
        if (s.includes("////") || /\\{8,}/.test(s)) {
          issues.push(`${table}#${row.id} ${field}: slashes corruptos`);
        }
        const repaired = repairJsonFieldValue(raw, { emptyArrayToNull: false });
        if (repaired == null && (field === "screenIds" || field === "musicTracks")) {
          /* ok vacío */
        } else if (typeof repaired === "string") {
          issues.push(`${table}#${row.id} ${field}: no se pudo normalizar a array/objeto`);
        }
      }
    }
  }
  return issues;
}

console.log("=== Verificación backup JSON ===\n");

// 1. Archivo en disco
const rawText = readFileSync(backupFilePath, "utf8");
const fileSlashes = countCorruptSlashes(rawText);
console.log(`1. backup.json (${backupFilePath})`);
console.log(`   Tamaño: ${(rawText.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`   Secuencias //// : ${fileSlashes.quad}`);
console.log(`   Bloques \\\\... largos: ${fileSlashes.longEscape}`);

const parsed = parseBackupJsonContent(rawText);
const fieldIssues = checkJsonFieldsInBackup(parsed);
console.log(`   Campos JSON mal formados: ${fieldIssues.length}`);
if (fieldIssues.length) fieldIssues.slice(0, 10).forEach((i) => console.log(`     - ${i}`));

// 2. Simular subida de backup corrupto → debe limpiarse
const corrupt = prepareBackupForRestore({
  PublicidadCampaign: [
    {
      id: 99,
      name: "test",
      screenIds: '"\\"\\\\\\\"[]\\\\\\\"\\""',
      musicTracks: '"\\"\\\\\\\"[]\\\\\\\"\\""',
    },
  ],
});
const cleaned = corrupt.PublicidadCampaign[0];
const screenOk = Array.isArray(cleaned.screenIds);
const musicOk = Array.isArray(cleaned.musicTracks);
console.log("\n2. Limpieza al guardar/subir backup corrupto");
console.log(`   screenIds → array: ${screenOk ? "✅" : "❌"} (${JSON.stringify(cleaned.screenIds)})`);
console.log(`   musicTracks → array: ${musicOk ? "✅" : "❌"} (${JSON.stringify(cleaned.musicTracks)})`);

console.log("\n=== Resultado ===");
const ok =
  fileSlashes.quad === 0 &&
  fileSlashes.longEscape === 0 &&
  fieldIssues.length === 0 &&
  screenOk &&
  musicOk;
console.log(ok ? "✅ Todo correcto: JSON limpio y guardado bien." : "⚠ Hay problemas pendientes (ver arriba).");

process.exit(ok ? 0 : 1);
