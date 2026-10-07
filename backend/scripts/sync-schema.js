/**
 * Solo sincroniza esquema (tablas/columnas) con los modelos Sequelize.
 * No crea locales, no migra stock, no limpia datos ni IDs.
 *
 * Uso: npm run db:sync
 *
 * Para bodega/cajas/FK/stock → npm run db:prepare
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
} from "../src/services/storeStockService.js";
import { ensureAccountIsActiveColumn } from "../src/models/Account.js";

try {
  await sequelize.authenticate();
  const result = await syncDatabaseSchema({ alter: true });
  await ensureStoreLocationKindEnum();
  await ensureStoreIsVisibleColumn();
  await ensureCustomerNameSchema();
  await ensureAccountIsActiveColumn();
  await ensureEntitlementTable({ alter: true });
  console.log("✅ Esquema sincronizado (solo tablas/columnas):", result.models?.join(", ") || "ok");
  console.log("   Si necesitás bodega/cajas/migración de stock: npm run db:prepare");
  process.exit(0);
} catch (error) {
  console.error("❌ Error sincronizando esquema:", error);
  process.exit(1);
}
