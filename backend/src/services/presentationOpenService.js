/**
 * Apertura de empaque (1 destino o surtido multi).
 * Usado por MovementController y auto-apertura en POS.
 */
import { InventoryMovement, InventoryProduct, InventoryUnit } from "../models/Inventory.js";
import {
  adjustStoreStock,
  getDefaultStockStoreId,
  getStoreStockQty,
} from "./storeStockService.js";
import { consumeBatchesFefo } from "./batchStockService.js";
import {
  presentationContainsProduct,
  resolvePackOpenLines,
  unitsOfProductInPack,
} from "../utils/packContentsUtils.js";
import { nowApp } from "../utils/appDateTime.js";
import { Op } from "sequelize";

const PRESENTATION_OPEN_REF = "presentation_open";

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Abre N pacas de una presentación dentro de una transacción.
 */
export async function executeOpenPresentation({
  presentationId,
  packsToOpen = 1,
  storeId: storeIdInput = null,
  accountId,
  description = null,
  date = null,
  transaction,
  referenceType = PRESENTATION_OPEN_REF,
  referenceId = null,
}) {
  const packs = Math.max(1, Math.floor(num(packsToOpen)) || 1);
  const presentation = await InventoryProduct.findByPk(presentationId, {
    include: [{ model: InventoryUnit }],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  if (!presentation) {
    const err = new Error("Presentación no encontrada");
    err.statusCode = 404;
    throw err;
  }
  if (presentation.isGenericIngredient) {
    const err = new Error("Un insumo genérico no se abre como presentación.");
    err.statusCode = 400;
    throw err;
  }

  const lines = resolvePackOpenLines(presentation);
  if (!lines.length) {
    const err = new Error("Este producto no tiene un destino configurado para apertura.");
    err.statusCode = 400;
    throw err;
  }

  const stockStoreId =
    storeIdInput != null && storeIdInput !== ""
      ? Number(storeIdInput)
      : await getDefaultStockStoreId({ transaction });
  if (!stockStoreId) {
    const err = new Error("No se pudo determinar el local de apertura.");
    err.statusCode = 400;
    throw err;
  }

  const presStock = await getStoreStockQty(stockStoreId, presentation.id, { transaction });
  if (presStock < packs) {
    const err = new Error(
      `Stock insuficiente en el local seleccionado (hay ${presStock}, se pidieron ${packs}).`,
    );
    err.statusCode = 400;
    throw err;
  }

  const targets = [];
  for (const line of lines) {
    const target = await InventoryProduct.findByPk(line.productId, {
      include: [{ model: InventoryUnit }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!target) {
      const err = new Error(`Destino #${line.productId} no encontrado.`);
      err.statusCode = 400;
      throw err;
    }
    if (Number(target.id) === Number(presentation.id)) {
      const err = new Error("Una presentación no puede abrirse sobre sí misma.");
      err.statusCode = 400;
      throw err;
    }
    const addQty = round2(Number(line.qty) * packs);
    if (!(addQty > 0)) {
      const err = new Error("Cantidad de desglose inválida en el enlace.");
      err.statusCode = 400;
      throw err;
    }
    targets.push({ target, addQty, qtyPerPack: Number(line.qty) });
  }

  await adjustStoreStock(stockStoreId, presentation.id, -packs, {
    transaction,
    allowNegative: false,
  });
  await presentation.reload({ transaction });
  await consumeBatchesFefo({
    productId: presentation.id,
    quantity: packs,
    storeId: stockStoreId,
    transaction,
  });

  const presLabel = presentation.purchasePresentation || presentation.name;
  const parts = targets.map(
    ({ target, addQty }) =>
      `${target.name} (+${addQty} ${target.InventoryUnit?.abbreviation || "u"})`,
  );
  const desc =
    description?.trim() ||
    `Apertura: ${packs} × ${presLabel} → ${parts.join(", ")}`;
  const movementDate = date || nowApp();
  const batchRef = referenceId != null ? Number(referenceId) || referenceId : Date.now() % 2_000_000_000;

  const movementIds = [];
  const salida = await InventoryMovement.create(
    {
      productId: presentation.id,
      type: "salida",
      reason: "SALIDA_OTRA",
      quantity: packs,
      description: desc,
      price: null,
      referenceType,
      referenceId: batchRef,
      createdBy: accountId,
      date: movementDate,
    },
    { transaction },
  );
  movementIds.push(salida.id);

  const targetResults = [];
  for (const { target, addQty } of targets) {
    await adjustStoreStock(stockStoreId, target.id, addQty, {
      transaction,
      allowNegative: false,
    });
    await target.reload({ transaction });

    const entrada = await InventoryMovement.create(
      {
        productId: target.id,
        type: "entrada",
        reason: "ENTRADA_OTRA",
        quantity: addQty,
        description: desc,
        price: null,
        referenceType,
        referenceId: batchRef,
        createdBy: accountId,
        date: movementDate,
      },
      { transaction },
    );
    movementIds.push(entrada.id);
    targetResults.push({
      id: target.id,
      name: target.name,
      type: target.isGenericIngredient ? "generic" : "final",
      stockAfter: round2(num(target.stock)),
      addedInUnit: addQty,
      unitAbbrev: target.InventoryUnit?.abbreviation ?? "—",
    });
  }

  return {
    presentation: {
      id: presentation.id,
      name: presentation.name,
      stockAfter: round2(num(presentation.stock)),
    },
    target: targetResults[0] || null,
    targets: targetResults,
    storeId: stockStoreId,
    packsOpened: packs,
    movementIds,
  };
}

export async function autoOpenPacksToCoverProduct({
  productId,
  deficitQty,
  storeId,
  accountId,
  transaction,
  referenceType = "order",
  referenceId = null,
}) {
  let need = Math.max(0, num(deficitQty));
  if (!(need > 0)) return { packsOpened: 0, unitsGained: 0 };

  const rows = await InventoryProduct.findAll({
    where: {
      isGenericIngredient: false,
      isActive: true,
      [Op.or]: [{ genericProductId: productId }, { packContents: { [Op.ne]: null } }],
    },
    include: [{ model: InventoryUnit }],
    transaction,
  });

  const candidates = [];
  for (const pack of rows) {
    if (!presentationContainsProduct(pack, productId)) continue;
    const perPack = unitsOfProductInPack(pack, productId);
    if (!(perPack > 0)) continue;
    const stock = await getStoreStockQty(storeId, pack.id, { transaction });
    if (stock < 1) continue;
    candidates.push({ pack, perPack, stock: Math.floor(stock) });
  }
  candidates.sort((a, b) => b.stock - a.stock);

  let packsOpened = 0;
  let unitsGained = 0;

  for (const { pack, perPack, stock } of candidates) {
    if (need <= 0) break;
    const needPacks = Math.ceil(need / perPack);
    const toOpen = Math.min(needPacks, stock);
    if (toOpen < 1) continue;

    await executeOpenPresentation({
      presentationId: pack.id,
      packsToOpen: toOpen,
      storeId,
      accountId,
      description: `Auto-apertura POS para cubrir ${need} u. de producto #${productId}`,
      transaction,
      referenceType,
      referenceId,
    });

    packsOpened += toOpen;
    const gained = toOpen * perPack;
    unitsGained += gained;
    need = Math.max(0, need - gained);
  }

  return { packsOpened, unitsGained };
}

export { PRESENTATION_OPEN_REF };
