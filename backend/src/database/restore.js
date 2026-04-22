/**
 * Importa backup.json a la BD (sin borrar tablas). Para aplicar tras copiar un JSON manualmente.
 * Recarga completa: usar GET /tiendaapi/comands/reloadBD (autenticado).
 */
import { sequelize } from "./connection.js";
import "../models/index.js";
import { insertData } from "./insertData.js";

async function main() {
  await sequelize.authenticate();
  await insertData();
  await sequelize.close();
  console.log("✅ restore finalizado.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
