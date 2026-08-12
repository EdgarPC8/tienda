/**
 * Seed: poner TODO el stock en 0.
 *
 * - ERP_store_stocks.quantity → 0 (todos los locales)
 * - ERP_inventory_products.stock → 0
 *
 * NO crea movimientos de inventario.
 *
 * Uso:
 *   node scripts/seed-zero-all-stock.mjs           # dry-run
 *   node scripts/seed-zero-all-stock.mjs --apply   # aplica
 */
import "dotenv/config";
import { Op } from "sequelize";
import { sequelize } from "../src/database/connection.js";
import { InventoryProduct } from "../src/models/Inventory.js";
import { StoreStock } from "../src/models/StoreStock.js";

const APPLY = process.argv.includes("--apply");

function money(n) {
  return Number(Number(n || 0).toFixed(2));
}

async function main() {
  await sequelize.authenticate();

  const [storeRows, productRows] = await Promise.all([
    StoreStock.findAll({
      attributes: ["id", "storeId", "productId", "quantity"],
      where: { quantity: { [Op.ne]: 0 } },
      raw: true,
    }),
    InventoryProduct.findAll({
      attributes: ["id", "name", "stock"],
      where: { stock: { [Op.ne]: 0 } },
      raw: true,
    }),
  ]);

  const storeSum = storeRows.reduce((s, r) => s + Number(r.quantity || 0), 0);
  const productSum = productRows.reduce((s, r) => s + Number(r.stock || 0), 0);

  const [allStoreCount, allProductCount] = await Promise.all([
    StoreStock.count(),
    InventoryProduct.count(),
  ]);

  console.log("=== Seed: stock → 0 (todos los productos / locales) ===");
  console.log(`Modo: ${APPLY ? "APPLY (escribe BD)" : "DRY-RUN (no escribe)"}`);
  console.log(`Filas StoreStock totales: ${allStoreCount}`);
  console.log(`  con quantity ≠ 0: ${storeRows.length} (suma qty: ${money(storeSum)})`);
  console.log(`Productos totales: ${allProductCount}`);
  console.log(`  con stock ≠ 0: ${productRows.length} (suma stock: ${money(productSum)})`);

  if (storeRows.length) {
    console.log("\nMuestra StoreStock ≠ 0 (máx 15):");
    for (const r of storeRows.slice(0, 15)) {
      console.log(`  store#${r.storeId} product#${r.productId} qty=${r.quantity}`);
    }
  }
  if (productRows.length) {
    console.log("\nMuestra productos stock ≠ 0 (máx 15):");
    for (const r of productRows.slice(0, 15)) {
      console.log(`  #${r.id} ${r.name} stock=${r.stock}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry-run OK. Para aplicar:");
    console.log("  node scripts/seed-zero-all-stock.mjs --apply");
    await sequelize.close();
    return;
  }

  const result = await sequelize.transaction(async (t) => {
    const [storeUpdated] = await StoreStock.update(
      { quantity: 0 },
      { where: {}, transaction: t },
    );
    const [productUpdated] = await InventoryProduct.update(
      { stock: 0 },
      { where: {}, transaction: t },
    );
    return { storeUpdated, productUpdated };
  });

  console.log("\nAplicado:");
  console.log(`  StoreStock filas tocadas: ${result.storeUpdated}`);
  console.log(`  Productos stock=0: ${result.productUpdated}`);
  console.log("  Movimientos: 0 (intencional)");

  await sequelize.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
