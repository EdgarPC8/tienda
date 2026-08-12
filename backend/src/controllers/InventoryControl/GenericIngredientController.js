import { Op } from "sequelize";
import {
  InventoryProduct,
  InventoryCategory,
  InventoryUnit,
  InventoryRecipe,
} from "../../models/Inventory.js";
import {
  productStockToGrams,
  gramsToDisplayInUnit,
  round2,
  isCountUnit,
  resolveGramFactor,
} from "../../utils/genericIngredientUtils.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const productInclude = [
  { model: InventoryCategory, attributes: ["id", "name"] },
  { model: InventoryUnit, attributes: ["id", "name", "abbreviation", "factor"] },
];

function shapeProductRow(row) {
  const unit = row.InventoryUnit || row.ERP_inventory_unit;
  const stockGrams = productStockToGrams(row, unit);
  const category = row.InventoryCategory || row.ERP_inventory_category;
  return {
    id: row.id,
    name: row.name,
    purchasePresentation: row.purchasePresentation,
    type: row.type,
    stock: Number(row.stock ?? 0),
    minStock: Number(row.minStock ?? 0),
    price: Number(row.price ?? 0),
    unitId: row.unitId,
    unitAbbrev: unit?.abbreviation ?? "—",
    unitName: unit?.name ?? "—",
    categoryId: row.categoryId,
    categoryName: category?.name ?? "—",
    isGenericIngredient: !!row.isGenericIngredient,
    genericProductId: row.genericProductId,
    stockGrams: round2(stockGrams),
    isCountUnit: isCountUnit(unit),
  };
}

async function countRecipeLines(productId) {
  return InventoryRecipe.count({ where: { productRawId: productId } });
}

async function ensureFamilyCategory(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const [row] = await InventoryCategory.findOrCreate({
    where: { name: trimmed },
    defaults: { description: `Familia de insumo: ${trimmed}`, isPublic: false },
  });
  return row;
}

async function findAzucarGeneric() {
  return InventoryProduct.findOne({
    where: {
      type: "raw",
      isGenericIngredient: true,
      genericProductId: null,
      name: { [Op.in]: ["Azucar", "Azúcar"] },
    },
  });
}

function isAzucarComunGeneric(product) {
  const n = String(product?.name || "").trim();
  return n === "Azucar" || n === "Azúcar";
}

function isAzucarImpalpableProduct(product) {
  return /impalpable/i.test(String(product?.name || ""));
}

/** Nombres de insumos genéricos que ya existían en BD (recetas / lista frecuente). */
const EXISTING_GENERIC_NAMES = [
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
  "Aceite",
  // Insumos propios (no son presentación de otro genérico)
  "Crema de leche Masscream",
  "Mantequilla Hojaldrina",
  "Premezcla de Chocolate",
];

/** Insumos que nunca deben quedar enlazados como presentación de otro. */
const STANDALONE_INSUMO_NAMES = [
  "Crema de leche Masscream",
  "Mantequilla Hojaldrina",
  "Premezcla de Chocolate",
  "Azúcar impalpable",
];

/**
 * Presentaciones de compra: azúcar, harina y aceite.
 */
const FREQUENT_PRESENTATION_SEEDS = [
  {
    genericNames: ["Azucar", "Azúcar"],
    family: "Azúcar",
    items: [
      { name: "Quintal de azúcar", purchasePresentation: "Quintal", unitAbbrev: ["q", "qq"] },
      {
        name: "Arroba de azúcar",
        purchasePresentation: "Arroba",
        unitAbbrev: ["arroba", "arb", "@"],
        createUnitIfMissing: {
          name: "Arroba",
          abbreviation: "arroba",
          description: "25 libras (~11,34 kg) — formato de compra",
          factor: 11339.8,
        },
      },
    ],
  },
  {
    genericNames: ["Harina"],
    family: "Harina",
    items: [
      { name: "Quintal de harina", purchasePresentation: "Quintal", unitAbbrev: ["q", "qq"] },
      {
        name: "Arroba de harina",
        purchasePresentation: "Arroba",
        unitAbbrev: ["arroba", "arb", "@"],
      },
    ],
  },
  {
    genericNames: ["Aceite"],
    family: "Aceite",
    createGenericIfMissing: { name: "Aceite", unitAbbrev: ["l", "ml"] },
    items: [
      {
        name: "Funda Aceite Aisol 900ml",
        purchasePresentation: "Funda 900ml",
        unitAbbrev: ["l", "ml"],
        linkExistingByName: "Aceite Aisol",
      },
    ],
  },
];

async function findGenericByNames(names) {
  const list = Array.isArray(names) ? names : [names];
  return InventoryProduct.findOne({
    where: {
      type: "raw",
      name: { [Op.in]: list },
      genericProductId: null,
    },
    order: [["isGenericIngredient", "DESC"], ["id", "ASC"]],
  });
}

async function resolveUnitId(abbrevList, fallbackUnitId) {
  const abbrevs = Array.isArray(abbrevList) ? abbrevList : [abbrevList];
  const unit = await InventoryUnit.findOne({
    where: { abbreviation: { [Op.in]: abbrevs } },
  });
  return unit?.id || fallbackUnitId;
}

async function ensureArrobaUnit(seedItem) {
  if (!seedItem?.createUnitIfMissing) {
    return InventoryUnit.findOne({
      where: { abbreviation: { [Op.in]: ["arroba", "arb", "@"] } },
    });
  }
  let unit = await InventoryUnit.findOne({
    where: { abbreviation: seedItem.createUnitIfMissing.abbreviation },
  });
  if (!unit) {
    unit = await InventoryUnit.create(seedItem.createUnitIfMissing);
  }
  return unit;
}

/** Quita enlaces incorrectos y deja esos productos como insumos propios. */
async function unlinkStandaloneInsumos(summary) {
  for (const name of STANDALONE_INSUMO_NAMES) {
    const row = await InventoryProduct.findOne({ where: { type: "raw", name } });
    if (!row) continue;
    const family = await ensureFamilyCategory(row.name);
    const wasLinked = !!row.genericProductId;
    await row.update({
      isGenericIngredient: true,
      genericProductId: null,
      purchasePresentation: null,
      categoryId: row.categoryId || family?.id,
    });
    if (wasLinked) summary.unlinkedWrong += 1;
    summary.genericsMarked += 1;
  }

  // Genérico "Aceite" creado solo para el enlace erróneo (sin presentaciones válidas).
  const aceiteGeneric = await InventoryProduct.findOne({
    where: { type: "raw", name: "Aceite", isGenericIngredient: true, genericProductId: null },
  });
  if (aceiteGeneric) {
    const children = await InventoryProduct.count({
      where: { genericProductId: aceiteGeneric.id },
    });
    if (children === 0) {
      await aceiteGeneric.destroy();
      summary.removedOrphans = (summary.removedOrphans || 0) + 1;
    }
  }
}

/** Marca insumos genéricos existentes sin cambiar nombre ni stock. */
async function markExistingGenerics(summary) {
  await unlinkStandaloneInsumos(summary);

  for (const name of EXISTING_GENERIC_NAMES) {
    const row = await InventoryProduct.findOne({
      where: { type: "raw", name, genericProductId: null },
    });
    if (!row) continue;
    const family = await ensureFamilyCategory(row.name);
    if (family?.isNewRecord) summary.categoriesCreated += 1;
    const patch = {
      isGenericIngredient: true,
      genericProductId: null,
      purchasePresentation: null,
    };
    if (!row.categoryId && family?.id) patch.categoryId = family.id;
    await row.update(patch);
    summary.genericsMarked += 1;
  }

  // Corrige enlaces erróneos (p. ej. azúcar impalpable bajo Azúcar).
  const azucar = await findAzucarGeneric();
  if (azucar) {
    const wronglyLinked = await InventoryProduct.findAll({
      where: {
        genericProductId: azucar.id,
        name: { [Op.like]: "%impalpable%" },
      },
    });
    for (const row of wronglyLinked) {
      const impFamily = await ensureFamilyCategory("Azúcar impalpable");
      await row.update({
        isGenericIngredient: true,
        genericProductId: null,
        purchasePresentation: null,
        categoryId: impFamily?.id || row.categoryId,
      });
      summary.unlinkedWrong += 1;
      summary.genericsMarked += 1;
    }
  }
}

/** Crea o enlaza presentaciones de compra bajo su insumo genérico. */
async function ensureFrequentPresentations(summary) {
  for (const seed of FREQUENT_PRESENTATION_SEEDS) {
    try {
      let generic = await findGenericByNames(seed.genericNames);

      if (!generic && seed.createGenericIfMissing) {
        const unitId = await resolveUnitId(seed.createGenericIfMissing.unitAbbrev, null);
        const family = await ensureFamilyCategory(seed.family || seed.createGenericIfMissing.name);
        generic = await InventoryProduct.create({
          name: seed.createGenericIfMissing.name,
          type: "raw",
          unitId: unitId || (await InventoryUnit.findOne())?.id,
          categoryId: family?.id,
          stock: 0,
          minStock: 0,
          price: 0,
          isGenericIngredient: true,
          genericProductId: null,
        });
        summary.genericsCreated = (summary.genericsCreated || 0) + 1;
      }

      if (!generic) {
        summary.errors.push({
          step: "presentations",
          family: seed.family,
          message: `No se encontró insumo genérico (${seed.genericNames.join(" / ")})`,
        });
        continue;
      }

      if (!generic.isGenericIngredient) {
        await generic.update({ isGenericIngredient: true, genericProductId: null });
        summary.genericsMarked += 1;
      }

      const family = await ensureFamilyCategory(seed.family || generic.name);

      for (const item of seed.items) {
        let unitId = generic.unitId;
        if (item.unitAbbrev) {
          if (item.createUnitIfMissing) {
            const customUnit = await ensureArrobaUnit(item);
            unitId = customUnit?.id || unitId;
          } else {
            unitId = await resolveUnitId(item.unitAbbrev, generic.unitId);
          }
        }

        let row = await InventoryProduct.findOne({
          where: { genericProductId: generic.id, name: item.name },
        });

        if (!row && item.linkExistingByName) {
          row = await InventoryProduct.findOne({
            where: {
              name: item.linkExistingByName,
              type: { [Op.in]: ["final", "raw"] },
            },
          });
        }

        if (!row) {
          row = await InventoryProduct.findOne({
            where: { name: item.name, type: { [Op.in]: ["final", "raw"] } },
          });
        }

        if (!row) {
          await InventoryProduct.create({
            name: item.name,
            type: "final",
            unitId,
            categoryId: family?.id,
            stock: 0,
            minStock: 0,
            price: Number(generic.price ?? 0),
            isGenericIngredient: false,
            genericProductId: generic.id,
            purchasePresentation: item.purchasePresentation,
          });
          summary.presentationsCreated += 1;
          continue;
        }

        if (row.isGenericIngredient && !item.linkExistingByName) {
          summary.errors.push({
            step: "presentations",
            productId: row.id,
            message: `${row.name} es insumo genérico; no se enlaza como presentación`,
          });
          continue;
        }

        if (row.genericProductId && row.genericProductId !== generic.id) {
          summary.errors.push({
            step: "presentations",
            productId: row.id,
            message: `${row.name} ya está enlazado a otro insumo`,
          });
          continue;
        }

        const patch = {
          genericProductId: generic.id,
          isGenericIngredient: false,
          purchasePresentation: item.purchasePresentation,
          categoryId: family?.id || row.categoryId,
        };
        // Modelo nuevo: empaque de compra = tipo final (no lo convierte a insumo).
        if (row.type !== "final") patch.type = "final";
        if (item.name && row.id !== generic.id) patch.name = item.name;
        if (unitId) patch.unitId = unitId;
        await row.update(patch);
        summary.presentationsLinked = (summary.presentationsLinked || 0) + 1;
      }

      // Azúcar: si el genérico aún tiene stock en gramos, pásalo al quintal.
      if (isAzucarComunGeneric(generic)) {
        const quintal = await InventoryProduct.findOne({
          where: { genericProductId: generic.id, name: "Quintal de azúcar" },
          include: [{ model: InventoryUnit }],
        });
        const genericStock = Number(generic.stock ?? 0);
        if (quintal && genericStock > 0 && Number(quintal.stock ?? 0) === 0) {
          const unit = quintal.InventoryUnit;
          const factor = resolveGramFactor(unit);
          const inQuintals = factor > 0 ? genericStock / factor : 0;
          await quintal.update({ stock: Number(inQuintals.toFixed(4)) });
          await generic.update({ stock: 0 });
          summary.stockMigrated = true;
        }
      }
    } catch (e) {
      summary.errors.push({ step: "presentations", family: seed.family, message: e.message });
    }
  }
}

export async function runGenericIngredientsBootstrap() {
  const summary = {
    genericsMarked: 0,
    genericsCreated: 0,
    categoriesCreated: 0,
    presentationsCreated: 0,
    presentationsLinked: 0,
    unlinkedWrong: 0,
    removedOrphans: 0,
    stockMigrated: false,
    errors: [],
  };

  await markExistingGenerics(summary);
  await ensureFrequentPresentations(summary);

  return summary;
}

/**
 * GET /inventory/generic-ingredients
 */
export const getGenericIngredientsWorkbench = async (req, res) => {
  try {
    const generics = await InventoryProduct.findAll({
      where: {
        isGenericIngredient: true,
        genericProductId: null,
        type: "raw",
      },
      include: productInclude,
      order: [["name", "ASC"]],
    });

    const genericIds = generics.map((g) => g.id);
    const branded =
      genericIds.length > 0
        ? await InventoryProduct.findAll({
            where: { genericProductId: { [Op.in]: genericIds } },
            include: productInclude,
            order: [["name", "ASC"]],
          })
        : [];

    const brandedByGeneric = new Map();
    for (const b of branded) {
      const gid = b.genericProductId;
      if (!brandedByGeneric.has(gid)) brandedByGeneric.set(gid, []);
      brandedByGeneric.get(gid).push(shapeProductRow(b));
    }

    const recipeMetaByRawId = new Map();
    const collectRecipeMeta = (lines) => {
      for (const line of lines) {
        const rawId = line.productRawId;
        if (!recipeMetaByRawId.has(rawId)) {
          recipeMetaByRawId.set(rawId, { count: 0, names: new Set() });
        }
        const meta = recipeMetaByRawId.get(rawId);
        meta.count += 1;
        const finalName = line.finalProduct?.name;
        if (finalName) meta.names.add(finalName);
      }
    };

    if (genericIds.length) {
      const genericRecipeLines = await InventoryRecipe.findAll({
        where: { productRawId: { [Op.in]: genericIds } },
        attributes: ["productRawId", "productFinalId"],
        include: [{ model: InventoryProduct, as: "finalProduct", attributes: ["id", "name"] }],
      });
      collectRecipeMeta(genericRecipeLines);
    }

    const unlinkedPacks = await InventoryProduct.findAll({
      where: {
        type: "final",
        isGenericIngredient: false,
        genericProductId: null,
      },
      include: productInclude,
      order: [["name", "ASC"]],
    });

    const unlinkedIds = unlinkedPacks.map((p) => p.id);
    if (unlinkedIds.length) {
      // Los finales no suelen ser productRawId; se deja por si hay datos raros.
      const unlinkedRecipeLines = await InventoryRecipe.findAll({
        where: { productRawId: { [Op.in]: unlinkedIds } },
        attributes: ["productRawId", "productFinalId"],
        include: [{ model: InventoryProduct, as: "finalProduct", attributes: ["id", "name"] }],
      });
      collectRecipeMeta(unlinkedRecipeLines);
    }

    const shapeRecipeMeta = (productId) => {
      const meta = recipeMetaByRawId.get(productId);
      if (!meta) return { recipeLines: 0, inRecipes: [] };
      return {
        recipeLines: meta.count,
        inRecipes: Array.from(meta.names).sort((a, b) => a.localeCompare(b, "es")),
      };
    };

    const data = [];
    for (const g of generics) {
      const presentations = brandedByGeneric.get(g.id) || [];
      const ownGrams = productStockToGrams(g, g.InventoryUnit);
      const presentationsGrams = presentations.reduce((s, p) => s + Number(p.stockGrams || 0), 0);
      const totalGrams = round2(ownGrams + presentationsGrams);
      const display = gramsToDisplayInUnit(totalGrams, g.InventoryUnit);
      const recipes = shapeRecipeMeta(g.id);

      data.push({
        ...shapeProductRow(g),
        recipeLines: recipes.recipeLines,
        inRecipes: recipes.inRecipes,
        presentations,
        presentationCount: presentations.length,
        totalStockGrams: totalGrams,
        totalStockDisplay: `${display.value} ${display.label}`,
        stockOnGeneric: round2(ownGrams),
        stockOnPresentations: round2(presentationsGrams),
      });
    }

    res.json({
      generics: data,
      unlinkedProducts: unlinkedPacks.map((p) => ({
        ...shapeProductRow(p),
        ...shapeRecipeMeta(p.id),
      })),
    });
  } catch (error) {
    console.error("getGenericIngredientsWorkbench:", error);
    res.status(500).json({ message: "Error al cargar insumos genéricos", error: error.message });
  }
};

/**
 * POST /inventory/generic-ingredients/bootstrap
 */
export const bootstrapGenericIngredients = async (req, res) => {
  try {
    const summary = await runGenericIngredientsBootstrap();
    notifyOk("generic_ingredient.bootstrapped", "Bootstrap insumos genéricos", { summary });
    res.json({
      message:
        "Genéricos marcados y presentaciones creadas (azúcar, harina, aceite).",
      summary,
    });
  } catch (error) {
    console.error("bootstrapGenericIngredients:", error);
    notifyFail("generic_ingredient.bootstrap_failed", error.message, { error, req, httpStatus: 500 });
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /inventory/generic-ingredients
 * Crear insumo genérico nuevo.
 */
export const createGenericIngredient = async (req, res) => {
  try {
    const { name, unitId, categoryId, categoryFamily, minStock } = req.body;
    if (!name?.trim() || !unitId) {
      notifyFail("generic_ingredient.create_failed", "Nombre y unidad son obligatorios", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Nombre y unidad son obligatorios." });
    }

    let catId = categoryId;
    if (!catId && categoryFamily) {
      const cat = await ensureFamilyCategory(categoryFamily);
      catId = cat?.id;
    }

    const row = await InventoryProduct.create({
      name: name.trim(),
      type: "raw",
      unitId: Number(unitId),
      categoryId: catId || null,
      stock: 0,
      minStock: Number(minStock ?? 0),
      price: 0,
      isGenericIngredient: true,
      genericProductId: null,
    });

    const full = await InventoryProduct.findByPk(row.id, { include: productInclude });
    notifyOk("generic_ingredient.created", `Insumo genérico #${row.id}`, { genericIngredient: shapeProductRow(full) });
    res.status(201).json(shapeProductRow(full));
  } catch (error) {
    console.error("createGenericIngredient:", error);
    notifyFail("generic_ingredient.create_failed", error.message, { error, req, httpStatus: 500 });
    res.status(500).json({ message: error.message });
  }
};

/**
 * POST /inventory/generic-ingredients/:genericId/presentations
 */
export const createPresentation = async (req, res) => {
  try {
    const genericId = Number(req.params.genericId);
    const generic = await InventoryProduct.findByPk(genericId);
    if (!generic?.isGenericIngredient) {
      notifyFail("presentation.create_failed", "Insumo genérico no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Insumo genérico no encontrado." });
    }

    const {
      name,
      purchasePresentation,
      unitId,
      categoryId,
      stock,
      minStock,
      price,
      existingProductId,
    } = req.body;

    if (existingProductId) {
      const existing = await InventoryProduct.findByPk(existingProductId);
      if (!existing) {
        notifyFail("presentation.create_failed", "Producto no encontrado", { req, httpStatus: 404 });
        return res.status(404).json({ message: "Producto no encontrado." });
      }
      if (existing.isGenericIngredient || existing.type !== "final") {
        notifyFail(
          "presentation.create_failed",
          "Solo se enlazan productos tipo final (ej. Quintal de harina)",
          { req, httpStatus: 400 },
        );
        return res.status(400).json({
          message:
            "Solo se enlazan productos tipo final (ej. Quintal de harina). El genérico ya es el insumo.",
        });
      }
      if (existing.genericProductId && existing.genericProductId !== genericId) {
        notifyFail("presentation.create_failed", "Producto ya enlazado a otro insumo", {
          req,
          httpStatus: 400,
        });
        return res.status(400).json({ message: "El producto ya está enlazado a otro insumo." });
      }
      if (isAzucarComunGeneric(generic) && isAzucarImpalpableProduct(existing)) {
        notifyFail("presentation.create_failed", "Azúcar impalpable no se enlaza bajo Azúcar común", {
          req,
          httpStatus: 400,
        });
        return res.status(400).json({
          message:
            "Azúcar impalpable es un insumo distinto. No se enlaza bajo Azúcar común.",
        });
      }

      await existing.update({
        genericProductId: genericId,
        isGenericIngredient: false,
        type: "final",
        name: name?.trim() || existing.name,
        purchasePresentation: purchasePresentation || existing.purchasePresentation,
      });

      const full = await InventoryProduct.findByPk(existing.id, { include: productInclude });
      notifyOk("presentation.created", `Presentación #${existing.id}`, {
        productId: existing.id,
        genericProductId: genericId,
      });
      return res.status(200).json(shapeProductRow(full));
    }

    if (!name?.trim()) {
      notifyFail("presentation.create_failed", "Nombre de presentación obligatorio", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Nombre de presentación obligatorio." });
    }

    const family = await ensureFamilyCategory(generic.name);
    const row = await InventoryProduct.create({
      name: name.trim(),
      purchasePresentation: purchasePresentation || null,
      type: "final",
      unitId: Number(unitId || generic.unitId),
      categoryId: categoryId || family?.id,
      stock: Number(stock ?? 0),
      minStock: Number(minStock ?? 0),
      price: Number(price ?? 0),
      isGenericIngredient: false,
      genericProductId: genericId,
    });

    const full = await InventoryProduct.findByPk(row.id, { include: productInclude });
    notifyOk("presentation.created", `Presentación #${row.id}`, {
      productId: row.id,
      genericProductId: genericId,
    });
    res.status(201).json(shapeProductRow(full));
  } catch (error) {
    console.error("createPresentation:", error);
    notifyFail("presentation.create_failed", error.message, { error, req, httpStatus: 500 });
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /inventory/generic-ingredients/presentations/:productId/link
 * Enlaza un producto tipo final (quintal, arroba…) a un insumo genérico.
 * No cambia el tipo: sigue siendo final.
 */
export const linkPresentation = async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    const { genericProductId, purchasePresentation } = req.body;
    const genericId = Number(genericProductId);

    const [product, generic] = await Promise.all([
      InventoryProduct.findByPk(productId),
      InventoryProduct.findByPk(genericId),
    ]);

    if (!product) {
      notifyFail("presentation.link_failed", "Producto no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Producto no encontrado." });
    }
    if (product.isGenericIngredient) {
      notifyFail("presentation.link_failed", "No se puede enlazar un insumo genérico", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "No se puede enlazar un insumo genérico como empaque." });
    }
    // Nuevo modelo: tipo final. Se acepta raw legado ya existente para no romper datos viejos.
    if (product.type !== "final" && product.type !== "raw") {
      notifyFail("presentation.link_failed", "Solo productos tipo final (o raw legado)", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({
        message: "Enlaza un producto tipo final (ej. Quintal de harina).",
      });
    }
    if (!generic?.isGenericIngredient || generic.type !== "raw") {
      notifyFail("presentation.link_failed", "Insumo genérico no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Insumo genérico no encontrado." });
    }
    if (isAzucarComunGeneric(generic) && isAzucarImpalpableProduct(product)) {
      notifyFail("presentation.link_failed", "Azúcar impalpable no se enlaza bajo Azúcar común", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({
        message: "Azúcar impalpable es un insumo distinto. No se enlaza bajo Azúcar común.",
      });
    }

    const patch = {
      genericProductId: genericId,
      isGenericIngredient: false,
      purchasePresentation: purchasePresentation ?? product.purchasePresentation,
    };
    // Si era raw legado, pásalo a final (empaque de compra).
    if (product.type === "raw") patch.type = "final";

    await product.update(patch);

    const full = await InventoryProduct.findByPk(product.id, { include: productInclude });
    notifyOk("presentation.linked", `Presentación #${productId} vinculada`, {
      productId,
      genericProductId: genericId,
    });
    res.json(shapeProductRow(full));
  } catch (error) {
    console.error("linkPresentation:", error);
    notifyFail("presentation.link_failed", error.message, { error, req, httpStatus: 500 });
    res.status(500).json({ message: error.message });
  }
};

/**
 * PATCH /inventory/generic-ingredients/presentations/:productId/unlink
 */
export const unlinkPresentation = async (req, res) => {
  try {
    const product = await InventoryProduct.findByPk(req.params.productId);
    if (!product) {
      notifyFail("presentation.unlink_failed", "Producto no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Producto no encontrado." });
    }

    await product.update({ genericProductId: null });
    const full = await InventoryProduct.findByPk(product.id, { include: productInclude });
    notifyOk("presentation.unlinked", `Presentación #${req.params.productId} desvinculada`, {
      productId: req.params.productId,
    });
    res.json(shapeProductRow(full));
  } catch (error) {
    console.error("unlinkPresentation:", error);
    notifyFail("presentation.unlink_failed", error.message, { error, req, httpStatus: 500 });
    res.status(500).json({ message: error.message });
  }
};
