/**
 * Fusiona "Pan de Yema" → "Pan de Sal":
 * pasa ventas, movimientos y demás FKs al Pan de Sal, luego desactiva/borra Pan de Yema.
 *
 * Uso:
 *   node scripts/merge-pan-de-yema-into-pan-de-sal.mjs           # dry-run
 *   node scripts/merge-pan-de-yema-into-pan-de-sal.mjs --apply   # aplica
 *
 * Opcional:
 *   --from-id=146 --to-id=103
 *   --delete   (borra el producto origen; por defecto solo isActive=false)
 */
import "dotenv/config";
import { QueryTypes } from "sequelize";
import { sequelize } from "../src/database/connection.js";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const DELETE_SOURCE = args.includes("--delete");

function argNum(name, fallback) {
  const hit = args.find((a) => a.startsWith(`${name}=`));
  if (!hit) return fallback;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) ? n : fallback;
}

const FROM_ID = argNum("--from-id", 146);
const TO_ID = argNum("--to-id", 103);

async function q(sql, replacements = {}) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

async function exec(sql, replacements = {}) {
  if (!APPLY) {
    console.log("  [dry-run]", sql.replace(/\s+/g, " ").trim(), replacements);
    return [{ affectedRows: 0 }];
  }
  return sequelize.query(sql, { replacements });
}

async function tableExists(name) {
  const rows = await q("SHOW TABLES LIKE :name", { name });
  return rows.length > 0;
}

async function countWhere(table, col, id) {
  if (!(await tableExists(table))) return 0;
  const rows = await q(
    `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${col}\` = :id`,
    { id },
  );
  return Number(rows[0]?.n || 0);
}

/**
 * Reasigna productId. Si hay unique (storeId, productId), suma qty y borra duplicado origen.
 */
async function remapsSimple(table, col = "productId") {
  const n = await countWhere(table, col, FROM_ID);
  console.log(`- ${table}.${col}: ${n} fila(s)`);
  if (!n) return;
  await exec(
    `UPDATE \`${table}\` SET \`${col}\` = :toId WHERE \`${col}\` = :fromId`,
    { toId: TO_ID, fromId: FROM_ID },
  );
}

async function remapsStoreStocks() {
  const table = "ERP_store_stocks";
  if (!(await tableExists(table))) return;
  const rows = await q(
    `SELECT id, storeId, quantity FROM \`${table}\` WHERE productId = :fromId`,
    { fromId: FROM_ID },
  );
  console.log(`- ${table}: ${rows.length} fila(s)`);
  for (const row of rows) {
    const existing = await q(
      `SELECT id, quantity FROM \`${table}\` WHERE storeId = :storeId AND productId = :toId LIMIT 1`,
      { storeId: row.storeId, toId: TO_ID },
    );
    if (existing.length) {
      const qty = Number(existing[0].quantity || 0) + Number(row.quantity || 0);
      await exec(`UPDATE \`${table}\` SET quantity = :qty WHERE id = :id`, {
        qty,
        id: existing[0].id,
      });
      await exec(`DELETE FROM \`${table}\` WHERE id = :id`, { id: row.id });
    } else {
      await exec(`UPDATE \`${table}\` SET productId = :toId WHERE id = :id`, {
        toId: TO_ID,
        id: row.id,
      });
    }
  }
}

async function remapsStoreProducts() {
  const table = "ERP_store_products";
  if (!(await tableExists(table))) return;
  const rows = await q(
    `SELECT id, storeId FROM \`${table}\` WHERE productId = :fromId`,
    { fromId: FROM_ID },
  );
  console.log(`- ${table}: ${rows.length} fila(s)`);
  for (const row of rows) {
    const existing = await q(
      `SELECT id FROM \`${table}\` WHERE storeId = :storeId AND productId = :toId LIMIT 1`,
      { storeId: row.storeId, toId: TO_ID },
    );
    if (existing.length) {
      await exec(`DELETE FROM \`${table}\` WHERE id = :id`, { id: row.id });
    } else {
      await exec(`UPDATE \`${table}\` SET productId = :toId WHERE id = :id`, {
        toId: TO_ID,
        id: row.id,
      });
    }
  }
}

async function remapsCompareGroupItems() {
  const table = "ERP_product_compare_group_items";
  if (!(await tableExists(table))) return;
  const rows = await q(
    `SELECT id, groupId FROM \`${table}\` WHERE productId = :fromId`,
    { fromId: FROM_ID },
  );
  console.log(`- ${table}: ${rows.length} fila(s)`);
  for (const row of rows) {
    const existing = await q(
      `SELECT id FROM \`${table}\` WHERE groupId = :groupId AND productId = :toId LIMIT 1`,
      { groupId: row.groupId, toId: TO_ID },
    );
    if (existing.length) {
      await exec(`DELETE FROM \`${table}\` WHERE id = :id`, { id: row.id });
    } else {
      await exec(`UPDATE \`${table}\` SET productId = :toId WHERE id = :id`, {
        toId: TO_ID,
        id: row.id,
      });
    }
  }
}

async function remapsJsonIdArrays() {
  // Pricing tier groups
  if (await tableExists("ERP_pricing_tier_groups")) {
    const groups = await q(
      `SELECT id, productIds FROM ERP_pricing_tier_groups WHERE CAST(productIds AS CHAR) LIKE :like`,
      { like: `%${FROM_ID}%` },
    );
    console.log(`- ERP_pricing_tier_groups JSON: ${groups.length}`);
    for (const g of groups) {
      let ids = g.productIds;
      if (typeof ids === "string") {
        try {
          ids = JSON.parse(ids);
        } catch {
          continue;
        }
      }
      if (!Array.isArray(ids)) continue;
      const next = [
        ...new Set(
          ids.map((x) => Number(x)).map((id) => (id === FROM_ID ? TO_ID : id)),
        ),
      ].filter((n) => Number.isFinite(n) && n > 0);
      await exec(
        `UPDATE ERP_pricing_tier_groups SET productIds = :json WHERE id = :id`,
        { json: JSON.stringify(next), id: g.id },
      );
    }
  }

  // Categorías mixMatchProductIds
  if (await tableExists("ERP_inventory_categories")) {
    const cats = await q(
      `SELECT id, mixMatchProductIds FROM ERP_inventory_categories WHERE CAST(mixMatchProductIds AS CHAR) LIKE :like`,
      { like: `%${FROM_ID}%` },
    );
    console.log(`- ERP_inventory_categories mixMatchProductIds: ${cats.length}`);
    for (const c of cats) {
      let ids = c.mixMatchProductIds;
      if (typeof ids === "string") {
        try {
          ids = JSON.parse(ids);
        } catch {
          continue;
        }
      }
      if (!Array.isArray(ids)) continue;
      const next = [
        ...new Set(
          ids.map((x) => Number(x)).map((id) => (id === FROM_ID ? TO_ID : id)),
        ),
      ].filter((n) => Number.isFinite(n) && n > 0);
      await exec(
        `UPDATE ERP_inventory_categories SET mixMatchProductIds = :json WHERE id = :id`,
        { json: JSON.stringify(next), id: c.id },
      );
    }
  }
}

async function remapsRecipes() {
  const table = "ERP_inventory_recipes";
  if (!(await tableExists(table))) return;
  const asFinal = await countWhere(table, "productFinalId", FROM_ID);
  const asRaw = await countWhere(table, "productRawId", FROM_ID);
  console.log(`- ${table} productFinalId: ${asFinal}, productRawId: ${asRaw}`);
  if (asFinal) {
    await exec(
      `UPDATE \`${table}\` SET productFinalId = :toId WHERE productFinalId = :fromId`,
      { toId: TO_ID, fromId: FROM_ID },
    );
  }
  if (asRaw) {
    await exec(
      `UPDATE \`${table}\` SET productRawId = :toId WHERE productRawId = :fromId`,
      { toId: TO_ID, fromId: FROM_ID },
    );
  }
}

async function mergeStock() {
  const [fromRows] = await sequelize.query(
    `SELECT id, name, stock FROM ERP_inventory_products WHERE id = :id`,
    { replacements: { id: FROM_ID } },
  );
  const [toRows] = await sequelize.query(
    `SELECT id, name, stock FROM ERP_inventory_products WHERE id = :id`,
    { replacements: { id: TO_ID } },
  );
  if (!fromRows.length || !toRows.length) {
    throw new Error("No se encontraron ambos productos (from/to).");
  }
  const from = fromRows[0];
  const to = toRows[0];
  const mergedStock = Number(to.stock || 0) + Number(from.stock || 0);
  console.log(
    `Productos: "${from.name}" (#${from.id}, stock ${from.stock}) → "${to.name}" (#${to.id}, stock ${to.stock})`,
  );
  console.log(`Stock fusionado destino: ${mergedStock}`);
  if (Number(from.stock || 0) !== 0) {
    await exec(
      `UPDATE ERP_inventory_products SET stock = :stock WHERE id = :toId`,
      { stock: mergedStock, toId: TO_ID },
    );
  }
  return { from, to };
}

async function retireSource() {
  if (DELETE_SOURCE) {
    console.log(`- Borrar producto origen #${FROM_ID}`);
    await exec(`DELETE FROM ERP_inventory_products WHERE id = :fromId`, {
      fromId: FROM_ID,
    });
  } else {
    console.log(`- Desactivar producto origen #${FROM_ID} (isActive=0, stock=0)`);
    await exec(
      `UPDATE ERP_inventory_products
       SET isActive = 0, stock = 0, name = CONCAT('[FUSIONADO] ', name)
       WHERE id = :fromId`,
      { fromId: FROM_ID },
    );
  }
}

async function main() {
  await sequelize.authenticate();
  console.log(
    APPLY
      ? ">>> APLICANDO fusión Pan de Yema → Pan de Sal"
      : ">>> DRY-RUN (no escribe). Usá --apply para ejecutar.",
  );
  console.log(`fromId=${FROM_ID} → toId=${TO_ID}`);

  const { from, to } = await mergeStock();
  if (!/yema/i.test(String(from.name)) || !/sal/i.test(String(to.name))) {
    console.warn(
      `⚠ Nombres inesperados: origen="${from.name}", destino="${to.name}". Continuá solo si es correcto.`,
    );
  }

  console.log("\nReasignando referencias...");
  await remapsSimple("ERP_order_items");
  await remapsSimple("ERP_supplier_order_items");
  await remapsSimple("ERP_inventory_movements");
  await remapsSimple("ERP_inventory_batches");
  await remapsSimple("ERP_home_products");
  await remapsSimple("ERP_cash_shift_movements");
  if (await tableExists("ERP_catalog")) {
    await remapsSimple("ERP_catalog");
  }
  await remapsStoreStocks();
  await remapsStoreProducts();
  await remapsCompareGroupItems();
  await remapsRecipes();
  await remapsJsonIdArrays();

  // Presentaciones genéricas
  if (await tableExists("ERP_inventory_products")) {
    const n = await countWhere("ERP_inventory_products", "genericProductId", FROM_ID);
    console.log(`- ERP_inventory_products.genericProductId: ${n}`);
    if (n) {
      await exec(
        `UPDATE ERP_inventory_products SET genericProductId = :toId WHERE genericProductId = :fromId`,
        { toId: TO_ID, fromId: FROM_ID },
      );
    }
  }

  await retireSource();

  console.log("\nListo.");
  if (!APPLY) {
    console.log("Volvé a correr con --apply para aplicar los cambios.");
  } else {
    const [check] = await sequelize.query(
      `SELECT
         (SELECT COUNT(*) FROM ERP_order_items WHERE productId = :fromId) AS ordersLeft,
         (SELECT COUNT(*) FROM ERP_inventory_movements WHERE productId = :fromId) AS movLeft,
         (SELECT COUNT(*) FROM ERP_order_items WHERE productId = :toId) AS ordersOnSal,
         (SELECT stock FROM ERP_inventory_products WHERE id = :toId) AS salStock,
         (SELECT isActive FROM ERP_inventory_products WHERE id = :fromId) AS yemaActive`,
      { replacements: { fromId: FROM_ID, toId: TO_ID } },
    );
    console.log("Verificación:", check[0]);
  }

  await sequelize.close();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await sequelize.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
