/**
 * Valor de inventario: stock × costo / precio venta + ganancia potencial.
 * Si no hay precio proveedor en catálogo, usa la última compra (estimado).
 */
import { Op } from "sequelize";
import { InventoryProduct, Store } from "../../models/Inventory.js";
import { StoreStock } from "../../models/StoreStock.js";
import { SupplierOrder, SupplierOrderItem, Supplier } from "../../models/Orders.js";
import { getAppSettingsSync } from "../../services/appSettingsService.js";
import { storeHoldsInventory } from "../../services/storeStockService.js";
import { notifyFail } from "../../services/notifyRaptorSolutions.js";

const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round2 = (n) => Math.round((toNum(n) + Number.EPSILON) * 100) / 100;

function formatDay(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function orderTime(order) {
  if (order?.receivedAt) {
    const t = new Date(order.receivedAt).getTime();
    if (!Number.isNaN(t)) return t;
  }
  if (order?.date) {
    const t = new Date(order.date).getTime();
    if (!Number.isNaN(t)) return t;
  }
  return Number(order?.id) || 0;
}

/**
 * Última compra por producto (prioriza pedidos recibidos).
 * @returns {Map<number, { unitPrice: number, dateLabel: string|null, supplierName: string|null, orderId: number|null, received: boolean }>}
 */
async function loadLastPurchaseByProductIds(productIds) {
  const ids = [...new Set((productIds || []).map(Number).filter((n) => n > 0))];
  const map = new Map();
  if (!ids.length) return map;

  const itemRows = await SupplierOrderItem.findAll({
    where: {
      productId: { [Op.in]: ids },
      unitPrice: { [Op.gte]: 0 },
    },
    attributes: ["productId", "unitPrice", "orderId"],
  });
  if (!itemRows.length) return map;

  const orderIds = [
    ...new Set(
      itemRows.map((r) => Number(r.orderId)).filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
  const orders = await SupplierOrder.findAll({
    where: { id: { [Op.in]: orderIds } },
    attributes: ["id", "date", "receivedAt", "status"],
    include: [
      {
        model: Supplier,
        as: "ERP_supplier",
        attributes: ["name"],
        required: false,
      },
    ],
  });
  const orderById = new Map(orders.map((o) => [Number(o.id), o]));

  const sorted = [...itemRows].sort((a, b) => {
    const oa = orderById.get(Number(a.orderId));
    const ob = orderById.get(Number(b.orderId));
    return orderTime(ob) - orderTime(oa);
  });

  for (const row of sorted) {
    const pid = Number(row.productId);
    if (!pid) continue;
    const order = orderById.get(Number(row.orderId));
    if (!order) continue;
    const unitPrice = toNum(row.unitPrice);
    if (unitPrice < 0) continue;
    const received = Boolean(order.receivedAt) || order.status === "recibido";
    const prev = map.get(pid);
    if (!prev) {
      map.set(pid, {
        unitPrice,
        dateLabel: formatDay(order.receivedAt || order.date),
        supplierName: order.ERP_supplier?.name || null,
        orderId: order.id != null ? Number(order.id) : null,
        received,
      });
      continue;
    }
    if (!prev.received && received) {
      map.set(pid, {
        unitPrice,
        dateLabel: formatDay(order.receivedAt || order.date),
        supplierName: order.ERP_supplier?.name || null,
        orderId: order.id != null ? Number(order.id) : null,
        received,
      });
    }
  }

  return map;
}

/**
 * Ganancia potencial (final + costo efectivo > 0):
 * (precio consumidor − costo) × cantidad.
 * Siempre incluye catálogo y última compra para comparar / filtrar.
 */
function shapeRow(product, qty, lastPurchaseById) {
  if (!product) return null;
  const quantity = round2(qty);
  if (quantity <= 0) return null;

  const last = lastPurchaseById?.get(Number(product.id)) || null;
  const catalogCostRaw = round2(product?.supplierPrice);
  const catalogCost = catalogCostRaw > 0 ? catalogCostRaw : null;
  const lastPurchaseCostRaw = last ? round2(last.unitPrice) : 0;
  const lastPurchaseCost = lastPurchaseCostRaw > 0 ? lastPurchaseCostRaw : null;

  let unitCost = 0;
  let costSource = "none";
  if (catalogCost != null) {
    unitCost = catalogCost;
    costSource = "catalog";
  } else if (lastPurchaseCost != null) {
    unitCost = lastPurchaseCost;
    costSource = "last_purchase";
  }

  const costDiffers =
    catalogCost != null &&
    lastPurchaseCost != null &&
    Math.abs(catalogCost - lastPurchaseCost) >= 0.01;
  const lastPurchaseHigher = costDiffers && lastPurchaseCost > catalogCost;
  const lastPurchaseLower = costDiffers && lastPurchaseCost < catalogCost;
  const costDelta = costDiffers ? round2(lastPurchaseCost - catalogCost) : null;

  const unitSale = round2(product.price);
  const type = product.type || "raw";
  const hasCost = unitCost > 0;
  const isFinal = type === "final";
  const unitProfit = isFinal && hasCost ? round2(unitSale - unitCost) : null;
  const valueProfit = unitProfit != null ? round2(unitProfit * quantity) : 0;
  const marginPercent =
    isFinal && hasCost ? round2(((unitSale - unitCost) / unitCost) * 100) : null;

  return {
    id: product.id,
    productId: product.id,
    name: product.name,
    type,
    categoryId: product.categoryId != null ? Number(product.categoryId) : null,
    sku: product.sku || null,
    quantity,
    unitCost,
    unitSale,
    catalogCost,
    lastPurchaseCost,
    /** true si hay costo de catálogo o estimado de última compra */
    hasSupplierCost: hasCost,
    costSource,
    costEstimated: costSource === "last_purchase",
    costDiffers,
    lastPurchaseHigher,
    lastPurchaseLower,
    costDelta,
    lastPurchaseDate: last?.dateLabel || null,
    lastPurchaseOrderId: last?.orderId || null,
    lastPurchaseSupplier: last?.supplierName || null,
    valueCost: round2(quantity * unitCost),
    valueSale: round2(quantity * unitSale),
    unitProfit,
    valueProfit,
    marginPercent,
  };
}

function buildSummary(items) {
  const totalCost = round2(items.reduce((s, i) => s + i.valueCost, 0));
  const totalSale = round2(items.reduce((s, i) => s + i.valueSale, 0));
  const totalQty = round2(items.reduce((s, i) => s + i.quantity, 0));
  const profitOnFinals = round2(
    items.reduce((s, i) => s + (i.valueProfit || 0), 0),
  );

  return {
    productCount: items.length,
    quantity: totalQty,
    valueCost: totalCost,
    valueSale: totalSale,
    margin: round2(totalSale - totalCost),
    profitOnFinals,
    withCostCount: items.filter((i) => i.hasSupplierCost).length,
    missingCostCount: items.filter((i) => i.costSource === "none").length,
    estimatedCostCount: items.filter((i) => i.costSource === "last_purchase").length,
    costDiffersCount: items.filter((i) => i.costDiffers).length,
    lastPurchaseHigherCount: items.filter((i) => i.lastPurchaseHigher).length,
    finalsWithCostCount: items.filter(
      (i) => i.type === "final" && i.hasSupplierCost,
    ).length,
  };
}

/**
 * GET /inventory/value-summary?storeId=
 */
export const getInventoryValueSummary = async (req, res) => {
  try {
    const multi = Boolean(getAppSettingsSync()?.multiStockEnabled);
    const storeIdRaw = req.query?.storeId;
    const storeId =
      storeIdRaw != null && storeIdRaw !== "" && String(storeIdRaw) !== "all"
        ? Number(storeIdRaw)
        : null;

    let storeFilter = null;
    if (multi && Number.isFinite(storeId) && storeId > 0) {
      const store = await Store.findByPk(storeId);
      if (!store || !storeHoldsInventory(store.locationKind)) {
        return res.status(400).json({
          message: "Indicá Bodega o una sucursal propia para filtrar.",
        });
      }
      storeFilter = {
        id: store.id,
        name: store.name,
        locationKind: store.locationKind,
      };
    }

    const productAttrs = [
      "id",
      "name",
      "type",
      "sku",
      "stock",
      "price",
      "supplierPrice",
      "categoryId",
      "isActive",
    ];

    /** @type {{ product: any, quantity: number }[]} */
    let productQty = [];
    /** @type {Map<number, any>} */
    const storeAggSeed = new Map();

    if (multi) {
      const stockWhere = {
        quantity: { [Op.gt]: 0 },
        ...(storeFilter ? { storeId: storeFilter.id } : {}),
      };

      const stockRows = await StoreStock.findAll({
        where: stockWhere,
        include: [
          {
            model: Store,
            as: "store",
            attributes: ["id", "name", "locationKind", "isActive"],
            required: true,
          },
          {
            model: InventoryProduct,
            as: "product",
            attributes: productAttrs,
            where: { isActive: true },
            required: true,
          },
        ],
      });

      const byProduct = new Map();

      for (const row of stockRows) {
        const st = row.store;
        const product = row.product;
        if (!product) continue;
        if (!st || !storeHoldsInventory(st.locationKind)) continue;

        const qty = toNum(row.quantity);
        if (qty <= 0) continue;

        const pid = product.id;
        if (!byProduct.has(pid)) {
          byProduct.set(pid, { product, quantity: 0 });
        }
        byProduct.get(pid).quantity = round2(byProduct.get(pid).quantity + qty);

        if (!storeFilter) {
          if (!storeAggSeed.has(st.id)) {
            storeAggSeed.set(st.id, {
              id: st.id,
              storeId: st.id,
              storeName: st.name,
              locationKind: st.locationKind,
              lines: [],
            });
          }
          storeAggSeed.get(st.id).lines.push({ product, quantity: qty });
        }
      }

      productQty = [...byProduct.values()];
    } else {
      const products = await InventoryProduct.findAll({
        where: {
          isActive: true,
          stock: { [Op.gt]: 0 },
        },
        attributes: productAttrs,
        order: [["name", "ASC"]],
      });
      productQty = products.map((p) => ({ product: p, quantity: toNum(p.stock) }));
    }

    // Última compra de todos (para comparar vs catálogo aunque ya tengan costo)
    const needLast = productQty.map(({ product }) => product.id);
    for (const seed of storeAggSeed.values()) {
      for (const line of seed.lines) {
        needLast.push(line.product.id);
      }
    }

    const lastPurchaseById = await loadLastPurchaseByProductIds(needLast);

    const items = productQty
      .map(({ product, quantity }) => shapeRow(product, quantity, lastPurchaseById))
      .filter(Boolean)
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"));

    let byStore = [];
    if (!storeFilter && storeAggSeed.size) {
      byStore = [...storeAggSeed.values()]
        .map((seed) => {
          let productCount = 0;
          let quantity = 0;
          let valueCost = 0;
          let valueSale = 0;
          let profitOnFinals = 0;
          for (const line of seed.lines) {
            const shaped = shapeRow(line.product, line.quantity, lastPurchaseById);
            if (!shaped) continue;
            productCount += 1;
            quantity = round2(quantity + shaped.quantity);
            valueCost = round2(valueCost + shaped.valueCost);
            valueSale = round2(valueSale + shaped.valueSale);
            profitOnFinals = round2(profitOnFinals + (shaped.valueProfit || 0));
          }
          return {
            id: seed.id,
            storeId: seed.storeId,
            storeName: seed.storeName,
            locationKind: seed.locationKind,
            productCount,
            quantity,
            valueCost,
            valueSale,
            profitOnFinals,
          };
        })
        .sort((a, b) => String(a.storeName).localeCompare(String(b.storeName), "es"));
    }

    return res.json({
      multiStockEnabled: multi,
      storeId: storeFilter?.id ?? null,
      storeName: storeFilter?.name ?? null,
      summary: buildSummary(items),
      byStore,
      items,
    });
  } catch (error) {
    console.error("getInventoryValueSummary:", error);
    notifyFail("inventory.value_failed", "Error al calcular valor de inventario", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: "Error al calcular valor de inventario",
      error: error.message,
    });
  }
};
