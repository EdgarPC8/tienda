import { Op } from "sequelize";
import { InventoryRecipe, InventoryProduct } from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import {
  resolveIngredientUnitCost,
  collectRecipeIngredientPriceAlerts,
  applyIngredientPriceAlerts,
} from "../../services/genericIngredientCostService.js";

const safeDiv = (a, b) => (b > 0 ? a / b : 0);

async function wouldCreateCycle(productFinalId, productRawId) {
  if (Number(productFinalId) === Number(productRawId)) return true;

  const visited = new Set();
  const stack = [Number(productRawId)];

  while (stack.length) {
    const id = stack.pop();
    if (id === Number(productFinalId)) return true;
    if (visited.has(id)) continue;
    visited.add(id);

    const lines = await InventoryRecipe.findAll({
      where: { productFinalId: id },
      attributes: ["productRawId"],
    });

    for (const line of lines) {
      const rawId = Number(line.productRawId);
      if (Number.isFinite(rawId)) stack.push(rawId);
    }
  }

  return false;
}

async function validateRecipeLine({
  productFinalId,
  productRawId,
  quantity,
  itemType,
  excludeId,
}) {
  if (!productFinalId || !productRawId) {
    return "productFinalId y productRawId son requeridos";
  }
  if (Number(productFinalId) === Number(productRawId)) {
    return "Un producto no puede ser componente de sí mismo";
  }
  if (!Number.isFinite(Number(quantity)) || Number(quantity) <= 0) {
    return "La cantidad debe ser mayor a 0";
  }
  if (itemType && !["insumo", "material"].includes(itemType)) {
    return "itemType debe ser insumo o material";
  }

  const finalProduct = await InventoryProduct.findByPk(productFinalId, {
    attributes: ["id", "type"],
  });
  if (!finalProduct) return "Producto de receta no encontrado";
  if (!["final", "intermediate"].includes(finalProduct.type)) {
    return "Solo productos finales o intermedios pueden tener receta";
  }

  const raw = await InventoryProduct.findByPk(productRawId, {
    attributes: ["id", "type"],
  });
  if (!raw) return "Componente no encontrado";
  if (!["raw", "intermediate", "final"].includes(raw.type)) {
    return "El componente debe ser insumo, intermedio o producto final";
  }
  if ((raw.type === "intermediate" || raw.type === "final") && itemType === "material") {
    return "Un intermedio o producto final no puede registrarse como material";
  }

  if (await wouldCreateCycle(productFinalId, productRawId)) {
    return "Referencia circular detectada en la receta";
  }

  const dupWhere = { productFinalId, productRawId };
  if (excludeId) dupWhere.id = { [Op.ne]: excludeId };

  const duplicate = await InventoryRecipe.findOne({ where: dupWhere });
  if (duplicate) return "Este componente ya está en la receta";

  return null;
}

export const getRecipeCosting = async (req, res) => {
  try {
    const productFinalId = Number(req.params.productFinalId);
    if (!Number.isFinite(productFinalId) || productFinalId <= 0) {
      return res.status(400).json({ message: "productFinalId inválido" });
    }

    const toPctInt = (v) => {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    };
    const extrasPctInt = toPctInt(req.query.extrasPercent ?? 20);
    const laborPctInt = toPctInt(req.query.laborPercent ?? 45);
    const queryProducedQty = Number.isFinite(Number(req.query.producedQty))
      ? Number(req.query.producedQty)
      : 0;

    const extrasPercent = extrasPctInt / 100;
    const laborPercent = laborPctInt / 100;

    const fetchProduct = async (id) => {
      const p = await InventoryProduct.findByPk(id);
      if (!p) throw new Error(`Producto ${id} no encontrado`);
      return p;
    };

    const fetchRecipe = async (finalId) =>
      InventoryRecipe.findAll({
        where: { productFinalId: finalId },
        order: [["id", "ASC"]],
      });

    const fetchUsagesOfProduct = async (rawId) =>
      InventoryRecipe.findAll({
        where: { productRawId: rawId },
        order: [["id", "ASC"]],
      });

    const recipeExistsCache = new Map();
    const productHasRecipe = async (productId) => {
      if (recipeExistsCache.has(productId)) return recipeExistsCache.get(productId);
      const lines = await fetchRecipe(productId);
      const has = lines.length > 0;
      recipeExistsCache.set(productId, has);
      return has;
    };

    /** Intermedio o producto con sub-receta (ej. masapan que aún figure como final). */
    const isComposedProduct = async (raw) => {
      if (raw.type === "intermediate") return true;
      return productHasRecipe(raw.id);
    };

    const resolveChildMult = async (raw, baseQty, isGr) => {
      if (raw.unitId === 1) {
        if (isGr) {
          const std = Number(raw.standardWeightGrams || 0);
          if (std > 0) return baseQty / std;
          const { grams: batchGrams } = await computeProducedGrams(raw.id);
          if (batchGrams > 0) return baseQty / batchGrams;
          return baseQty;
        }
        return baseQty;
      }
      if (isGr) return baseQty;
      const std = Number(raw.standardWeightGrams || 0);
      return baseQty * std;
    };

    const computeProducedGrams = async (productId) => {
      const p = await fetchProduct(productId);
      const manualYield = Number(p.productionYieldGrams);
      if (manualYield > 0) {
        return { grams: manualYield, source: "productionYieldGrams" };
      }

      const receta = await fetchRecipe(productId);
      if (!receta.length) return { grams: 0, source: "receta" };

      let sumaGramos = 0;
      for (const it of receta) {
        const ins = await fetchProduct(it.productRawId);
        const qty = Number(it.quantity) || 0;
        const isGr = !!it.isQuantityInGrams;

        if (isGr) {
          sumaGramos += qty;
        } else {
          const std = Number(ins.standardWeightGrams || 0);
          if (std > 0) sumaGramos += qty * std;
        }
      }
      return { grams: sumaGramos, source: "receta" };
    };

    const buildCostNode = async (productId, mult = 1, path = []) => {
      const p = await fetchProduct(productId);
      const unidad = p.unitId === 1 ? "unidad" : "gramos";

      const node = {
        info: {
          id: p.id,
          nombre: p.name,
          type: p.type,
          unitId: p.unitId,
          unidad,
          mult: Number(mult) || 1,
        },
        children: [],
        cost: {
          subtotalInsumos: 0,
          subtotalMateriales: 0,
          totalPesoEnMasaGr: 0,
          totalUnidadesMaterial: 0,
          totalNodo: 0,
          unitCost: 0,
          unitCostLabel: p.unitId === 1 ? "/u" : "/g",
        },
        rows: [],
        directItems: [],
        directSubtotal: {
          totalPesoEnMasaGr: 0,
          totalUnidadesMaterial: 0,
          totalValor: 0,
        },
      };

      const receta = await fetchRecipe(productId);
      if (!receta.length) return finalizeNode(node);

      const { grams: producedGrams } =
        p.unitId === 1 ? { grams: 1 } : await computeProducedGrams(productId);

      for (const it of receta) {
        const raw = await fetchProduct(it.productRawId);
        const nombre = raw.name;
        const isMaterial = (it.itemType || "insumo") === "material";
        const qty = Number(it.quantity) || 0;
        const isGr = !!it.isQuantityInGrams;

        const scale = p.unitId === 1 ? mult : producedGrams > 0 ? mult / producedGrams : 0;
        const baseQty = qty * scale;

        if (!(await isComposedProduct(raw))) {
          if (isMaterial) {
            const unidadesUsadas = baseQty;
            const resolved = await resolveIngredientUnitCost(raw);
            const precioPorUnidad =
              resolved.unitCost > 0
                ? resolved.unitCost
                : safeDiv(Number(raw.price || 0), Number(raw.netWeight || 0));
            const precioNeto = Number(raw.price || 0);
            const unidadesPorEmpaque = Number(raw.netWeight || 0);
            const valor = precioPorUnidad * unidadesUsadas;

            node.cost.subtotalMateriales += valor;
            node.cost.totalUnidadesMaterial += unidadesUsadas;
            node.directSubtotal.totalUnidadesMaterial += unidadesUsadas;
            node.directSubtotal.totalValor += valor;

            node.directItems.push({
              nombre,
              tipo: "material",
              unidadBase: "unidad",
              consumo: unidadesUsadas,
              precioNeto,
              pesoNeto: unidadesPorEmpaque,
              pesoEnMasa: unidadesUsadas,
              precioUnitBase: precioPorUnidad,
              valor: Number(valor.toFixed(6)),
              costSource: resolved.source,
            });

            node.rows.push({
              path: [...path, p.name, nombre].join(" > "),
              productoFinalId: p.id,
              nombreProductoFinal: p.name,
              nombreInsumo: nombre,
              tipo: "material",
              precioNeto,
              pesoNeto: unidadesPorEmpaque,
              cantidadUsada: unidadesUsadas,
              precioUnitBase: precioPorUnidad,
              valor: Number(valor.toFixed(6)),
              notas: `Material · ${resolved.source || "price/netWeight"}`,
            });
          } else if (Number(raw.unitId) === 1 && !isGr) {
            // Insumo por unidad (ej. huevo): costo desde empaque enlazado o supplierPrice
            const unidadesUsadas = baseQty;
            const resolved = await resolveIngredientUnitCost(raw);
            const precioPorUnidad = resolved.unitCost;
            const valor = precioPorUnidad * unidadesUsadas;

            node.cost.subtotalInsumos += valor;
            node.directSubtotal.totalUnidadesMaterial += unidadesUsadas;
            node.directSubtotal.totalValor += valor;

            node.directItems.push({
              nombre,
              tipo: "insumo",
              unidadBase: "unidad",
              consumo: unidadesUsadas,
              precioNeto: precioPorUnidad,
              pesoNeto: 1,
              pesoEnMasa: unidadesUsadas,
              precioUnitBase: precioPorUnidad,
              valor: Number(valor.toFixed(6)),
              isQuantityInGrams: false,
              costSource: resolved.source,
            });

            node.rows.push({
              path: [...path, p.name, nombre].join(" > "),
              productoFinalId: p.id,
              nombreProductoFinal: p.name,
              nombreInsumo: nombre,
              tipo: "insumo",
              precioNeto: precioPorUnidad,
              pesoNeto: 1,
              cantidadUsada: unidadesUsadas,
              precioUnitBase: precioPorUnidad,
              valor: Number(valor.toFixed(6)),
              isQuantityInGrams: false,
              notas: `Insumo/u · ${resolved.source || "supplierPrice"}`,
            });
          } else {
            let gramosUsados = 0;
            if (isGr) {
              gramosUsados = baseQty;
            } else {
              const std = Number(raw.standardWeightGrams || 0);
              gramosUsados = baseQty * std;
            }

            const resolved = await resolveIngredientUnitCost(raw);
            const precioPorGramo =
              resolved.unitCost > 0
                ? resolved.unitCost
                : safeDiv(Number(raw.price || 0), Number(raw.netWeight || 0));
            const precioNeto = Number(raw.price || 0);
            const pesoNetoGramos = Number(raw.netWeight || 0);
            const valor = precioPorGramo * gramosUsados;

            node.cost.subtotalInsumos += valor;
            node.cost.totalPesoEnMasaGr += gramosUsados;
            node.directSubtotal.totalPesoEnMasaGr += gramosUsados;
            node.directSubtotal.totalValor += valor;

            node.directItems.push({
              nombre,
              tipo: "insumo",
              unidadBase: "gramos",
              consumo: gramosUsados,
              precioNeto,
              pesoNeto: pesoNetoGramos,
              pesoEnMasa: gramosUsados,
              precioUnitBase: precioPorGramo,
              valor: Number(valor.toFixed(6)),
              isQuantityInGrams: isGr,
              standardWeightGrams: Number(raw.standardWeightGrams || 0),
              costSource: resolved.source,
            });

            node.rows.push({
              path: [...path, p.name, nombre].join(" > "),
              productoFinalId: p.id,
              nombreProductoFinal: p.name,
              nombreInsumo: nombre,
              tipo: "insumo",
              precioNeto,
              pesoNeto: pesoNetoGramos,
              pesoEnMasa: gramosUsados,
              precioUnitBase: precioPorGramo,
              valor: Number(valor.toFixed(6)),
              isQuantityInGrams: isGr,
              standardWeightGrams: Number(raw.standardWeightGrams || 0),
              notas: isGr
                ? `Cantidad en g/ml · ${resolved.source || "cost"}`
                : `Unidades → g · ${resolved.source || "cost"}`,
            });
          }
          continue;
        }

        let childMult = await resolveChildMult(raw, baseQty, isGr);

        const childNode = await buildCostNode(raw.id, childMult, [...path, p.name]);
        node.children.push(childNode);

        node.cost.subtotalInsumos += childNode.cost.subtotalInsumos;
        node.cost.subtotalMateriales += childNode.cost.subtotalMateriales;
        node.cost.totalPesoEnMasaGr += childNode.cost.totalPesoEnMasaGr;
        node.cost.totalUnidadesMaterial += childNode.cost.totalUnidadesMaterial;
        node.rows.push(...childNode.rows);
      }

      return finalizeNode(node);
    };

    const finalizeNode = (node) => {
      const totalNodo = node.cost.subtotalInsumos + node.cost.subtotalMateriales;
      node.cost.totalNodo = Number(totalNodo.toFixed(6));

      const denom = Number(node.info.mult) || 0;
      node.cost.unitCost = denom > 0 ? Number((totalNodo / denom).toFixed(6)) : 0;

      node.directSubtotal.totalPesoEnMasaGr = Number(
        node.directSubtotal.totalPesoEnMasaGr.toFixed(6),
      );
      node.directSubtotal.totalUnidadesMaterial = Number(
        node.directSubtotal.totalUnidadesMaterial.toFixed(6),
      );
      node.directSubtotal.totalValor = Number(node.directSubtotal.totalValor.toFixed(6));

      return node;
    };

    const product = await fetchProduct(productFinalId);
    const batchYield = await computeProducedGrams(productFinalId);

    let effectiveProducedQty = queryProducedQty;
    let producedQtyAuto = false;

    if (effectiveProducedQty <= 0) {
      producedQtyAuto = true;
      if (product.unitId === 1) {
        effectiveProducedQty = 1;
      } else {
        effectiveProducedQty = batchYield.grams > 0 ? batchYield.grams : 1;
      }
    }

    const rootMult = effectiveProducedQty || 1;
    const tree = await buildCostNode(productFinalId, rootMult, []);
    const rows = tree.rows;

    const subtotalInsumos = Number(tree.cost.subtotalInsumos.toFixed(2));
    const subtotalMateriales = Number(tree.cost.subtotalMateriales.toFixed(2));
    const subtotalTodos = Number((subtotalInsumos + subtotalMateriales).toFixed(2));

    const extras = subtotalInsumos * extrasPercent;
    const baseConExtras = subtotalInsumos + extras;
    const labor = baseConExtras * laborPercent;
    const totalLote = baseConExtras + labor;

    const costoUnitario =
      effectiveProducedQty > 0
        ? Number((totalLote / effectiveProducedQty).toFixed(4))
        : 0;

    const yieldInfo = [];
    let totalGramosDisponibles = 0;

    if (product.unitId === 1) {
      const { grams: gramosPorUnidad } = await computeProducedGrams(productFinalId);
      totalGramosDisponibles = gramosPorUnidad * effectiveProducedQty;
    } else {
      totalGramosDisponibles = effectiveProducedQty;
    }

    if (totalGramosDisponibles > 0) {
      const usages = await fetchUsagesOfProduct(productFinalId);

      for (const usage of usages) {
        const parent = await fetchProduct(usage.productFinalId);
        const qty = Number(usage.quantity) || 0;
        const isGr = !!usage.isQuantityInGrams;

        let gramosRawPorUnidadParent = 0;
        let unidadesPosiblesParent = 0;

        if (parent.unitId === 1) {
          if (isGr) {
            gramosRawPorUnidadParent = qty;
          } else if (product.unitId === 1) {
            const { grams: gramosPorUnidad } = await computeProducedGrams(productFinalId);
            gramosRawPorUnidadParent = qty * gramosPorUnidad;
          } else {
            gramosRawPorUnidadParent = qty;
          }
        } else if (isGr) {
          gramosRawPorUnidadParent = qty;
        } else if (product.unitId === 1) {
          const { grams: gramosPorUnidad } = await computeProducedGrams(productFinalId);
          gramosRawPorUnidadParent = qty * gramosPorUnidad;
        } else {
          gramosRawPorUnidadParent = qty;
        }

        if (gramosRawPorUnidadParent > 0 && totalGramosDisponibles > 0) {
          unidadesPosiblesParent = totalGramosDisponibles / gramosRawPorUnidadParent;
        }

        const costoPorUnidadPadre =
          unidadesPosiblesParent > 0
            ? Number((totalLote / unidadesPosiblesParent).toFixed(4))
            : 0;

        const parentPrice = Number(parent.price || 0);
        const parentDistributorPrice = Number(parent.distributorPrice || 0);

        yieldInfo.push({
          parentId: parent.id,
          parentName: parent.name,
          parentType: parent.type,
          unitId: parent.unitId,
          unidad: parent.unitId === 1 ? "unidad" : "gramos",
          quantityPerUnitParent: qty,
          isQuantityInGrams: isGr,
          gramosPorUnidadParent: Number(gramosRawPorUnidadParent.toFixed(4)),
          totalGramosDisponibles,
          unidadesPosiblesParent: Number(unidadesPosiblesParent.toFixed(4)),
          costoPorUnidadPadre,
          parentPrice,
          parentDistributorPrice,
          gananciaVsDistribuidor:
            parentDistributorPrice > 0
              ? Number((parentDistributorPrice - costoPorUnidadPadre).toFixed(4))
              : null,
          gananciaVsConsumidor:
            parentPrice > 0
              ? Number((parentPrice - costoPorUnidadPadre).toFixed(4))
              : null,
          notaConsumo: `${gramosRawPorUnidadParent.toFixed(2)} g de ${product.name} por 1 ${parent.name}`,
          nota: "Costo por unidad del padre = solo este producto (masa/intermedio), no incluye otros insumos del padre",
        });
      }
    }

    const precioConsumidor = Number(product.price || 0);
    const precioDistribuidor = Number(product.distributorPrice || 0);
    const gananciaConsumidor =
      precioConsumidor > 0 ? Number((precioConsumidor - costoUnitario).toFixed(4)) : null;
    const gananciaDistribuidor =
      precioDistribuidor > 0
        ? Number((precioDistribuidor - costoUnitario).toFixed(4))
        : null;

    const summary = {
      producto: {
        id: product.id,
        name: product.name,
        type: product.type,
        unitId: product.unitId,
        unidad: product.unitId === 1 ? "unidad" : "gramos",
        price: precioConsumidor,
        distributorPrice: precioDistribuidor,
      },
      lote: {
        queryProducedQty,
        effectiveProducedQty,
        producedQtyAuto,
        rendimientoGramos: batchYield.grams,
        rendimientoSource: batchYield.source,
        unidad: product.unitId === 1 ? "unidad" : "gramos",
      },
      totales: {
        subtotalInsumos,
        subtotalMateriales,
        subtotal: subtotalTodos,
        extrasPercentInt: extrasPctInt,
        extras: Number(extras.toFixed(2)),
        baseConExtras: Number(baseConExtras.toFixed(2)),
        laborPercentInt: laborPctInt,
        labor: Number(labor.toFixed(2)),
        totalLote: Number(totalLote.toFixed(2)),
        producedQty: effectiveProducedQty,
        costoUnitario,
      },
      rentabilidad: {
        costoUnitario,
        precioConsumidor,
        precioDistribuidor,
        gananciaConsumidor,
        gananciaDistribuidor,
        margenConsumidorPct:
          precioConsumidor > 0 && gananciaConsumidor != null
            ? Number(((gananciaConsumidor / precioConsumidor) * 100).toFixed(1))
            : null,
        margenDistribuidorPct:
          precioDistribuidor > 0 && gananciaDistribuidor != null
            ? Number(((gananciaDistribuidor / precioDistribuidor) * 100).toFixed(1))
            : null,
      },
      acumulados: {
        totalPesoEnMasaGr: Number(tree.cost.totalPesoEnMasaGr.toFixed(2)),
        totalUnidadesMaterial: Number(tree.cost.totalUnidadesMaterial.toFixed(2)),
      },
      yieldInfo,
      notas:
        "Extras = % de INSUMOS; Mano de obra = % de (INSUMOS + EXTRAS). Materiales no entran en esa base. Cant. lote en 0 = automático (1 u. o suma de insumos en gramos).",
    };

    let ingredientPriceAlerts = [];
    let ingredientPriceComparisons = [];
    try {
      const priceInfo =
        await collectRecipeIngredientPriceAlerts(productFinalId);
      ingredientPriceAlerts = priceInfo.alerts || [];
      ingredientPriceComparisons = priceInfo.comparisons || [];
    } catch (alertErr) {
      console.warn("ingredientPriceAlerts:", alertErr?.message || alertErr);
    }

    return res.json({
      tree,
      rows,
      summary,
      ingredientPriceAlerts,
      ingredientPriceComparisons,
    });
  } catch (error) {
    console.error("getRecipeCosting error:", error);
    return res.status(500).json({
      message: "Error al calcular costeo en árbol",
      detail: String(error?.message || error),
    });
  }
};

/** Alertas de precio: genérico desactualizado vs última compra de empaque. */
export const getIngredientPriceAlerts = async (req, res) => {
  try {
    const productFinalId = Number(req.params.productFinalId);
    if (!Number.isFinite(productFinalId) || productFinalId <= 0) {
      return res.status(400).json({ message: "productFinalId inválido" });
    }
    const result = await collectRecipeIngredientPriceAlerts(productFinalId);
    return res.json(result);
  } catch (error) {
    console.error("getIngredientPriceAlerts error:", error);
    return res.status(500).json({
      message: "Error al obtener alertas de precio",
      detail: String(error?.message || error),
    });
  }
};

/** Aplica actualización de supplierPrice en genéricos seleccionados. */
export const applyIngredientPriceAlertsController = async (req, res) => {
  try {
    const genericIds = Array.isArray(req.body?.genericIds)
      ? req.body.genericIds
      : [];
    if (!genericIds.length) {
      return res.status(400).json({ message: "genericIds requerido" });
    }
    const applied = await applyIngredientPriceAlerts(genericIds);
    notifyOk(
      "recipe.ingredient_prices_updated",
      `Precios actualizados: ${applied.length}`,
      { count: applied.length, ids: applied.map((a) => a.genericId) },
    );
    return res.json({
      message: `${applied.length} insumo(s) actualizado(s)`,
      applied,
    });
  } catch (error) {
    notifyFail("recipe.ingredient_prices_failed", "Error al actualizar precios", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: "Error al actualizar precios de insumos",
      detail: String(error?.message || error),
    });
  }
};

export const getRecipe = async (req, res) => {
  try {
    const { productFinalId } = req.params;
    const recipe = await InventoryRecipe.findAll({
      where: { productFinalId },
      include: [
        {
          model: InventoryProduct,
          as: "rawProduct",
          attributes: ["id", "name", "unitId", "price", "type", "distributorPrice"],
        },
      ],
      order: [["id", "ASC"]],
    });
    res.json(recipe);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener receta", error });
  }
};

export const createRecipe = async (req, res) => {
  try {
    const data = Array.isArray(req.body) ? req.body : [req.body];
    if (!data.length) {
      notifyFail("recipe.create_failed", "Se requiere al menos una línea de receta", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Se requiere al menos una línea de receta" });
    }

    for (const line of data) {
      const error = await validateRecipeLine(line);
      if (error) {
        notifyFail("recipe.create_failed", error, { req, httpStatus: 400 });
        return res.status(400).json({ message: error });
      }
    }

    const created = await InventoryRecipe.bulkCreate(data);
    notifyOk("recipe.created", "Receta creada", { count: created.length });
    res.status(201).json(created);
  } catch (error) {
    notifyFail("recipe.create_failed", "Error al crear receta", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al crear receta", error });
  }
};

export const updateRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await InventoryRecipe.findByPk(id);
    if (!existing) {
      notifyFail("recipe.update_failed", "Línea de receta no encontrada", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Línea de receta no encontrada" });
    }

    const payload = {
      productFinalId: req.body.productFinalId ?? existing.productFinalId,
      productRawId: req.body.productRawId ?? existing.productRawId,
      quantity: req.body.quantity ?? existing.quantity,
      isQuantityInGrams: req.body.isQuantityInGrams ?? existing.isQuantityInGrams,
      itemType: req.body.itemType ?? existing.itemType,
    };

    const error = await validateRecipeLine({ ...payload, excludeId: id });
    if (error) {
      notifyFail("recipe.update_failed", error, { req, httpStatus: 400 });
      return res.status(400).json({ message: error });
    }

    await existing.update(payload);
    notifyOk("recipe.updated", `Receta #${id}`, { recipeId: id });
    res.json(existing);
  } catch (error) {
    notifyFail("recipe.update_failed", "Error al actualizar receta", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al actualizar receta", error });
  }
};

export const deleteRecipe = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await InventoryRecipe.findByPk(id);
    if (!existing) {
      notifyFail("recipe.update_failed", "Línea de receta no encontrada", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Línea de receta no encontrada" });
    }

    await existing.destroy();
    notifyOk("recipe.deleted", `Receta #${id}`, { recipeId: id });
    res.json({ message: "Ingrediente eliminado de la receta" });
  } catch (error) {
    notifyFail("recipe.delete_failed", "Error al eliminar receta", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al eliminar receta", error });
  }
};
