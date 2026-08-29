/**
 * Añade/actualiza columnas de editor_templates (p. ej. settingsJson).
 * Solo sincroniza esa tabla — no recorre todo el esquema.
 *
 * Uso: npm run db:sync:editor
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { EditorTemplate } from "../src/models/Editor.js";

try {
  await sequelize.authenticate();
  await EditorTemplate.sync({ alter: true });
  console.log("✅ Tabla editor_templates sincronizada (settingsJson y columnas del modelo).");
  await sequelize.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
