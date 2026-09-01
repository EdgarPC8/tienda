/**
 * Sincroniza el esquema de BD con los modelos (ALTER TABLE).
 * Incluye inventario, turnos, publicidad, media, etc.
 * Uso: npm run db:sync
 *
 * No corre en el arranque del API: el boot solo autentica y levanta el puerto.
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import "../src/database/registerEdDeliModels.js";
import { syncDatabaseSchema } from "../src/database/syncModels.js";
import { ensureCustomerNameSchema } from "../src/services/customerNameService.js";
import { ensureEntitlementTable } from "../src/services/entitlementService.js";
import {
  ensureStoreLocationKindEnum,
  ensureStoreIsVisibleColumn,
  ensureBodegaStore,
  migrateGlobalStockToBodega,
} from "../src/services/storeStockService.js";
import { seedDefaultCashRegistersForOwnStores } from "../src/models/CashRegister.js";
import { ensureAccountIsActiveColumn } from "../src/models/Account.js";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runFixExpenseReferenceFk() {
  const script = path.resolve(__dirname, "fix-expense-reference-fk.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
      cwd: path.resolve(__dirname, ".."),
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`fix-expense-reference-fk exit ${code}`))));
    child.on("error", reject);
  });
}

function runFixMultistockOff() {
  const script = path.resolve(__dirname, "fix-multistock-off.js");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      stdio: "inherit",
      env: process.env,
      cwd: path.resolve(__dirname, ".."),
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`fix-multistock-off exit ${code}`))));
    child.on("error", reject);
  });
}

try {
  await sequelize.authenticate();
  const result = await syncDatabaseSchema({ alter: true });
  await ensureStoreLocationKindEnum();
  await ensureStoreIsVisibleColumn();
  await ensureCustomerNameSchema();
  await ensureAccountIsActiveColumn();
  await ensureEntitlementTable({ alter: true });
  await seedDefaultCashRegistersForOwnStores();
  await ensureBodegaStore();
  await migrateGlobalStockToBodega();
  await runFixExpenseReferenceFk();
  await runFixMultistockOff();
  console.log("✅ Esquema sincronizado:", result.models?.join(", ") || "ok");
  process.exit(0);
} catch (error) {
  console.error("❌ Error sincronizando esquema:", error);
  process.exit(1);
}
