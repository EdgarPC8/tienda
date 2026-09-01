/**
 * Store/Tienda: fuerza multistock apagado (un solo local).
 * También reaplica bloqueo del gestor si multi_stock no está activo.
 *
 * Uso: npm run db:fix:multistock-off
 */
import "dotenv/config";
import "../src/database/registerEdDeliModels.js";
import { sequelize } from "../src/database/connection.js";
import { AppSettings } from "../src/models/AppSettings.js";
import { loadAppSettings } from "../src/services/appSettingsService.js";
import {
  ensureEntitlementTable,
  enforceEntitlementSideEffectsOnBoot,
} from "../src/services/entitlementService.js";

try {
  await sequelize.authenticate();
  await ensureEntitlementTable({ alter: false });

  const row = await AppSettings.findByPk(1);
  if (!row) {
    console.log("ℹ️  No hay fila app_settings; nada que corregir.");
    process.exit(0);
  }

  if (row.multiStockEnabled) {
    await row.update({ multiStockEnabled: false });
    console.log("✅ multiStockEnabled apagado en app_settings");
  } else {
    console.log("ℹ️  multiStockEnabled ya estaba apagado");
  }

  await enforceEntitlementSideEffectsOnBoot();
  await loadAppSettings();
  console.log("✅ Listo. Reiniciá el backend (pm2 restart).");
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
