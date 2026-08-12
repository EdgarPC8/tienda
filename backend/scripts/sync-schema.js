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

try {
  await sequelize.authenticate();
  const result = await syncDatabaseSchema({ alter: true });
  await ensureStoreLocationKindEnum();
  await ensureStoreIsVisibleColumn();
  await ensureCustomerNameSchema();
  await ensureEntitlementTable({ alter: true });
  await seedDefaultCashRegistersForOwnStores();
  await ensureBodegaStore();
  await migrateGlobalStockToBodega();
  console.log("✅ Esquema sincronizado:", result.models?.join(", ") || "ok");
  process.exit(0);
} catch (error) {
  console.error("❌ Error sincronizando esquema:", error);
  process.exit(1);
}
