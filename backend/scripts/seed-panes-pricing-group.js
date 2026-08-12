/**
 * Grupo de precio mix en caja bajo subcategoría Panes (hija de Panadería).
 * Uso: npm run db:seed:panes-group
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory, InventoryProduct } from "../src/models/Inventory.js";

const PAN_PACKAGE_TIERS = [
  { qty: 2, totalPrice: 0.25 },
  { qty: 4, totalPrice: 0.5 },
  { qty: 8, totalPrice: 1 },
];

const PAN_PRODUCT_NAMES = [
  "Pan Enrollado",
  "Pan de Dulce",
  "Pan de Sal",
  "Pan de Chocolate",
];

try {
  await sequelize.authenticate();

  const panaderia = await InventoryCategory.findOne({ where: { name: "Panadería" } });
  if (!panaderia) {
    throw new Error('No existe la categoría principal "Panadería". Ejecuta npm run db:migrate:categories');
  }

  let panes = await InventoryCategory.findOne({
    where: { name: "Panes", parentId: panaderia.id },
  });
  if (!panes) {
    [panes] = await InventoryCategory.findOrCreate({
      where: { name: "Panes", parentId: panaderia.id },
      defaults: {
        description:
          "Panes de mostrador — canasta surtido en caja (2=$0.25, 4=$0.50, 8=$1.00)",
        isPublic: true,
        parentId: panaderia.id,
        packageTiers: PAN_PACKAGE_TIERS,
        mixMatchLabel: "Pan surtido",
        mixMatchProductIds: null,
      },
    });
  } else {
    await panes.update({
      parentId: panaderia.id,
      packageTiers: PAN_PACKAGE_TIERS,
      mixMatchLabel: "Pan surtido",
    });
  }

  const products = await InventoryProduct.findAll({
    where: { name: PAN_PRODUCT_NAMES },
  });

  const productIds = products.map((p) => p.id);

  await panes.update({
    mixMatchProductIds: productIds.length ? productIds : null,
  });

  const foundNames = new Set(products.map((p) => p.name));
  const missing = PAN_PRODUCT_NAMES.filter((n) => !foundNames.has(n));

  for (const product of products) {
    await product.update({
      categoryId: panes.id,
      price: 0.15,
      packageTiers: null,
    });
  }

  console.log(`✅ Subcategoría "Panes" (id ${panes.id}) bajo Panadería (id ${panaderia.id}).`);
  console.log("   Tramos:", JSON.stringify(PAN_PACKAGE_TIERS));
  console.log("   Canasta:", panes.mixMatchLabel, "→ IDs", productIds.join(", ") || "ninguno");
  console.log(
    "   Productos asignados:",
    products.map((p) => `${p.name} (#${p.id})`).join(", ") || "ninguno",
  );
  if (missing.length) {
    console.warn("⚠️  No encontrados en BD:", missing.join(", "));
  }

  await sequelize.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
