/**
 * Reorganiza categorías/subcategorías y reasigna productos según tipo y nombre.
 * Uso: npm run db:reorganize:categories
 */
import "dotenv/config";
import { Op } from "sequelize";
import { sequelize } from "../src/database/connection.js";
import { InventoryCategory, InventoryProduct } from "../src/models/Inventory.js";

const PAN_PACKAGE_TIERS = [
  { qty: 2, totalPrice: 0.25 },
  { qty: 4, totalPrice: 0.5 },
  { qty: 8, totalPrice: 1 },
];

const ROOT = {
  abarrotes: 1,
  reposteria: 2,
  panaderia: 3,
  liquidos: 4,
  pasteleria: 5,
  accesorios: 6,
};

const EXISTING_SUB = {
  levadura: 7,
  cremaMasscream: 8,
  mantequillaHojaldrina: 9,
  premezclaChocolate: 10,
  azucarImpalpable: 11,
  harina: 12,
  mantequilla: 13,
  huevos: 14,
  cocoa: 15,
  azucar: 16,
  manjar: 17,
  harinaIntegral: 18,
  harinaMaiz: 19,
  leche: 20,
  grajeas: 21,
  cremaLeche: 22,
  royal: 23,
  bicarbonato: 24,
  aceite: 25,
  panes: 26,
  gaseosas: 27,
  galletas: 28,
};

async function findOrCreateSub({ name, parentId, description = "", isPublic = true, extra = {} }) {
  let row = await InventoryCategory.findOne({ where: { name } });
  if (!row) {
    row = await InventoryCategory.create({
      name,
      description,
      parentId,
      isPublic,
      ...extra,
    });
    console.log(`   + Subcategoría creada: ${name} (id ${row.id})`);
  } else {
    await row.update({ parentId, description, isPublic, ...extra });
    console.log(`   · Subcategoría actualizada: ${name} (id ${row.id})`);
  }
  return row.id;
}

async function assignProducts(categoryId, productIds, label) {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (!ids.length) return 0;
  const [count] = await InventoryProduct.update(
    { categoryId },
    { where: { id: { [Op.in]: ids } } },
  );
  console.log(`   → ${label}: ${count} producto(s)`);
  return count;
}

async function assignByNamePatterns(categoryId, patterns, { type, excludeIds = [] } = {}) {
  const products = await InventoryProduct.findAll({
    attributes: ["id", "name", "type", "categoryId"],
    where: type ? { type } : {},
  });
  const exclude = new Set(excludeIds);
  const re = patterns.map((p) => (p instanceof RegExp ? p : new RegExp(p, "i")));
  const ids = products
    .filter((p) => !exclude.has(p.id) && re.some((rx) => rx.test(p.name)))
    .map((p) => p.id);
  return assignProducts(categoryId, ids, `patrones → ${patterns.join("|")}`);
}

try {
  await sequelize.authenticate();
  console.log("📦 Reorganizando categorías y productos…\n");

  // ── Raíces ──
  await InventoryCategory.update(
    {
      name: "Abarrotes",
      description: "Insumos, ingredientes y materias primas",
      parentId: null,
      isPublic: false,
    },
    { where: { id: ROOT.abarrotes } },
  );
  await InventoryCategory.update(
    {
      name: "Repostería",
      description: "Donas, suspiros, postres en vaso y dulces",
      parentId: null,
      isPublic: true,
    },
    { where: { id: ROOT.reposteria } },
  );
  await InventoryCategory.update(
    {
      name: "Panadería",
      description: "Panes, galletas y masas",
      parentId: null,
      isPublic: true,
    },
    { where: { id: ROOT.panaderia } },
  );
  await InventoryCategory.update(
    {
      name: "Líquidos",
      description: "Bebidas para venta en mostrador",
      parentId: null,
      isPublic: true,
    },
    { where: { id: ROOT.liquidos } },
  );
  await InventoryCategory.update(
    {
      name: "Pastelería",
      description: "Pasteles, tortas y porciones",
      parentId: null,
      isPublic: true,
    },
    { where: { id: ROOT.pasteleria } },
  );
  await InventoryCategory.update(
    {
      name: "Accesorios",
      description: "Velas, empaque y detalles",
      parentId: null,
      isPublic: true,
    },
    { where: { id: ROOT.accesorios } },
  );

  // Insumos genéricos bajo Abarrotes
  for (const id of Object.values(EXISTING_SUB).slice(0, 19)) {
    await InventoryCategory.update({ parentId: ROOT.abarrotes }, { where: { id } });
  }

  await InventoryCategory.update(
    {
      parentId: ROOT.panaderia,
      packageTiers: PAN_PACKAGE_TIERS,
      mixMatchLabel: "Pan surtido",
      isPublic: true,
      description: "Panes de mostrador — tramos y canasta surtido en caja",
    },
    { where: { id: EXISTING_SUB.panes } },
  );

  await InventoryCategory.update(
    {
      parentId: ROOT.panaderia,
      isPublic: true,
      description: "Galletas y snacks dulces empaquetados",
    },
    { where: { id: EXISTING_SUB.galletas } },
  );

  await InventoryCategory.update(
    {
      parentId: ROOT.liquidos,
      isPublic: true,
      description: "Gaseosas, colas y bebidas carbonatadas",
    },
    { where: { id: EXISTING_SUB.gaseosas } },
  );

  // ── Nuevas subcategorías ──
  const sub = {
    empaque: await findOrCreateSub({
      name: "Empaque",
      parentId: ROOT.abarrotes,
      description: "Bandejas, fundas y material de empaque",
      isPublic: false,
    }),
    insumosVarios: await findOrCreateSub({
      name: "Insumos varios",
      parentId: ROOT.abarrotes,
      description: "Sal, miel, polvo de hornear y otros insumos",
      isPublic: false,
    }),
    frutas: await findOrCreateSub({
      name: "Frutas frescas",
      parentId: ROOT.abarrotes,
      description: "Frutas usadas en producción",
      isPublic: false,
    }),
    masasPanaderia: await findOrCreateSub({
      name: "Masas panadería",
      parentId: ROOT.panaderia,
      description: "Masas e intermedios de pan",
      isPublic: false,
    }),
    pasteles: await findOrCreateSub({
      name: "Pasteles",
      parentId: ROOT.pasteleria,
      description: "Pasteles y tortas para venta",
      isPublic: true,
    }),
    masasPasteleria: await findOrCreateSub({
      name: "Masas pastelería",
      parentId: ROOT.pasteleria,
      description: "Masas, empastes y bases de pastel",
      isPublic: false,
    }),
    donas: await findOrCreateSub({
      name: "Donas",
      parentId: ROOT.reposteria,
      description: "Donas y mini donas",
      isPublic: true,
    }),
    suspiros: await findOrCreateSub({
      name: "Suspiros y bocaditos",
      parentId: ROOT.reposteria,
      description: "Suspiros, bocaditos y bolitas",
      isPublic: true,
    }),
    postresVaso: await findOrCreateSub({
      name: "Postres en vaso",
      parentId: ROOT.reposteria,
      description: "Gelatinas, cremas y postres individuales",
      isPublic: true,
    }),
    tortasBandejas: await findOrCreateSub({
      name: "Tortas y bandejas",
      parentId: ROOT.reposteria,
      description: "Tres leches, bandejas y tortas por porciones",
      isPublic: true,
    }),
    insumosReposteria: await findOrCreateSub({
      name: "Insumos repostería",
      parentId: ROOT.reposteria,
      description: "Insumos usados en repostería",
      isPublic: false,
    }),
    agua: await findOrCreateSub({
      name: "Agua",
      parentId: ROOT.liquidos,
      description: "Agua embotellada",
      isPublic: true,
    }),
    jugos: await findOrCreateSub({
      name: "Jugos y néctares",
      parentId: ROOT.liquidos,
      description: "Jugos, néctares y del valle",
      isPublic: true,
    }),
    lacteos: await findOrCreateSub({
      name: "Lácteos",
      parentId: ROOT.liquidos,
      description: "Leche y yogurt para venta",
      isPublic: true,
    }),
    cafe: await findOrCreateSub({
      name: "Café e infusiones",
      parentId: ROOT.liquidos,
      description: "Café en sobre, frasco y listo para tomar",
      isPublic: true,
    }),
    bebidasVarias: await findOrCreateSub({
      name: "Bebidas varias",
      parentId: ROOT.liquidos,
      description: "Malta, coladas, isotónicas y bebidas varias",
      isPublic: true,
    }),
    velas: await findOrCreateSub({
      name: "Velas",
      parentId: ROOT.accesorios,
      description: "Velas y detalles para pasteles",
      isPublic: true,
    }),
  };

  console.log("\n🔗 Reasignando productos…");

  // ── Abarrotes: genéricos por familia ──
  const genericToSub = {
    Aceite: EXISTING_SUB.aceite,
    Azucar: EXISTING_SUB.azucar,
    "Azúcar impalpable": EXISTING_SUB.azucarImpalpable,
    Bicarbonato: EXISTING_SUB.bicarbonato,
    Cocoa: EXISTING_SUB.cocoa,
    Grajeas: EXISTING_SUB.grajeas,
    Harina: EXISTING_SUB.harina,
    "Harina de Maiz": EXISTING_SUB.harinaMaiz,
    "Harina Integral": EXISTING_SUB.harinaIntegral,
    Huevos: EXISTING_SUB.huevos,
    Manjar: EXISTING_SUB.manjar,
    Mantequilla: EXISTING_SUB.mantequilla,
    "Mantequilla Hojaldrina": EXISTING_SUB.mantequillaHojaldrina,
    "Premezcla de Chocolate": EXISTING_SUB.premezclaChocolate,
    Levadura: EXISTING_SUB.levadura,
    "Crema de leche": EXISTING_SUB.cremaLeche,
    "Crema de leche Masscream": EXISTING_SUB.cremaMasscream,
    Leche: EXISTING_SUB.leche,
    Royal: EXISTING_SUB.royal,
  };

  for (const [name, catId] of Object.entries(genericToSub)) {
    await InventoryProduct.update(
      { categoryId: catId },
      { where: { name, isGenericIngredient: true } },
    );
  }

  await assignProducts(EXISTING_SUB.huevos, [167], "Cubetas de huevos");
  await assignProducts(EXISTING_SUB.manjar, [164], "Manjar postre");
  await assignProducts(EXISTING_SUB.mantequilla, [157], "Mantequilla fabriPan");
  await assignProducts(EXISTING_SUB.azucarImpalpable, [162], "Azúcar impalpable levanpan");
  await assignProducts(EXISTING_SUB.harina, [151, 150], "Presentaciones harina");
  await assignProducts(EXISTING_SUB.azucar, [149, 148], "Presentaciones azúcar");
  await assignProducts(EXISTING_SUB.harinaIntegral, [183], "Harina integral quintal");
  await assignProducts(EXISTING_SUB.aceite, [13], "Funda aceite");
  await assignProducts(EXISTING_SUB.levadura, [156, 161], "Presentaciones levadura");

  await assignProducts(sub.empaque, [111], "Empaque bandejita");
  await assignProducts(sub.insumosVarios, [37, 31, 163, 6], "Insumos varios");
  await assignProducts(sub.frutas, [34], "Frutas");

  // Snacks/galletas revendidos que estaban en abarrotes
  await assignProducts(EXISTING_SUB.galletas, [158, 140, 139, 136], "Snacks → Galletas");

  // ── Repostería ──
  await assignProducts(sub.donas, [16, 12, 11, 108, 69, 10], "Donas");
  await assignProducts(sub.suspiros, [99, 45, 51, 110, 97, 199], "Suspiros y bocaditos");
  await assignProducts(sub.postresVaso, [107, 182, 181, 184], "Postres en vaso");
  await assignProducts(sub.tortasBandejas, [104, 73], "Tortas y bandejas");
  await assignProducts(EXISTING_SUB.galletas, [106], "Galletas punto rojo");
  await assignProducts(sub.insumosReposteria, [9], "Chocolate líquido");
  await assignProducts(EXISTING_SUB.mantequillaHojaldrina, [80], "Mantequilla hojaldrina genérica");

  // ── Pastelería ──
  await assignProducts(sub.masasPasteleria, [115, 100], "Masas pastelería");
  await assignProducts(EXISTING_SUB.premezclaChocolate, [98], "Premezcla genérica");

  const pastelIds = [
    134, 93, 89, 82, 81, 109, 75, 74, 72, 101, 56, 62, 55, 96, 92, 63, 42, 88, 87, 41,
    61, 54, 95, 91, 28, 18, 86, 85, 25, 59, 52, 27, 17, 26, 60, 53, 94, 90, 15, 14, 84,
    83, 24, 132, 185, 105,
  ];
  await assignProducts(sub.pasteles, pastelIds, "Pasteles");

  // ── Panadería ──
  const masaPanIds = [
    38, 58, 102, 21, 113, 46, 48, 30, 29, 47, 40, 114, 79,
  ];
  await assignProducts(sub.masasPanaderia, masaPanIds, "Masas panadería");
  await assignProducts(EXISTING_SUB.galletas, [138], "Galletas con oreo");
  await assignProducts(EXISTING_SUB.royal, [23], "Royal");
  await assignProducts(sub.insumosVarios, [116], "Colorante");

  // Panes finales que deben quedar en Panes (incluye fundas/intermedios de venta en mostrador)
  const panIds = [
    118, 120, 70, 64, 189, 35, 50, 39, 112, 78, 44, 57, 122, 119, 67, 143, 123, 71, 125,
    103, 146, 117, 169, 49, 168, 121, 76, 124, 66, 65, 120,
  ];
  await assignProducts(EXISTING_SUB.panes, panIds, "Panes mostrador");

  // ── Líquidos ──
  await assignProducts(EXISTING_SUB.leche, [22], "Leche insumo");
  await assignProducts(EXISTING_SUB.cremaLeche, [77], "Crema de leche insumo");
  await assignProducts(EXISTING_SUB.cremaMasscream, [20], "Crema Masscream insumo");

  const gaseosaIds = [
    173, 172, 171, 153, 135, 165, 137, 129, 126, 155, 188, 193, 192, 194, 186, 133,
  ];
  await assignProducts(EXISTING_SUB.gaseosas, gaseosaIds, "Gaseosas");

  await assignProducts(sub.agua, [144, 142, 141, 152], "Agua");
  await assignProducts(sub.jugos, [130, 128, 127, 177, 176], "Jugos y néctares");
  await assignProducts(sub.lacteos, [198, 187, 195, 197, 196], "Lácteos");
  await assignProducts(sub.cafe, [179, 178, 180, 190], "Café e infusiones");
  await assignProducts(sub.bebidasVarias, [
    68, 170, 145, 174, 175, 131, 166,
  ], "Bebidas varias");

  // ── Accesorios ──
  await assignProducts(sub.velas, [191, 160, 154, 159], "Velas");

  // ── Canasta surtido de panes ──
  const panProducts = await InventoryProduct.findAll({
    where: { categoryId: EXISTING_SUB.panes, type: "final" },
    attributes: ["id", "name"],
    order: [["name", "ASC"]],
  });
  const panProductIds = panProducts.map((p) => p.id);
  await InventoryCategory.update(
    {
      mixMatchProductIds: panProductIds.length ? panProductIds : null,
      packageTiers: PAN_PACKAGE_TIERS,
      mixMatchLabel: "Pan surtido",
    },
    { where: { id: EXISTING_SUB.panes } },
  );

  // ── Resumen ──
  const roots = await InventoryCategory.findAll({ where: { parentId: null }, order: [["id", "ASC"]] });
  console.log("\n✅ Jerarquía final:");
  for (const root of roots) {
    const children = await InventoryCategory.findAll({
      where: { parentId: root.id },
      order: [["name", "ASC"]],
    });
    console.log(`\n${root.name} (id ${root.id})`);
    for (const child of children) {
      const count = await InventoryProduct.count({ where: { categoryId: child.id } });
      console.log(`   ↳ ${child.name} (id ${child.id}) · ${count} productos`);
    }
    const direct = await InventoryProduct.count({ where: { categoryId: root.id } });
    if (direct) console.log(`   · ${direct} producto(s) aún en la raíz (revisar)`);
  }

  const unassigned = await InventoryProduct.count({ where: { categoryId: null } });
  if (unassigned) console.log(`\n⚠ ${unassigned} productos sin categoría`);

  console.log(`\n   Canasta surtido: ${panProductIds.length} panes → ids [${panProductIds.join(", ")}]`);

  await sequelize.close();
  process.exit(0);
} catch (error) {
  console.error("❌ Error:", error?.message || error);
  process.exit(1);
}
