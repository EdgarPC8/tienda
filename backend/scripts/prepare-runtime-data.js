/**
 * Preparación de datos / migraciones de runtime (NO es sync de esquema).
 * - Cajas por defecto
 * - Local Bodega o local único (según multiStock)
 * - Migrar stock global → bodega (si aplica)
 * - Fix FK expense referenceId
 * - Fix multistock off
 *
 * Uso: npm run db:prepare
 * Antes conviene: npm run db:sync
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sequelize } from "../src/database/connection.js";
import "../src/database/registerEdDeliModels.js";
import { loadAppSettings, getAppSettingsSync } from "../src/services/appSettingsService.js";
import {
  ensureBodegaStore,
  ensureSingleLocalOwnStore,
  migrateGlobalStockToBodega,
} from "../src/services/storeStockService.js";
import { seedDefaultCashRegistersForOwnStores } from "../src/models/CashRegister.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runScript(name) {
  const script = path.resolve(__dirname, name);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
      cwd: path.resolve(__dirname, ".."),
    });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${name} exit ${code}`)),
    );
    child.on("error", reject);
  });
}

try {
  await sequelize.authenticate();
  console.log("🔧 Preparando datos de runtime (bodega / cajas / stock / FK)…");

  await seedDefaultCashRegistersForOwnStores();
  await loadAppSettings();
  if (getAppSettingsSync()?.multiStockEnabled) {
    await ensureBodegaStore();
    await migrateGlobalStockToBodega();
  } else {
    await ensureSingleLocalOwnStore();
  }
  await runScript("fix-expense-reference-fk.js");
  await runScript("fix-multistock-off.js");

  console.log("✅ db:prepare OK");
  process.exit(0);
} catch (error) {
  console.error("❌ Error en db:prepare:", error?.message || error);
  process.exit(1);
}
