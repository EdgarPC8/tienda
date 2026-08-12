/**
 * Reset Store:
 * - Si hay backup.json válido → restaura desde ese archivo (flujo EdDeli).
 * - Si no hay backup → seed mínimo (roles + Edgar + administrador).
 *
 * Uso: npm run db:reset
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import "../src/database/registerEdDeliModels.js";
import { sequelize } from "../src/database/connection.js";
import {
  recreateDatabaseFromBackup,
  requireValidBackupFile,
  readBackupFileSummary,
} from "../src/database/insertData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbName = process.env.DB_NAME || "store";

async function runSeed() {
  const seedPath = path.resolve(__dirname, "../src/database/seed.js");
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [seedPath], {
      stdio: "inherit",
      env: process.env,
      cwd: path.resolve(__dirname, ".."),
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`seed terminó con código ${code}`));
    });
    child.on("error", reject);
  });
}

try {
  await sequelize.authenticate();
  console.warn(`⚠️  Reset BD Store… MySQL: ${process.env.DB_USER || "root"}@${process.env.DB_HOST || "localhost"}/${dbName}`);

  const summary = await readBackupFileSummary();
  let hasValidBackup = false;
  if (summary.exists) {
    try {
      await requireValidBackupFile();
      hasValidBackup = true;
    } catch {
      hasValidBackup = false;
    }
  }

  if (!hasValidBackup) {
    console.warn("ℹ️  No hay backup.json de negocio. Usando seed mínimo (roles + Edgar).");
    await sequelize.close();
    await runSeed();
    console.log("✅ BD lista con seed mínimo. Login: administrador / 12345678");
    process.exit(0);
  }

  console.warn(`   Archivo: ${summary.path}`);
  console.warn(`   Tamaño: ${summary.sizeMB} MB · Filas totales: ${summary.totalRows}`);

  const result = await recreateDatabaseFromBackup();
  console.log(`✅ BD reseteada (modo: ${result.resetMode}).`, result.tables);
  if (result.tablesRecreated?.length) {
    console.log("   Tablas recreadas:", result.tablesRecreated.join(", "));
  }
  process.exit(0);
} catch (error) {
  console.error("❌ Error reseteando BD:", error?.message || error);
  if (error?.parent?.sqlMessage) {
    console.error("   SQL:", error.parent.sqlMessage);
  }
  process.exit(1);
}
