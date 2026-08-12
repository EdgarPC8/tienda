/**
 * Añade/actualiza columnas de ERP_inventory_categories (p. ej. packageTiers).
 * Uso: node scripts/sync-category-schema.js
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory } from "../src/models/Inventory.js";

try {
  await sequelize.authenticate();
  await InventoryCategory.sync({ alter: true });
  console.log("✅ Tabla ERP_inventory_categories sincronizada.");
  await sequelize.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
