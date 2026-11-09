/**
 * Costo del insumo genérico = última compra del empaque enlazado ÷ cantidad que rinde.
 * Ej.: quintal $40 → 45360 g ⇒ genérico supplierPrice = 40/45360 ($/g).
 * Cubeta $3.75 → 30 huevos ⇒ genérico = 3.75/30 ($/u).
 */
import { Op } from "sequelize";
import {
  InventoryProduct,
  InventoryMovement,
  InventoryRecipe,
} from "../models/Inventory.js";
import { SupplierOrder, SupplierOrderItem } from "../models/Orders.js";
import { resolvePackOpenLines } from "../utils/packContentsUtils.js";

const round6 = (n) => Math.round((Number(n) + Number.EPSILON) * 1e6) / 1e6;
const toNum = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function orderTime(order) {
  if (!order) return 0;
  const t = new Date(order.receivedAt || order.date || 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Precio unitario de la última compra del empaque (pedido proveedor o movimiento).
 * @returns {Promise<{ unitPrice: number, source: string, at: number }|null>}
 */
export async function getLastPurchaseUnitPrice(productId, { transaction } = {}) {
  const pid = Number(productId);
  if (!(pid > 0)) return null;

  const items = await SupplierOrderItem.findAll({
    where: { productId: pid, unitPrice: { [Op.gt]: 0 } },
    attributes: ["unitPrice", "orderId", "quantity"],
    transaction,
  });

  if (items.length) {
    const orderIds = [
      ...new Set(items.map((r) => Number(r.orderId)).filter((n) => n > 0)),
    ];
    const orders = await SupplierOrder.findAll({
      where: { id: { [Op.in]: orderIds } },
      attributes: ["id", "date", "receivedAt", "status"],
      transaction,
    });
    const byId = new Map(orders.map((o) => [Number(o.id), o]));

    const ranked = [...items]
      .map((row) => {
        const order = byId.get(Number(row.orderId));
        if (!order) return null;
        const status = String(order.status || "").toLowerCase();
        const received =
          Boolean(order.receivedAt) ||
          status === "recibido" ||
          status === "received" ||
          status === "parcial" ||
          status === "partial";
        // unitPrice del ítem = costo de 1 empaque (ej. quintal $39)
        return {
          unitPrice: toNum(row.unitPrice),
          at: orderTime(order),
          received,
          orderId: Number(order.id),
        };
      })
      .filter((x) => x && x.unitPrice > 0)
      .sort((a, b) => {
        // Más reciente primero; a igualdad, preferir recibido
        if (a.at !== b.at) return b.at - a.at;
        if (a.received !== b.received) return a.received ? -1 : 1;
        return b.orderId - a.orderId;
      });

    if (ranked[0]) {
      return {
        unitPrice: ranked[0].unitPrice,
        source: "supplier_order",
        at: ranked[0].at,
      };
    }
  }

  const mov = await InventoryMovement.findOne({
    where: {
      productId: pid,
      type: "entrada",
      reason: "ENTRADA_COMPRA",
      price: { [Op.ne]: null },
    },
    order: [
      ["date", "DESC"],
      ["id", "DESC"],
    ],
    transaction,
  });
  if (mov) {
    const qty = toNum(mov.quantity);
    const total = toNum(mov.price);
    if (qty > 0 && total >= 0) {
      return {
        unitPrice: total / qty,
        source: "movement",
        at: new Date(mov.date || 0).getTime() || 0,
      };
    }
  }

  return null;
}

/** Presentaciones que al abrirse entregan stock a este genérico. */
export async function findPresentationsLinkedToGeneric(
  genericProductId,
  { transaction } = {},
) {
  const gid = Number(genericProductId);
  if (!(gid > 0)) return [];

  const candidates = await InventoryProduct.findAll({
    where: {
      isActive: true,
      [Op.or]: [
        { genericProductId: gid },
        { packContents: { [Op.ne]: null } },
      ],
    },
    attributes: [
      "id",
      "name",
      "genericProductId",
      "unitsPerPack",
      "packContents",
      "supplierPrice",
      "price",
    ],
    transaction,
  });

  return candidates
    .map((row) => {
      const lines = resolvePackOpenLines(row);
      const line = lines.find((l) => Number(l.productId) === gid);
      if (!line) return null;
      return { presentation: row, qtyIntoGeneric: Number(line.qty), lines };
    })
    .filter(Boolean);
}

/**
 * Aplica compra de un empaque: actualiza supplierPrice de cada genérico destino.
 * packUnitPrice = costo de 1 unidad del empaque (cubeta, quintal, etc.).
 */
export async function applyPackPurchaseToLinkedGenerics({
  presentation,
  packUnitPrice,
  transaction,
} = {}) {
  const unit = toNum(packUnitPrice, -1);
  if (!presentation || !(unit >= 0)) return [];

  const lines = resolvePackOpenLines(presentation);
  if (!lines.length) return [];

  const totalQty = lines.reduce((s, l) => s + toNum(l.qty), 0);
  if (!(totalQty > 0)) return [];

  const costPerContentUnit = unit / totalQty;
  const updated = [];

  for (const line of lines) {
    const generic = await InventoryProduct.findByPk(line.productId, {
      transaction,
      lock: transaction?.LOCK?.UPDATE,
    });
    if (!generic) continue;

    const isIngredient =
      Boolean(generic.isGenericIngredient) ||
      Boolean(generic.isRaw) ||
      String(generic.type || "") === "raw";
    if (!isIngredient) continue;
    // No pisar un producto solo-vendible que coincida por error
    if (generic.genericProductId != null) continue;

    const next = round6(costPerContentUnit);
    await generic.update(
      {
        supplierPrice: next,
        // La receta (ruta g/ml) usa price/netWeight; con netWeight<=1 dejamos price = $/unidad base
        ...(Number(generic.netWeight) > 1
          ? {}
          : { price: next }),
      },
      { transaction },
    );
    updated.push({
      genericId: generic.id,
      name: generic.name,
      supplierPrice: next,
      fromPresentationId: presentation.id,
      packUnitPrice: unit,
      qtyIntoGeneric: toNum(line.qty),
      totalPackQty: totalQty,
    });
  }

  return updated;
}

/**
 * Tras comprar productId (empaque): si tiene enlace, actualiza genéricos.
 * priceTotalOrUnit: si isTotal=true, price es total de la línea (÷ quantity).
 */
export async function syncGenericsAfterPackPurchase({
  productId,
  quantity,
  price,
  priceIsTotal = true,
  transaction,
} = {}) {
  const pid = Number(productId);
  const qty = toNum(quantity);
  if (!(pid > 0) || !(qty > 0)) return [];

  const presentation = await InventoryProduct.findByPk(pid, { transaction });
  if (!presentation) return [];

  const lines = resolvePackOpenLines(presentation);
  if (!lines.length) return [];

  let packUnit = toNum(price, -1);
  if (!(packUnit >= 0)) return [];
  if (priceIsTotal) packUnit = packUnit / qty;

  return applyPackPurchaseToLinkedGenerics({
    presentation,
    packUnitPrice: packUnit,
    transaction,
  });
}

/**
 * Recalcula genérico desde empaque enlazado.
 * Sin presentationId: el de última compra (más reciente).
 * Con presentationId: fuerza ese empaque (aunque no sea el más reciente).
 * Solo propone; no escribe en BD.
 */
export async function proposeGenericCostFromLinkedPurchases(
  genericProductId,
  { transaction, presentationId } = {},
) {
  const gid = Number(genericProductId);
  if (!(gid > 0)) return null;

  const generic = await InventoryProduct.findByPk(gid, { transaction });
  if (!generic) return null;

  let links = await findPresentationsLinkedToGeneric(gid, { transaction });
  if (!links.length) return null;

  const forcedPid = Number(presentationId);
  if (forcedPid > 0) {
    links = links.filter((l) => Number(l.presentation.id) === forcedPid);
    if (!links.length) return null;
  }

  let best = null;
  for (const { presentation, qtyIntoGeneric, lines } of links) {
    const purchase = await getLastPurchaseUnitPrice(presentation.id, {
      transaction,
    });
    // Fallback: precio proveedor del catálogo del empaque (ej. quintal $39)
    const packUnitPrice =
      purchase && purchase.unitPrice > 0
        ? purchase.unitPrice
        : toNum(presentation.supplierPrice) > 0
          ? toNum(presentation.supplierPrice)
          : toNum(presentation.price) > 0
            ? toNum(presentation.price)
            : 0;
    if (!(packUnitPrice > 0)) continue;

    // Costo por unidad base del genérico = precio del empaque ÷ lo que rinde HACIA este genérico
    // (no ÷ suma de toda la paca surtida).
    const yieldQty = toNum(qtyIntoGeneric) > 0
      ? toNum(qtyIntoGeneric)
      : lines.reduce((s, l) => s + toNum(l.qty), 0);
    if (!(yieldQty > 0)) continue;
    const costPerUnit = packUnitPrice / yieldQty;
    const at = purchase?.at || 0;
    const source = purchase?.source || "catalog_supplierPrice";
    // Si forzaron un empaque, tomar el primero válido; si no, el de compra más reciente
    if (forcedPid > 0) {
      best = {
        at,
        source,
        costPerUnit,
        presentationId: presentation.id,
        presentationName: presentation.name,
        packUnitPrice,
        qtyIntoGeneric: yieldQty,
        totalQty: yieldQty,
        forced: true,
      };
      break;
    }
    if (
      !best ||
      at > best.at ||
      (at === best.at &&
        source === "supplier_order" &&
        best.source !== "supplier_order") ||
      (at === 0 && best.at === 0 && costPerUnit > 0 && !best.costPerUnit)
    ) {
      best = {
        at,
        source,
        costPerUnit,
        presentationId: presentation.id,
        presentationName: presentation.name,
        packUnitPrice,
        qtyIntoGeneric: yieldQty,
        totalQty: yieldQty,
        forced: false,
      };
    }
  }

  if (!best) return null;

  const proposed = round6(best.costPerUnit);
  const current = round6(
    toNum(generic.supplierPrice) > 0
      ? generic.supplierPrice
      : Number(generic.unitId) === 1
        ? generic.price
        : toNum(generic.netWeight) > 0
          ? toNum(generic.price) / toNum(generic.netWeight)
          : generic.price,
  );
  const diff = Math.abs(proposed - current);
  const differs = proposed > 0 && (current <= 0 ? true : diff >= 1e-6);

  return {
    genericId: generic.id,
    genericName: generic.name,
    unitId: generic.unitId,
    unitLabel: Number(generic.unitId) === 1 ? "/u" : "/g",
    currentCost: current,
    proposedCost: proposed,
    differs,
    delta: round6(proposed - current),
    presentationId: best.presentationId,
    presentationName: best.presentationName,
    packUnitPrice: round6(best.packUnitPrice),
    qtyIntoGeneric: best.qtyIntoGeneric,
    linkedCount: links.length,
    purchaseSource: best.source,
    purchaseAt: best.at ? new Date(best.at).toISOString() : null,
    selectedManually: Boolean(best.forced),
  };
}

/**
 * Elige el empaque a mostrar en el árbol:
 * 1) el cuyo $/base coincide con supplierPrice del genérico (empaque aplicado),
 * 2) si no, el de última compra.
 */
export async function resolvePackProposalForCosting(
  genericProductId,
  { transaction } = {},
) {
  const gid = Number(genericProductId);
  if (!(gid > 0)) return null;

  const generic = await InventoryProduct.findByPk(gid, {
    attributes: ["id", "supplierPrice"],
    transaction,
  });
  const current = round6(toNum(generic?.supplierPrice));
  const latest = await proposeGenericCostFromLinkedPurchases(gid, {
    transaction,
  });

  if (!(current > 0)) return latest;

  const links = await findPresentationsLinkedToGeneric(gid, { transaction });
  for (const { presentation } of links) {
    const row = await proposeGenericCostFromLinkedPurchases(gid, {
      transaction,
      presentationId: presentation.id,
    });
    if (!row || !(row.proposedCost > 0)) continue;
    if (Math.abs(round6(row.proposedCost) - current) < 1e-5) {
      return { ...row, matchedCatalog: true };
    }
  }
  return latest ? { ...latest, matchedCatalog: false } : null;
}

/**
 * Aplica la propuesta (escribe supplierPrice del genérico).
 * presentationId opcional: fuerza un empaque enlazado concreto.
 */
export async function refreshGenericCostFromLinkedPurchases(
  genericProductId,
  { transaction, presentationId } = {},
) {
  const proposal = await proposeGenericCostFromLinkedPurchases(genericProductId, {
    transaction,
    presentationId,
  });
  if (!proposal || !(proposal.proposedCost > 0)) return null;

  const generic = await InventoryProduct.findByPk(genericProductId, {
    transaction,
  });
  if (!generic) return null;

  const next = proposal.proposedCost;
  // Solo costo proveedor del genérico: no pisar precio de venta
  await generic.update(
    {
      supplierPrice: next,
    },
    { transaction },
  );

  // Alinear el empaque de esa compra con el precio unitario real (ej. quintal $39)
  if (proposal.presentationId && proposal.packUnitPrice > 0) {
    const pack = await InventoryProduct.findByPk(proposal.presentationId, {
      transaction,
    });
    if (pack) {
      await pack.update(
        { supplierPrice: round6(proposal.packUnitPrice) },
        { transaction },
      );
    }
  }

  return {
    ...proposal,
    supplierPrice: next,
    applied: true,
  };
}

/**
 * Costo unitario a usar en receta: catálogo actual (sin pisar precios).
 * costMode: "supplier" (default) = precio proveedor / última compra;
 *           "sale" = precio de venta.
 */
export async function resolveIngredientUnitCost(
  product,
  { transaction, costMode = "supplier" } = {},
) {
  if (!product) return { unitCost: 0, unitLabel: "/u", source: "none" };

  const mode = costMode === "sale" ? "sale" : "supplier";
  const supplier = toNum(product.supplierPrice);
  const price = toNum(product.price);
  const net = toNum(product.netWeight);
  const unitLabel = Number(product.unitId) === 1 ? "/u" : "/g";

  const fromField = (value, source) => {
    if (!(value > 0)) return null;
    if (Number(product.unitId) === 1) {
      return { unitCost: value, unitLabel: "/u", source };
    }
    // En g/ml: si netWeight > 1 el catálogo suele ser precio de empaque
    if (net > 1) {
      return { unitCost: value / net, unitLabel: "/g", source: `${source}/netWeight` };
    }
    return { unitCost: value, unitLabel: "/g", source };
  };

  if (mode === "sale") {
    return (
      fromField(price, "price") ||
      fromField(supplier, "supplierPrice") || {
        unitCost: 0,
        unitLabel,
        source: "none",
      }
    );
  }

  return (
    fromField(supplier, "supplierPrice") ||
    fromField(price, "price") || {
      unitCost: 0,
      unitLabel,
      source: "none",
    }
  );
}

/** Recorre receta (y sub-recetas) y compara precio catálogo vs última compra de empaque. */
export async function collectRecipeIngredientPriceAlerts(
  productFinalId,
  { transaction } = {},
) {
  const rootId = Number(productFinalId);
  if (!(rootId > 0)) {
    return { alerts: [], comparisons: [], genericCount: 0 };
  }

  const seen = new Set();
  const genericIds = new Set();
  const stack = [rootId];

  while (stack.length) {
    const fid = stack.pop();
    if (seen.has(fid)) continue;
    seen.add(fid);

    const lines = await InventoryRecipe.findAll({
      where: { productFinalId: fid },
      attributes: ["productRawId"],
      transaction,
    });

    for (const line of lines) {
      const rid = Number(line.productRawId);
      if (!(rid > 0)) continue;
      const raw = await InventoryProduct.findByPk(rid, {
        attributes: [
          "id",
          "name",
          "type",
          "isRaw",
          "isRecipe",
          "isGenericIngredient",
          "genericProductId",
          "unitId",
          "supplierPrice",
          "price",
          "netWeight",
        ],
        transaction,
      });
      if (!raw) continue;

      // Intermedio o producto con sub-receta: bajar a sus insumos, no comparar vs empaque.
      const isIntermediate = String(raw.type || "") === "intermediate";
      let hasSubRecipe = isIntermediate;
      if (!hasSubRecipe) {
        const subCount = await InventoryRecipe.count({
          where: { productFinalId: rid },
          transaction,
        });
        hasSubRecipe = subCount > 0;
      }
      if (hasSubRecipe) {
        stack.push(rid);
        continue;
      }

      const isGeneric =
        (Boolean(raw.isGenericIngredient) ||
          Boolean(raw.isRaw) ||
          String(raw.type || "") === "raw") &&
        raw.genericProductId == null;
      if (isGeneric) genericIds.add(rid);
    }
  }

  const comparisons = [];
  for (const gid of genericIds) {
    const proposal = await proposeGenericCostFromLinkedPurchases(gid, {
      transaction,
    });
    if (proposal) {
      comparisons.push({
        ...proposal,
        status: proposal.differs ? "outdated" : "up_to_date",
      });
      continue;
    }

    const generic = await InventoryProduct.findByPk(gid, { transaction });
    if (!generic) continue;
    const current = round6(
      toNum(generic.supplierPrice) > 0
        ? generic.supplierPrice
        : Number(generic.unitId) === 1
          ? generic.price
          : toNum(generic.netWeight) > 0
            ? toNum(generic.price) / toNum(generic.netWeight)
            : generic.price,
    );
    const links = await findPresentationsLinkedToGeneric(gid, { transaction });
    comparisons.push({
      genericId: generic.id,
      genericName: generic.name,
      unitId: generic.unitId,
      unitLabel: Number(generic.unitId) === 1 ? "/u" : "/g",
      currentCost: current,
      proposedCost: null,
      differs: false,
      delta: 0,
      presentationId: links[0]?.presentation?.id ?? null,
      presentationName: links[0]?.presentation?.name ?? null,
      packUnitPrice: null,
      qtyIntoGeneric: links[0]?.qtyIntoGeneric ?? null,
      linkedCount: links.length,
      purchaseSource: null,
      purchaseAt: null,
      status: links.length ? "no_purchase" : "no_link",
    });
  }

  comparisons.sort((a, b) =>
    String(a.genericName || "").localeCompare(String(b.genericName || ""), "es"),
  );
  const alerts = comparisons.filter((c) => c.differs);
  return {
    alerts,
    comparisons,
    genericCount: genericIds.size,
  };
}

/** Aplica actualización a uno o varios genéricos. */
export async function applyIngredientPriceAlerts(
  genericIds,
  { transaction, presentationId } = {},
) {
  const ids = [...new Set((genericIds || []).map(Number).filter((n) => n > 0))];
  const applied = [];
  const forcedPid = Number(presentationId);
  for (const id of ids) {
    const row = await refreshGenericCostFromLinkedPurchases(id, {
      transaction,
      presentationId: forcedPid > 0 ? forcedPid : undefined,
    });
    if (row) applied.push(row);
  }
  return applied;
}
