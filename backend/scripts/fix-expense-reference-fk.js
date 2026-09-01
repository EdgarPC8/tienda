/**
 * referenceId en ERP_finance_expenses es polimórfico (supplier_order_abono, etc.).
 * Cualquier FK a ERP_inventory_products rompe abonos y pagos a proveedores.
 *
 * Uso: npm run db:fix:expense-reference-fk
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";

const TABLE = "ERP_finance_expenses";
const REF_COLUMN = "referenceId";
const BAD_REF_TABLE = "ERP_inventory_products";

async function listReferenceIdProductFks() {
  const [rows] = await sequelize.query(
    `SELECT CONSTRAINT_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME = ?
       AND REFERENCED_COLUMN_NAME IS NOT NULL`,
    { replacements: [TABLE, REF_COLUMN, BAD_REF_TABLE] }
  );
  return rows.map((r) => r.CONSTRAINT_NAME).filter(Boolean);
}

try {
  await sequelize.authenticate();
  const fks = await listReferenceIdProductFks();
  if (!fks.length) {
    console.log(`ℹ️  No hay FK de ${TABLE}.${REF_COLUMN} → ${BAD_REF_TABLE}.`);
    process.exit(0);
  }
  for (const name of fks) {
    await sequelize.query(`ALTER TABLE \`${TABLE}\` DROP FOREIGN KEY \`${name}\``);
    console.log(`✅ FK eliminada: ${name}`);
  }
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
