import {
  transferStoreStock,
  transferStoreStockBatch,
  listProductStoreStocks,
  mapStoreStockByProduct,
  ensureBodegaStore,
  storeHoldsInventory,
} from "../../services/storeStockService.js";
import { Store } from "../../models/Inventory.js";
import { StoreStock } from "../../models/StoreStock.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

/** POST /inventory/store-stocks/transfer — uno o lista (items). */
export async function transferStock(req, res) {
  try {
    const { fromStoreId, toStoreId, productId, quantity, items } = req.body || {};
    const from = Number(fromStoreId);
    const to = Number(toStoreId);

    if (Array.isArray(items) && items.length) {
      const result = await transferStoreStockBatch({
        fromStoreId: from,
        toStoreId: to,
        items,
      });
      notifyOk(
        "store_stock.transferred_batch",
        `Traslado lista: ${result.count} productos`,
        result,
      );
      return res.json({
        message: `Traslado de lista registrado (${result.count} productos).`,
        ...result,
      });
    }

    const result = await transferStoreStock({
      fromStoreId: from,
      toStoreId: to,
      productId: Number(productId),
      quantity: Number(quantity),
    });
    notifyOk(
      "store_stock.transferred",
      `Traslado producto #${productId}: ${quantity}`,
      result,
    );
    res.json({
      message: "Traslado registrado.",
      ...result,
      storeStocks: await listProductStoreStocks(Number(productId)),
    });
  } catch (error) {
    notifyFail("store_stock.transfer_failed", error.message, {
      error,
      req,
      httpStatus: 400,
    });
    res.status(400).json({ message: error.message });
  }
}

/** GET /inventory/stores/:storeId/stocks */
export async function getStocksByStore(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const store = await Store.findByPk(storeId);
    if (!store) return res.status(404).json({ message: "Local no encontrado." });
    if (!storeHoldsInventory(store.locationKind)) {
      return res.status(400).json({
        message: "Este tipo de local no lleva inventario (p. ej. vitrina ajena).",
      });
    }
    const rows = await StoreStock.findAll({
      where: { storeId },
      order: [["productId", "ASC"]],
      include: [
        {
          association: "product",
          attributes: ["id", "name", "sku", "barcode", "stock", "price", "type", "isActive"],
        },
      ],
    });
    res.json({
      store: {
        id: store.id,
        name: store.name,
        locationKind: store.locationKind,
      },
      stocks: rows.map((r) => ({
        productId: r.productId,
        quantity: Number(r.quantity || 0),
        product: r.product
          ? {
              id: r.product.id,
              name: r.product.name,
              sku: r.product.sku,
              barcode: r.product.barcode,
              stock: Number(r.product.stock || 0),
              price: r.product.price != null ? Number(r.product.price) : null,
              type: r.product.type,
              isActive: r.product.isActive !== false,
            }
          : null,
      })),
      byProductId: await mapStoreStockByProduct(storeId),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/** GET /inventory/bodega — info rápida de la bodega */
export async function getBodegaInfo(req, res) {
  try {
    const bodega = await ensureBodegaStore();
    res.json({
      id: bodega.id,
      name: bodega.name,
      locationKind: bodega.locationKind,
      address: bodega.address,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
