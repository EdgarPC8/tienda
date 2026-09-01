/**
 * Diagnóstico: abonos / pagos a proveedor (Expense referenceId, cuentas, insert de prueba).
 * Uso: node scripts/diagnose-supplier-pay.js [orderId]
 */
import "dotenv/config";
import "../src/database/registerEdDeliModels.js";
import { sequelize } from "../src/database/connection.js";
import { Expense } from "../src/models/Finance.js";
import { Account } from "../src/models/Account.js";

const orderId = Number(process.argv[2] || 15);

try {
  await sequelize.authenticate();
  console.log("BD:", process.env.DB_NAME || "store");

  const [fks] = await sequelize.query(
    `SELECT CONSTRAINT_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'ERP_finance_expenses'
       AND REFERENCED_TABLE_NAME IS NOT NULL`
  );
  console.log("\nFKs en ERP_finance_expenses:");
  if (!fks.length) console.log("  (ninguna)");
  else fks.forEach((r) => console.log(`  ${r.CONSTRAINT_NAME}: ${r.COLUMN_NAME} → ${r.REFERENCED_TABLE_NAME}`));

  const bad = fks.filter((r) => r.REFERENCED_TABLE_NAME === "ERP_inventory_products");
  if (bad.length) {
    console.log("\n⚠️  Hay FK referenceId → productos. Ejecutá: npm run db:fix:expense-reference-fk");
  }

  const accounts = await Account.findAll({ attributes: ["id", "username"], limit: 5 });
  console.log("\nCuentas (createdBy):", accounts.map((a) => a.id).join(", ") || "(vacío)");

  const createdBy = accounts[0]?.id || 1;
  console.log(`\nPrueba INSERT Expense (referenceId=${orderId}, createdBy=${createdBy})…`);

  try {
    await sequelize.transaction(async (t) => {
      await Expense.create(
        {
          date: new Date(),
          amount: 0.01,
          concept: "diagnose-supplier-pay",
          category: "Compras",
          referenceType: "supplier_order_abono",
          referenceId: orderId,
          counterpartyName: "test",
          createdBy,
          status: "paid",
        },
        { transaction: t }
      );
      throw new Error("__rollback__");
    });
  } catch (e) {
    if (e.message === "__rollback__") {
      console.log("✅ INSERT Expense OK (rollback)");
    } else {
      console.error("❌ INSERT Expense FALLÓ:");
      console.error("   ", e.parent?.sqlMessage || e.message);
    }
  }

  process.exit(0);
} catch (error) {
  console.error("❌", error?.message || error);
  process.exit(1);
}
