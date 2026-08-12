/**
 * Jerarquía de categorías: principales + subcategorías + Panes bajo Panadería.
 * Uso: npm run db:migrate:categories
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory, InventoryProduct } from "../src/models/Inventory.js";

const MAIN_ROOT_IDS = {
  abarrotes: 1,
  reposteria: 2,
  panaderia: 3,
  liquidos: 4,
  pasteleria: 5,
  accesorios: 6,
};

const INSUMO_CHILD_IDS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];

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
  await InventoryCategory.sync({ alter: true });

  await InventoryCategory.update(
    {
      name: "Abarrotes",
      description: "Insumos e ingredientes (harina, levadura, aceite, etc.)",
      parentId: null,
    },
    { where: { id: MAIN_ROOT_IDS.abarrotes } },
  );

  await InventoryCategory.update(
    { name: "Accesorios", parentId: null },
    { where: { id: MAIN_ROOT_IDS.accesorios } },
  );

  for (const id of [2, 3, 4, 5, 6]) {
    await InventoryCategory.update({ parentId: null }, { where: { id } });
  }

  for (const id of INSUMO_CHILD_IDS) {
    await InventoryCategory.update(
      { parentId: MAIN_ROOT_IDS.abarrotes },
      { where: { id } },
    );
  }

  let panes = await InventoryCategory.findOne({
    where: { name: "Panes", parentId: MAIN_ROOT_IDS.panaderia },
  });
  if (!panes) {
    panes = await InventoryCategory.create({
      name: "Panes",
      description: "Panes de mostrador — tramos y canasta surtido en caja",
      isPublic: true,
      parentId: MAIN_ROOT_IDS.panaderia,
      packageTiers: PAN_PACKAGE_TIERS,
      mixMatchLabel: "Pan surtido",
      mixMatchProductIds: null,
    });
  } else {
    await panes.update({
      parentId: MAIN_ROOT_IDS.panaderia,
      packageTiers: PAN_PACKAGE_TIERS,
      mixMatchLabel: "Pan surtido",
      isPublic: true,
    });
  }

  let gaseosas = await InventoryCategory.findOne({
    where: { name: "Gaseosas", parentId: MAIN_ROOT_IDS.liquidos },
  });
  if (!gaseosas) {
    gaseosas = await InventoryCategory.create({
      name: "Gaseosas",
      description: "Colas, gaseosas y bebidas embotelladas",
      isPublic: true,
      parentId: MAIN_ROOT_IDS.liquidos,
    });
  }

  const panProducts = await InventoryProduct.findAll({
    where: { name: PAN_PRODUCT_NAMES },
  });
  const panProductIds = panProducts.map((p) => p.id);

  for (const product of panProducts) {
    await product.update({
      categoryId: panes.id,
      price: 0.15,
      packageTiers: null,
    });
  }

  await panes.update({
    mixMatchProductIds: panProductIds.length ? panProductIds : null,
  });

  const movedFromOldPanes = await InventoryProduct.count({
    where: { categoryId: MAIN_ROOT_IDS.panaderia },
  });
  if (movedFromOldPanes > 0) {
    await InventoryProduct.update(
      { categoryId: panes.id },
      { where: { categoryId: MAIN_ROOT_IDS.panaderia } },
    );
    console.log(`   Reasignados ${movedFromOldPanes} productos de Panadería → Panes`);
  }

  console.log("✅ Jerarquía de categorías aplicada.");
  console.log("   Principales: Abarrotes, Panadería, Pastelería, Repostería, Líquidos, Accesorios");
  console.log(`   Panes (id ${panes.id}) bajo Panadería · Gaseosas (id ${gaseosas.id}) bajo Líquidos`);
  console.log(`   ${INSUMO_CHILD_IDS.length} insumos bajo Abarrotes`);
  if (panProducts.length) {
    console.log(
      "   Panes en canasta:",
      panProducts.map((p) => `${p.name} (#${p.id})`).join(", "),
    );
  }

  await sequelize.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
