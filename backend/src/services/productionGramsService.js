import { InventoryProduct, InventoryRecipe } from "../models/Inventory.js";
import { getAppSettingsSync } from "./appSettingsService.js";
import { executeOpenPresentation } from "./presentationOpenService.js";
import {
  adjustStoreStock,
  getDefaultStockStoreId,
  getStoreStockQty,
} from "./storeStockService.js";
import { unitsOfProductInPack } from "../utils/packContentsUtils.js";
import { Op } from "sequelize";

const EXTRAS_PERCENT = 20;

export class ProductionInputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const gramsFmt = new Intl.NumberFormat("es-EC", { maximumFractionDigits: 0 });

export function formatGrams(n) {
  return gramsFmt.format(Math.round(Number(n) || 0));
}

function roundQty(n) {
  return Math.round(Number(n) * 1e6) / 1e6;
}

const LEGACY_ACTION_KEYS = ["fuentes", "autocompletar", "merma"];

export function assertOfficialProductionActions(source) {
  if (!source || typeof source !== "object") return;
  const found = LEGACY_ACTION_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(source, key));
  if (!found.length) return;
  throw new ProductionInputError(
    `No se reconoce ${found.join(", ")}. Usa abrirEmpaques, mermas y autocompletarStock`,
  );
}

export function packagingOpenEnabled() {
  return getAppSettingsSync()?.productionOpenPackaging === true;
}

function isPrivileged(user) {
  const rol = user?.loginRol;
  return rol === "Administrador" || rol === "Propietario";
}

function gramsAddedWhenOpened(presentation, ingredientId) {
  const fromPack = unitsOfProductInPack(presentation, ingredientId);
  return Number.isFinite(fromPack) && fromPack > 0 ? fromPack : 0;
}

function isGenericIngredient(product) {
  return Boolean(product?.isGenericIngredient) && !product?.genericProductId;
}

function normalizeOpens(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      insumoId: Number(row?.insumoId ?? row?.ingredientId),
      productId: Number(row?.productId),
      packs: Math.floor(Number(row?.packs ?? row?.cantidad)),
    }))
    .filter((row) => row.insumoId > 0 && row.productId > 0 && row.packs > 0);
}

function normalizeMermas(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => ({
      insumoId: Number(row?.insumoId ?? row?.ingredientId),
      gramos: Number(row?.gramos ?? row?.grams),
      motivo: String(row?.motivo || row?.reason || "").trim(),
    }))
    .filter((row) => row.insumoId > 0 && row.gramos > 0);
}

function assertPackagingActionsAllowed({ abrirEmpaques, mermas, autocompletar }) {
  const opens = normalizeOpens(abrirEmpaques);
  const wastes = normalizeMermas(mermas);
  const wantsExtra = opens.length > 0 || wastes.length > 0 || autocompletar === true;
  if (wantsExtra && !packagingOpenEnabled()) {
    throw new ProductionInputError(
      "La apertura de empaques está desactivada en Configuración",
    );
  }
  return { opens, wastes };
}

async function listOpenablePacks(ingredientId, storeId, transaction) {
  const linked = await InventoryProduct.findAll({
    where: {
      isGenericIngredient: false,
      isActive: true,
      [Op.or]: [{ genericProductId: ingredientId }, { packContents: { [Op.ne]: null } }],
    },
    order: [["id", "ASC"]],
    transaction,
  });
  const packs = [];
  for (const product of linked) {
    const grams = gramsAddedWhenOpened(product, ingredientId);
    if (!(grams > 0)) continue;
    const stock = await storeQty(storeId, product.id, transaction);
    const whole = Math.floor(stock + 1e-9);
    if (whole < 1) continue;
    const price = Number(product.supplierPrice) || 0;
    packs.push({
      productId: product.id,
      nombre: product.name,
      stock: whole,
      gramosPorEmpaque: grams,
      costoPorGramo: price > 0 ? price / grams : null,
      sinPrecio: !(price > 0),
      precioProveedor: price,
    });
  }
  return packs;
}

function shortageMessage({ missing, packs, openOn }) {
  if (missing <= 1e-6) return null;
  const faltan = `Faltan ${formatGrams(missing)} g`;
  if (!packs.length) {
    return openOn
      ? `No hay empaques con stock. ${faltan}. Puedes autocompletar solo esos gramos.`
      : `No hay stock disponible. ${faltan}.`;
  }
  if (!openOn) return "Hay empaques disponibles, pero la apertura automática está desactivada";
  return null;
}

export function parseProductionQuantity(raw) {
  if (raw === null || raw === undefined || raw === "") {
    throw new ProductionInputError("La cantidad a producir debe ser un entero mayor que 0");
  }
  if (typeof raw === "number") {
    if (!Number.isInteger(raw) || raw <= 0) {
      throw new ProductionInputError("La cantidad a producir debe ser un entero mayor que 0");
    }
    return raw;
  }
  const text = String(raw).trim();
  if (!/^[1-9]\d*$/.test(text)) {
    throw new ProductionInputError("La cantidad a producir debe ser un entero mayor que 0");
  }
  return Number(text);
}

export function assertProductionRole(user) {
  const rol = user?.loginRol;
  if (rol !== "Administrador" && rol !== "Propietario" && rol !== "Programador") {
    throw new ProductionInputError("No tenés permiso para registrar producción", 403);
  }
}

function isGramIngredient(product, recipeLine) {
  if (recipeLine?.isQuantityInGrams === true) return true;
  if (product?.isGenericIngredient && !product?.genericProductId) return true;
  if (product?.type === "raw") return true;
  return false;
}

async function storeQty(storeId, productId, transaction) {
  return Number(await getStoreStockQty(storeId, productId, { transaction })) || 0;
}

/**
 * Plan de producción. Los gramos salen del insumo genérico.
 * Los empaques solo se abren si Configuración lo permite y el usuario los elige.
 */
export async function planProduction(productId, quantity, { transaction } = {}) {
  const finalProduct = await InventoryProduct.findByPk(productId, { transaction });
  if (!finalProduct) {
    throw new ProductionInputError("Producto no encontrado", 404);
  }
  if (!["final", "intermediate"].includes(finalProduct.type)) {
    throw new ProductionInputError("Solo se puede producir un producto final o intermedio");
  }

  const lines = await InventoryRecipe.findAll({
    where: { productFinalId: productId },
    order: [["id", "ASC"]],
    transaction,
  });
  if (!lines.length) {
    throw new ProductionInputError("El producto no tiene receta");
  }

  const storeId = await getDefaultStockStoreId({ transaction });
  const requiere = [];
  let blocked = false;
  const advertencias = [];
  const reserved = new Map();
  const openOn = packagingOpenEnabled();

  for (const line of lines) {
    const ingredient = await InventoryProduct.findByPk(line.productRawId, { transaction });
    if (!ingredient) {
      throw new ProductionInputError("Un componente de la receta ya no existe");
    }
    const perUnit = Number(line.quantity);
    if (!Number.isFinite(perUnit) || perUnit <= 0) {
      throw new ProductionInputError(
        `La receta de ${ingredient.name} debe tener una cantidad mayor que 0`,
      );
    }

    if (!isGramIngredient(ingredient, line)) {
      const units = perUnit * quantity;
      const stock = await storeQty(storeId, ingredient.id, transaction);
      const used = reserved.get(`u:${ingredient.id}`) || 0;
      const available = Math.max(0, stock - used);
      reserved.set(`u:${ingredient.id}`, used + units);
      const missing = Math.max(0, units - available);
      if (missing > 0) blocked = true;
      requiere.push({
        producto: ingredient.name,
        id: ingredient.id,
        kind: "unidad",
        cantidadUnidades: units,
        stockActual: available,
        stockFinalEstimado: available - units,
        suficiente: missing <= 0,
        faltanteUnidades: missing,
      });
      continue;
    }

    const gramsNeeded = perUnit * quantity;
    if (isGenericIngredient(ingredient)) {
      const stock = await storeQty(storeId, ingredient.id, transaction);
      const used = reserved.get(ingredient.id) || 0;
      const available = Math.max(0, stock - used);
      const fromGeneric = Math.min(available, gramsNeeded);
      reserved.set(ingredient.id, used + fromGeneric);
      const missing = Math.max(0, gramsNeeded - fromGeneric);
      const empaques = await listOpenablePacks(ingredient.id, storeId, transaction);
      const mensaje = shortageMessage({ missing, packs: empaques, openOn });
      if (missing > 1e-6) blocked = true;
      if (fromGeneric > 1e-6) {
        advertencias.push(
          `El saldo suelto de ${ingredient.name} no tiene precio por gramo. El costo no se muestra como $0,00.`,
        );
      }
      requiere.push({
        producto: ingredient.name,
        id: ingredient.id,
        kind: "gramos",
        generico: true,
        cantidadGramos: gramsNeeded,
        gramosPorFunda: perUnit,
        gramosGenerico: stock,
        gramosDisponibles: available,
        gramosDespues: available - gramsNeeded,
        suficiente: missing <= 1e-6,
        faltanteGramos: missing,
        empaques,
        aperturaPermitida: openOn,
        mensaje,
      });
      continue;
    }

    const stock = await storeQty(storeId, ingredient.id, transaction);
    const used = reserved.get(ingredient.id) || 0;
    const available = Math.max(0, stock - used);
    reserved.set(ingredient.id, used + gramsNeeded);
    const missing = Math.max(0, gramsNeeded - available);
    if (missing > 0) blocked = true;
    requiere.push({
      producto: ingredient.name,
      id: ingredient.id,
      kind: "gramos",
      generico: false,
      cantidadGramos: gramsNeeded,
      gramosPorFunda: perUnit,
      gramosDisponibles: available,
      gramosDespues: available - gramsNeeded,
      suficiente: missing <= 0,
      faltanteGramos: missing,
      empaques: [],
      aperturaPermitida: false,
      mensaje: missing > 0 ? "No hay stock disponible" : null,
    });
  }

  const finalStock = await storeQty(storeId, finalProduct.id, transaction);
  const sinPrecio = advertencias.length > 0;

  return {
    storeId,
    producto: finalProduct.name,
    id: finalProduct.id,
    cantidadDeseada: quantity,
    unidad: "fundas",
    fundasResultantes: finalStock + quantity,
    stockActualFundas: finalStock,
    requiere,
    bloqueado: blocked,
    aperturaPermitida: openOn,
    costoInsumo: sinPrecio ? null : null,
    extras: null,
    costoPorFunda: null,
    advertencias: [...new Set(advertencias)],
  };
}

async function prepareGeneric({
  ingredientId,
  nombre,
  plan,
  opens,
  wastes,
  transaction,
  opId,
  mov,
  referenceType,
  accountId,
  movementDate,
  ledger,
}) {
  if (ledger.prepared.has(ingredientId)) return;
  ledger.prepared.add(ingredientId);

  const wasteRows = wastes.filter((row) => row.insumoId === ingredientId);
  const wasteGrams = wasteRows.reduce((sum, row) => sum + row.gramos, 0);
  if (wasteRows.some((row) => !row.motivo)) {
    throw new ProductionInputError("Indicá el motivo de la merma");
  }
  const stock = await storeQty(plan.storeId, ingredientId, transaction);
  if (wasteGrams > stock + 1e-6) {
    throw new ProductionInputError(
      `La merma (${formatGrams(wasteGrams)} g) supera el saldo de ${nombre} (${formatGrams(stock)} g)`,
    );
  }
  ledger.slices.set(ingredientId, [{ grams: Math.max(0, stock - wasteGrams), pricePerGram: null }]);
  if (wasteGrams > 1e-6) {
    await adjustStoreStock(plan.storeId, ingredientId, -roundQty(wasteGrams), {
      transaction,
      allowNegative: false,
    });
    await mov({
      productId: ingredientId,
      type: "salida",
      reason: "SALIDA_MERMA",
      quantity: roundQty(wasteGrams),
      description: `Merma de ${nombre} (${formatGrams(wasteGrams)} g): ${wasteRows.map((row) => row.motivo).join(". ")}. OP:${opId}`,
    });
  }

  const mine = opens.filter((row) => row.insumoId === ingredientId);
  for (const open of mine) {
    const presentation = await InventoryProduct.findByPk(open.productId, { transaction });
    const grams = gramsAddedWhenOpened(presentation, ingredientId);
    if (!presentation || !(grams > 0)) {
      throw new ProductionInputError(
        `${presentation?.name || "El producto"} no pertenece al insumo ${nombre}`,
      );
    }
    const price = Number(presentation.supplierPrice) || 0;
    const pricePerGram = price > 0 ? price / grams : null;
    await executeOpenPresentation({
      presentationId: open.productId,
      packsToOpen: open.packs,
      storeId: plan.storeId,
      accountId,
      transaction,
      referenceType,
      referenceId: null,
      date: movementDate,
      description: `Apertura para producción de ${plan.producto}: ${open.packs} × ${presentation.name} (${formatGrams(grams * open.packs)} g a ${nombre}). OP:${opId}`,
    });
    const slices = ledger.slices.get(ingredientId) || [];
    slices.push({ grams: grams * open.packs, pricePerGram });
    ledger.slices.set(ingredientId, slices);
  }
}

function consumeSlices(slices, grams) {
  let left = grams;
  let money = 0;
  let missingPrice = false;
  const next = [];
  for (const slice of slices) {
    if (left <= 1e-6) {
      next.push(slice);
      continue;
    }
    const take = Math.min(slice.grams, left);
    if (take > 1e-6 && !(slice.pricePerGram > 0)) missingPrice = true;
    else money += take * slice.pricePerGram;
    left -= take;
    if (slice.grams - take > 1e-6) next.push({ ...slice, grams: slice.grams - take });
  }
  if (left > 1e-6) missingPrice = true;
  return { slices: next, money, missingPrice, uncovered: left };
}

export async function applyProductionPlan(plan, options) {
  const {
    transaction,
    allowAutocomplete = false,
    opId,
    mov,
    abrirEmpaques,
    mermas,
    referenceType,
    accountId,
    movementDate,
  } = options || {};
  assertPackagingActionsAllowed({
    abrirEmpaques,
    mermas,
    autocompletar: allowAutocomplete === true,
  });
  const opens = normalizeOpens(abrirEmpaques);
  const wastes = normalizeMermas(mermas);
  const recipeIds = new Set((plan.requiere || []).map((node) => Number(node.id)));
  for (const row of [...opens, ...wastes]) {
    if (!recipeIds.has(row.insumoId)) {
      throw new ProductionInputError("Ese insumo no está en la receta");
    }
  }
  const ledger = { prepared: new Set(), slices: new Map(), money: 0, missingPrice: plan.advertencias?.length > 0 };

  for (const node of plan.requiere) {
    if (node.kind === "unidad") {
      if (!node.suficiente) {
        throw new ProductionInputError(
          `Faltan ${formatGrams(node.faltanteUnidades || 0)} unidades de ${node.producto}; disponible ${formatGrams(node.stockActual || 0)}`,
        );
      }
      const need = roundQty(node.cantidadUnidades);
      await adjustStoreStock(plan.storeId, node.id, -need, {
        transaction,
        allowNegative: false,
      });
      await mov({
        productId: node.id,
        type: "salida",
        reason: "SALIDA_CONSUMO_INTERNO",
        quantity: need,
        description: `Consumo de ${node.producto} (${need} u) para ${plan.producto}. OP:${opId}`,
      });
      continue;
    }

    if (node.generico) {
      await prepareGeneric({
        ingredientId: node.id,
        nombre: node.producto,
        plan,
        opens,
        wastes,
        transaction,
        opId,
        mov,
        referenceType,
        accountId,
        movementDate,
        ledger,
      });
      let stock = await storeQty(plan.storeId, node.id, transaction);
      let missing = node.cantidadGramos - stock;
      if (missing > 1e-6) {
        if (allowAutocomplete !== true) {
          const packs = await listOpenablePacks(node.id, plan.storeId, transaction);
          const msg = shortageMessage({
            missing,
            packs,
            openOn: packagingOpenEnabled(),
          });
          if (msg) throw new ProductionInputError(msg);
          throw new ProductionInputError(
            `Faltan ${formatGrams(missing)} g de ${node.producto}; disponible ${formatGrams(stock)} g`,
          );
        }
        await adjustStoreStock(plan.storeId, node.id, roundQty(missing), {
          transaction,
          allowNegative: false,
        });
        await mov({
          productId: node.id,
          type: "ajuste",
          reason: "AJUSTE_ENTRADA",
          quantity: roundQty(missing),
          description: `Autocompletar stock de ${node.producto} (${formatGrams(missing)} g) para producir. OP:${opId}`,
        });
        const slices = ledger.slices.get(node.id) || [];
        slices.push({ grams: missing, pricePerGram: null });
        ledger.slices.set(node.id, slices);
        stock += missing;
      }
      const slices = ledger.slices.get(node.id) || [{ grams: stock, pricePerGram: null }];
      const consumed = consumeSlices(slices, node.cantidadGramos);
      ledger.slices.set(node.id, consumed.slices);
      ledger.money += consumed.money;
      if (consumed.missingPrice) ledger.missingPrice = true;
      await adjustStoreStock(plan.storeId, node.id, -roundQty(node.cantidadGramos), {
        transaction,
        allowNegative: false,
      });
      await mov({
        productId: node.id,
        type: "salida",
        reason: "SALIDA_CONSUMO_INTERNO",
        quantity: roundQty(node.cantidadGramos),
        description: `Consumo de ${node.producto} (${formatGrams(node.cantidadGramos)} g) para ${plan.producto}. OP:${opId}`,
      });
      continue;
    }

    const stock = await storeQty(plan.storeId, node.id, transaction);
    if (stock + 1e-6 < node.cantidadGramos) {
      throw new ProductionInputError("No hay stock disponible");
    }
    await adjustStoreStock(plan.storeId, node.id, -roundQty(node.cantidadGramos), {
      transaction,
      allowNegative: false,
    });
    await mov({
      productId: node.id,
      type: "salida",
      reason: "SALIDA_CONSUMO_INTERNO",
      quantity: roundQty(node.cantidadGramos),
      description: `Consumo de ${node.producto} (${formatGrams(node.cantidadGramos)} g) para ${plan.producto}. OP:${opId}`,
    });
  }

  const qty = Number(plan.cantidadDeseada) || 1;
  const insumos = ledger.money / qty;
  const extras = insumos * (EXTRAS_PERCENT / 100);
  plan.costoInsumo = ledger.missingPrice ? null : Number(insumos.toFixed(6));
  plan.extras = ledger.missingPrice ? null : Number(extras.toFixed(6));
  plan.costoPorFunda = ledger.missingPrice ? null : Number((insumos + extras).toFixed(6));
  if (ledger.missingPrice && !plan.advertencias?.length) {
    plan.advertencias = ["Hay gramos sin precio de proveedor. El costo no se muestra como $0,00."];
  }

  await adjustStoreStock(plan.storeId, plan.id, plan.cantidadDeseada, {
    transaction,
    allowNegative: false,
  });
  await mov({
    productId: plan.id,
    type: "produccion",
    reason: "ENTRADA_PRODUCCION",
    quantity: plan.cantidadDeseada,
    price: plan.costoPorFunda,
    description: `Producción de ${plan.cantidadDeseada} ${plan.producto}. OP:${opId}`,
  });
}

/** Solo Administrador o Propietario, y solo si Configuración permite abrir empaque. */
export function autocompleteAllowed(user, requested) {
  if (requested !== true) return false;
  if (!isPrivileged(user)) return false;
  if (!packagingOpenEnabled()) return false;
  return true;
}

export async function quoteGramLine(ingredient, gramsNeeded, { transaction, storeId } = {}) {
  if (!ingredient) return null;
  const sid = storeId || (await getDefaultStockStoreId({ transaction }));
  if (!isGenericIngredient(ingredient)) {
    const grams = Number(ingredient.standardWeightGrams) || 0;
    const supplierPrice = Number(ingredient.supplierPrice) || 0;
    const pricePerGram = supplierPrice > 0 && grams > 0 ? supplierPrice / grams : 0;
    return {
      sourceId: ingredient.id,
      sourceName: ingredient.name,
      gramsPerUnit: grams > 0 ? grams : 1,
      supplierPrice,
      pricePerGram,
      missingPrice: !(pricePerGram > 0),
    };
  }
  const packs = await listOpenablePacks(ingredient.id, sid, transaction);
  const priced = packs.find((pack) => !pack.sinPrecio) || null;
  if (!priced) {
    return {
      sourceId: ingredient.id,
      sourceName: ingredient.name,
      gramsPerUnit: Number(gramsNeeded) || 0,
      supplierPrice: 0,
      pricePerGram: 0,
      missingPrice: true,
    };
  }
  return {
    sourceId: priced.productId,
    sourceName: priced.nombre,
    gramsPerUnit: priced.gramosPorEmpaque,
    supplierPrice: priced.precioProveedor,
    pricePerGram: priced.costoPorGramo,
    missingPrice: false,
  };
}
