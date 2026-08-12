/**
 * Normaliza backup.json para que coincida con el esquema actual (p. ej. timezone en AppSettings).
 * Uso: npm run db:patch:backup
 */
import "dotenv/config";
import { readFileSync } from "fs";
import {
  backupFilePath,
  parseBackupJsonContent,
  writeBackupToDisk,
  BACKUP_TABLE_ENTRIES,
} from "../src/database/insertData.js";

const raw = readFileSync(backupFilePath, "utf8");
const before = JSON.parse(raw);

const issues = [];
for (const entry of BACKUP_TABLE_ENTRIES) {
  const rows = before[entry.key];
  if (!rows?.length) continue;
  const modelFields = Object.keys(entry.model.rawAttributes);
  const missing = modelFields.filter((f) => !(f in rows[0]));
  if (missing.length) issues.push({ table: entry.key, missing });
}

console.log("=== Parche backup.json ===\n");
console.log("Ruta:", backupFilePath);
if (issues.length) {
  console.log("Campos faltantes en filas de muestra:");
  for (const i of issues) console.log(`  ${i.table}: ${i.missing.join(", ")}`);
} else {
  console.log("Sin campos faltantes detectados en muestras.");
}

const normalized = parseBackupJsonContent(raw);
const afterTz = normalized.AppSettings?.[0]?.timezone;
console.log("\nAppSettings.timezone tras normalizar:", afterTz ?? "(sin fila)");

const { tables } = await writeBackupToDisk(normalized);
console.log("\n✅ backup.json actualizado.");
console.log("Filas por tabla:", tables);
