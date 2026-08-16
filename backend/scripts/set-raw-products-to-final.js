/**
 * ONE-SHOT: pasa productos tipo insumo (raw) a tipo final.
 *
 * Uso (desde el backend de la app, con .env apuntando a la BD del servidor):
 *   node scripts/set-raw-products-to-final.js --dry-run   # solo lista, no escribe
 *   node scripts/set-raw-products-to-final.js             # aplica el cambio
 *
 * Qué hace:
 *   - type: 'raw' → 'final'
 *   - isGenericIngredient → false (deja de tratarse como insumo genérico)
 *
 * Borrar este archivo después de ejecutarlo en el servidor.
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { InventoryProduct } from "../src/models/Inventory.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  await sequelize.authenticate();

  const rows = await InventoryProduct.findAll({
    where: { type: "raw" },
    attributes: ["id", "name", "type", "isGenericIngredient", "sku", "barcode"],
    order: [["name", "ASC"]],
  });

  if (!rows.length) {
    console.log("No hay productos con type=raw (insumo). Nada que hacer.");
    return;
  }

  console.log(`Encontrados ${rows.length} producto(s) tipo insumo (raw):\n`);
  for (const p of rows) {
    console.log(
      `  #${p.id}  ${p.name}  · genérico=${p.isGenericIngredient ? "sí" : "no"}` +
        (p.sku ? `  · sku=${p.sku}` : "") +
        (p.barcode ? `  · barcode=${p.barcode}` : ""),
    );
  }

  if (dryRun) {
    console.log("\n--dry-run: no se escribió nada. Quitá el flag para aplicar.");
    return;
  }

  const [affected] = await InventoryProduct.update(
    { type: "final", isGenericIngredient: false },
    { where: { type: "raw" } },
  );

  console.log(
    `\nListo: ${affected} producto(s) actualizado(s) a type=final (isGenericIngredient=false).`,
  );
  console.log("Podés borrar este script del servidor.");
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
