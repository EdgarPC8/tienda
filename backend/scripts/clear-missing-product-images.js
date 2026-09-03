/**
 * Limpia primaryImageUrl cuando el archivo ya no existe en src/img.
 *
 * Uso (desde AppsWeb/eddeli/backend):
 *   node scripts/clear-missing-product-images.js --dry-run
 *   node scripts/clear-missing-product-images.js
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Op } from "sequelize";
import { sequelize } from "../src/database/connection.js";
import { InventoryProduct } from "../src/models/Inventory.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_BASE = path.resolve(__dirname, "../src/img");
const dryRun = process.argv.includes("--dry-run");

function normalizeRel(p = "") {
  return String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

async function main() {
  await sequelize.authenticate();

  const rows = await InventoryProduct.findAll({
    where: {
      primaryImageUrl: { [Op.and]: [{ [Op.ne]: null }, { [Op.ne]: "" }] },
    },
    attributes: ["id", "name", "primaryImageUrl"],
    order: [["id", "ASC"]],
  });

  const missing = [];
  for (const row of rows) {
    const rel = normalizeRel(row.primaryImageUrl);
    if (!rel) continue;
    const abs = path.join(IMG_BASE, rel);
    if (!fs.existsSync(abs)) {
      missing.push({ id: row.id, name: row.name, rel });
    }
  }

  if (!missing.length) {
    console.log("Ningún producto con primaryImageUrl apunta a un archivo inexistente.");
    return;
  }

  console.log(`Encontrados ${missing.length} producto(s) con ruta rota:\n`);
  for (const m of missing) {
    console.log(`  #${m.id}  ${m.name}`);
    console.log(`         → ${m.rel}`);
  }

  if (dryRun) {
    console.log("\n--dry-run: no se escribió nada. Quitá el flag para limpiar (dejar primaryImageUrl en NULL).");
    return;
  }

  let cleared = 0;
  for (const m of missing) {
    const [n] = await InventoryProduct.update(
      { primaryImageUrl: null },
      { where: { id: m.id } },
    );
    cleared += n;
  }

  console.log(`\nListo: ${cleared} producto(s) con primaryImageUrl = NULL.`);
}

main()
  .catch((err) => {
    console.error("Error:", err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch {
      /* ignore */
    }
  });
