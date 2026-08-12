/**
 * Toma un backup EdDeli (p. ej. ~/Descargas/backup-eddeli.json) y aplica:
 * - insumos genéricos
 * - presentaciones: quintal/arroba (azúcar, harina), funda aceite Aisol
 *
 * Uso:
 *   node scripts/apply-insumos-to-backup.js [ruta-entrada.json] [ruta-salida.json]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseBackupJsonContent, ensureBackupShape } from "../src/database/insertData.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultIn = path.resolve(process.env.HOME || "", "Descargas/backup-eddeli.json");
const defaultOut = path.resolve(__dirname, "../src/database/backup.json");

const GENERIC_NAMES = [
  "Harina",
  "Mantequilla",
  "Huevos",
  "Cocoa",
  "Azucar",
  "Azúcar",
  "Manjar",
  "Harina Integral",
  "Levadura",
  "Harina de Maiz",
  "Harina de Maíz",
  "Leche",
  "Azúcar impalpable",
  "Grajeas",
  "Crema de leche",
  "Royal",
  "Bicarbonato",
  "Crema de leche Masscream",
  "Mantequilla Hojaldrina",
  "Premezcla de Chocolate",
];

function cloneProductTemplate(from) {
  const now = new Date().toISOString();
  return {
    desc: from?.desc ?? null,
    type: "raw",
    standardWeightGrams: 0,
    netWeight: 0,
    minStock: 0,
    price: from?.price ?? "0.00",
    wholesaleRules: null,
    packageTiers: null,
    distributorPrice: "0.00",
    taxRate: "0.00",
    sku: null,
    barcode: null,
    isActive: 1,
    primaryImageUrl: null,
    createdAt: from?.createdAt ?? now,
    updatedAt: now,
  };
}

export function applyInsumosToBackup(jsonData) {
  const data = ensureBackupShape({ ...jsonData });
  const products = data.InventoryProduct;
  const byName = new Map(products.map((p) => [p.name, p]));
  const byId = new Map(products.map((p) => [p.id, p]));

  let maxProductId = Math.max(0, ...products.map((p) => Number(p.id) || 0));
  let maxUnitId = Math.max(0, ...(data.InventoryUnit || []).map((u) => Number(u.id) || 0));

  const units = data.InventoryUnit || [];
  let arrobaUnit = units.find((u) => ["arroba", "arb", "@"].includes(u.abbreviation));
  if (!arrobaUnit) {
    arrobaUnit = {
      id: ++maxUnitId,
      name: "Arroba",
      abbreviation: "arroba",
      description: "25 libras (~11,34 kg) — formato de compra",
      factor: 11339.8,
    };
    units.push(arrobaUnit);
    data.InventoryUnit = units;
  }

  const qqUnit = units.find((u) => ["q", "qq"].includes(u.abbreviation));
  const literUnit = units.find((u) => ["l", "ml"].includes(u.abbreviation));

  for (const p of products) {
    if (!("isGenericIngredient" in p)) p.isGenericIngredient = 0;
    if (!("genericProductId" in p)) p.genericProductId = null;
    if (!("purchasePresentation" in p)) p.purchasePresentation = null;
  }

  for (const name of GENERIC_NAMES) {
    const row = byName.get(name);
    if (!row || row.type !== "raw") continue;
    row.isGenericIngredient = 1;
    row.genericProductId = null;
    row.purchasePresentation = null;
  }

  const azucar = byName.get("Azucar") || byName.get("Azúcar");
  const harina = byName.get("Harina");
  if (!azucar || !harina) {
    throw new Error("El backup debe incluir productos Azucar y Harina");
  }

  const azucarStockGrams = Number(azucar.stock ?? 0);
  const quintalFactor = Number(qqUnit?.factor ?? 45360);
  const azucarQuintals =
    azucarStockGrams > 0 && quintalFactor > 0
      ? Number((azucarStockGrams / quintalFactor).toFixed(4))
      : 0;

  azucar.stock = 0;

  const newProducts = [
    {
      name: "Aceite",
      genericId: null,
      isGeneric: true,
      unitId: literUnit?.id ?? 4,
      categoryId: byId.get(13)?.categoryId ?? 1,
      stock: 0,
      purchasePresentation: null,
    },
    {
      name: "Quintal de azúcar",
      genericId: azucar.id,
      isGeneric: false,
      unitId: qqUnit?.id ?? 5,
      categoryId: azucar.categoryId,
      stock: azucarQuintals,
      purchasePresentation: "Quintal",
    },
    {
      name: "Arroba de azúcar",
      genericId: azucar.id,
      isGeneric: false,
      unitId: arrobaUnit.id,
      categoryId: azucar.categoryId,
      stock: 0,
      purchasePresentation: "Arroba",
    },
    {
      name: "Quintal de harina",
      genericId: harina.id,
      isGeneric: false,
      unitId: qqUnit?.id ?? 5,
      categoryId: harina.categoryId,
      stock: 0,
      purchasePresentation: "Quintal",
    },
    {
      name: "Arroba de harina",
      genericId: harina.id,
      isGeneric: false,
      unitId: arrobaUnit.id,
      categoryId: harina.categoryId,
      stock: 0,
      purchasePresentation: "Arroba",
    },
  ];

  let aceiteGenericId = null;
  for (const spec of newProducts) {
    let row = byName.get(spec.name);
    if (!row) {
      const tpl = cloneProductTemplate(azucar);
      row = {
        id: ++maxProductId,
        name: spec.name,
        ...tpl,
        unitId: spec.unitId,
        categoryId: spec.categoryId,
        stock: spec.stock,
        isGenericIngredient: spec.isGeneric ? 1 : 0,
        genericProductId: spec.genericId,
        purchasePresentation: spec.purchasePresentation,
      };
      products.push(row);
      byName.set(row.name, row);
      byId.set(row.id, row);
    } else {
      row.isGenericIngredient = spec.isGeneric ? 1 : 0;
      row.genericProductId = spec.genericId;
      row.purchasePresentation = spec.purchasePresentation;
      row.unitId = spec.unitId;
      if (spec.stock > 0) row.stock = spec.stock;
    }
    if (spec.name === "Aceite") aceiteGenericId = row.id;
  }

  const aceiteAisol = byName.get("Aceite Aisol");
  if (aceiteAisol && aceiteGenericId) {
    aceiteAisol.name = "Funda Aceite Aisol 900ml";
    aceiteAisol.isGenericIngredient = 0;
    aceiteAisol.genericProductId = aceiteGenericId;
    aceiteAisol.purchasePresentation = "Funda 900ml";
    aceiteAisol.unitId = literUnit?.id ?? aceiteAisol.unitId;
  }

  data.InventoryProduct = products.sort((a, b) => a.id - b.id);
  return data;
}

async function main() {
  const inputPath = process.argv[2] || defaultIn;
  const outputPath = process.argv[3] || defaultOut;

  if (!fs.existsSync(inputPath)) {
    console.error("No existe:", inputPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(inputPath, "utf8");
  const parsed = parseBackupJsonContent(raw);
  const result = applyInsumosToBackup(parsed);

  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log("✅ Backup con insumos aplicado:", outputPath);

  const products = result.InventoryProduct.filter((p) => p.type === "raw");
  const show = (id) => {
    const p = products.find((r) => r.id === id);
    if (!p) return;
    console.log(
      p.id,
      p.name,
      "gen",
      p.isGenericIngredient,
      "parent",
      p.genericProductId,
      "pres",
      p.purchasePresentation,
      "stock",
      p.stock,
    );
  };
  [1, 2, 13, 148, 149, 150, 151].forEach((id) => show(id));
  const aceite = products.find((p) => p.name === "Aceite");
  if (aceite) show(aceite.id);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
