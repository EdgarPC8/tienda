/**
 * Compara modelos Sequelize vs BACKUP_TABLE_ENTRIES vs backup.json.
 * Uso: node scripts/audit-backup-tables.js
 */
import { readFileSync } from "fs";
import "../src/database/registerEdDeliModels.js";
import { sequelize } from "../src/database/connection.js";
import { BACKUP_TABLE_ENTRIES, backupFilePath } from "../src/database/insertData.js";

const data = JSON.parse(readFileSync(backupFilePath, "utf8"));
const backupKeys = Object.keys(data).filter((k) => Array.isArray(data[k]));
const registered = BACKUP_TABLE_ENTRIES.map((e) => e.key);
const registeredTables = new Set(BACKUP_TABLE_ENTRIES.map((e) => e.model.tableName));

const sequelizeModels = Object.values(sequelize.models).map((m) => ({
  name: m.name,
  tableName: m.tableName,
}));

const inBackupNotRegistered = backupKeys.filter((k) => !registered.includes(k));
const registeredNotInBackup = registered.filter((k) => !backupKeys.includes(k));
const empty = registered.filter((k) => !data[k] || data[k].length === 0);
const modelsNotInBackup = sequelizeModels.filter((m) => !registeredTables.has(m.tableName));

console.log("=== AUDITORÍA BACKUP EdDeli ===\n");
console.log(`Modelos Sequelize: ${sequelizeModels.length}`);
console.log(`Tablas registradas en insertData: ${registered.length}`);
console.log(`Claves con array en backup.json: ${backupKeys.length}\n`);

console.log("--- Modelos Sequelize SIN entrada en BACKUP_TABLE_ENTRIES ---");
if (modelsNotInBackup.length === 0) console.log("(ninguno)");
else modelsNotInBackup.forEach((m) => console.log(`  ${m.name} → ${m.tableName}`));

console.log("\n--- En JSON pero NO en BACKUP_TABLE_ENTRIES ---");
if (inBackupNotRegistered.length === 0) console.log("(ninguna)");
else inBackupNotRegistered.forEach((k) => console.log(`  ${k}: ${data[k].length} filas`));

console.log("\n--- En BACKUP_TABLE_ENTRIES pero sin clave en JSON ---");
if (registeredNotInBackup.length === 0) console.log("(ninguna)");
else registeredNotInBackup.forEach((k) => console.log(`  ${k}`));

console.log("\n--- Registradas en backup con 0 filas ---");
empty.forEach((k) => console.log(`  ${k}`));

console.log("\n--- Conteo por tabla (backup.json) ---");
for (const { key } of BACKUP_TABLE_ENTRIES) {
  const n = Array.isArray(data[key]) ? data[key].length : 0;
  if (n > 0) console.log(`  ${key}: ${n}`);
}
