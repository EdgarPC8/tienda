/**
 * Carga catálogo de tienda (unidades + categorías + productos) desde
 * catalog-tienda.json → BD Store (tablas ERP_inventory_*).
 *
 * Uso: npm run seed:catalog
 * Fuente: backup-tienda.json (solo catálogo, sin usuarios/pedidos).
 */
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "../.env") });

const { sequelize } = await import("../src/database/connection.js");
const {
  InventoryCategory,
  InventoryProduct,
  InventoryUnit,
} = await import("../src/models/Inventory.js");

const catalogPath = join(
  __dirname,
  "../src/database/catalog-tienda.json",
);

async function main() {
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  const units = raw.InventoryUnit || [];
  const cats = raw.InventoryCategory || [];
  const products = raw.InventoryProduct || [];

  if (!cats.length && !products.length) {
    throw new Error("catalog-tienda.json sin categorías/productos");
  }

  await sequelize.authenticate();
  console.log("Seed catálogo tienda →", sequelize.config.database);

  const t = await sequelize.transaction();
  try {
    for (const row of units) {
      const existing = await InventoryUnit.findByPk(row.id, { transaction: t });
      if (existing) await existing.update(row, { transaction: t });
      else await InventoryUnit.create(row, { transaction: t });
    }
    console.log(`  InventoryUnit: ${units.length}`);

    const parents = cats.filter((c) => c.parentId == null);
    const children = cats.filter((c) => c.parentId != null);
    for (const row of [...parents, ...children]) {
      const existing = await InventoryCategory.findByPk(row.id, {
        transaction: t,
      });
      if (existing) await existing.update(row, { transaction: t });
      else await InventoryCategory.create(row, { transaction: t });
    }
    console.log(`  InventoryCategory: ${cats.length}`);

    for (const row of products) {
      const existing = await InventoryProduct.findByPk(row.id, {
        transaction: t,
      });
      if (existing) await existing.update(row, { transaction: t });
      else await InventoryProduct.create(row, { transaction: t });
    }
    console.log(`  InventoryProduct: ${products.length}`);

    await t.commit();
    console.log("✅ Catálogo tienda cargado en BD Store.");
  } catch (err) {
    await t.rollback();
    throw err;
  } finally {
    await sequelize.close();
  }
}

main().catch((err) => {
  console.error("❌", err.message || err);
  process.exit(1);
});
