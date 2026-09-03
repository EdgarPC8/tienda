// controllers/ProductController.js
import { Op, literal } from "sequelize";
import fs from "fs";
import { join } from "path";
const { __dirname } = fileDirName(import.meta);

import {
  InventoryProduct,
  InventoryCategory,
  InventoryUnit,
  PricingTierGroup,
  // Si también usas HomeProduct o ProductPlacement y guardan archivos, puedes chequearlos acá
  // HomeProduct,
  // ProductPlacement,
} from "../../models/Inventory.js";
import fileDirName from "../../libs/file-dirname.js";
import { normalizePackageTiersStrict } from "../../utils/productPricingUtils.js";
import { toStorageMoney } from "../../utils/moneyPrecision.js";
import { parsePagination, sendPaginated } from "../../utils/pagination.js";
import {
  getDefaultStockStoreId,
  setStoreStockAbsolute,
  setProductCatalogStock,
  listProductStoreStocks,
} from "../../services/storeStockService.js";
import { getAppSettingsSync } from "../../services/appSettingsService.js";
import { syncProductIngredientFlags, isGenericStorageAbbr } from "../../utils/productIngredientFlags.js";

const PRODUCT_TYPE_ORDER = literal(
  `CASE \`${InventoryProduct.tableName}\`.\`type\` WHEN 'final' THEN 1 WHEN 'intermediate' THEN 2 ELSE 3 END`,
);

const PRODUCT_CATEGORY_INCLUDE = {
  model: InventoryCategory,
  attributes: [
    "id",
    "name",
    "parentId",
    "packageTiers",
    "mixMatchLabel",
    "mixMatchProductIds",
  ],
  include: [
    {
      model: InventoryCategory,
      as: "parent",
      attributes: ["id", "name"],
      required: false,
    },
  ],
};

function normalizeProductBarcodeField(raw) {
  const code = String(raw ?? "").replace(/\D/g, "").trim();
  return code || null;
}

function applyBarcodeFields(payload) {
  if ("barcode" in payload) {
    const normalized = normalizeProductBarcodeField(payload.barcode);
    payload.barcode = normalized;
  }
  if ("sku" in payload) {
    const sku = String(payload.sku ?? "").trim();
    payload.sku = sku || null;
  }
}

function productUniqueErrorMessage(error) {
  const field = error?.errors?.[0]?.path;
  if (field === "barcode") return "Ese código de barras ya está registrado en otro producto.";
  if (field === "sku") return "Ese SKU ya está registrado en otro producto.";
  return null;
}

const PRODUCT_MONEY_FIELDS = ["price", "supplierPrice", "distributorPrice"];
const PRODUCT_NUMERIC_FIELDS = [
  "standardWeightGrams",
  "netWeight",
  "stock",
  "minStock",
  "price",
  "supplierPrice",
  "distributorPrice",
  "taxRate",
];

function normalizeProductNumericFields(payload, { fillMissing = false } = {}) {
  for (const key of PRODUCT_NUMERIC_FIELDS) {
    if (!(key in payload)) {
      if (fillMissing) payload[key] = 0;
      continue;
    }
    const raw = payload[key];
    if (raw === null || raw === "") {
      payload[key] = 0;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      payload[key] = 0;
      continue;
    }
    payload[key] = PRODUCT_MONEY_FIELDS.includes(key) ? toStorageMoney(n) : n;
  }
}

function normalizeProductRelationFields(payload) {
  if ("categoryId" in payload) {
    if (payload.categoryId === "" || payload.categoryId == null) {
      delete payload.categoryId;
    } else {
      const n = Number(payload.categoryId);
      if (Number.isFinite(n)) payload.categoryId = n;
      else delete payload.categoryId;
    }
  }

  if ("unitId" in payload) {
    if (payload.unitId === "" || payload.unitId == null) {
      delete payload.unitId;
    } else {
      const n = Number(payload.unitId);
      if (Number.isFinite(n)) payload.unitId = n;
      else delete payload.unitId;
    }
  }
}

/** Insumo genérico: unidad base de peso (g) o volumen (ml/L). */
async function ensureGenericStoredInGrams(payload, existing = null) {
  const type = payload.type != null ? String(payload.type) : existing?.type;
  if (type !== "raw") return;
  const unitId = "unitId" in payload ? payload.unitId : existing?.unitId;
  if (unitId) {
    const u = await InventoryUnit.findByPk(unitId);
    if (u && isGenericStorageAbbr(u.abbreviation)) return;
  }
  const gram = await InventoryUnit.findOne({
    where: { abbreviation: { [Op.in]: ["gr", "g"] } },
    order: [["id", "ASC"]],
  });
  if (gram) payload.unitId = gram.id;
}


// controllers/ProductController.js (solo createProduct)
// ✅ Copia y pega tal cual




// === Config carpeta imágenes ===
// ⚠️ Este controller está en src/controllers/... => para llegar a src/img es ../../img
const IMG_BASE_DIR = join(__dirname, "../../img");
const imagePath = (relPath) => join(IMG_BASE_DIR, relPath);

const safeUnlink = (fullPath) => {
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    console.warn("No se pudo borrar archivo:", fullPath, e?.message);
  }
};
import path from "path";
import fsp from "fs/promises";
import { logger } from "../../log/LogActivity.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const normalize = (p = "") =>
  String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");

export const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await InventoryProduct.findByPk(id);
    if (!row) {
      notifyFail("product.update_failed", `Producto #${id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const oldRel = normalize(row.primaryImageUrl || "");
    const incomingRel = normalize(req.body.primaryImageUrl || "");
    const updates = { ...req.body };
    applyBarcodeFields(updates);
    normalizeProductNumericFields(updates);
    normalizeProductRelationFields(updates);
    syncProductIngredientFlags(updates, row);
    await ensureGenericStoredInGrams(updates, row);

    let moved = false;

    // ===============================
    // 1️⃣ CASO: se sube imagen nueva
    // ===============================
    if (req.file?.filename) {
      const newRel =
        req.uploadInfo?.relPath ||
        normalize(path.posix.join(req.body.subfolder || "", req.file.filename));

      updates.primaryImageUrl = newRel;

      // borrar la anterior si no está en uso
      if (oldRel && oldRel !== newRel) {
        const used = await isImageInUseElsewhere(oldRel, row.id);
        if (!used) safeUnlink(imagePath(oldRel));
      }
    }

    // =================================================
    // 2️⃣ CASO CLAVE: NO hay archivo, pero cambió la ruta
    // =================================================
    else if (incomingRel && incomingRel !== oldRel) {
      const used = await isImageInUseElsewhere(oldRel, row.id);
      if (used) {
        notifyFail("product.update_failed", "Imagen en uso por otros productos", {
          req,
          httpStatus: 400,
          extra: { productId: id },
        });
        return res.status(400).json({
          message:
            "La imagen está siendo usada por otros productos. No se puede mover.",
        });
      }

      const fromAbs = imagePath(oldRel);
      const toAbs = imagePath(incomingRel);

      if (!fs.existsSync(fromAbs)) {
        notifyFail("product.update_failed", "Imagen actual no existe en servidor", {
          req,
          httpStatus: 404,
          extra: { productId: id },
        });
        return res.status(404).json({
          message: "La imagen actual no existe físicamente en el servidor",
        });
      }

      // crea carpetas destino
      await fsp.mkdir(path.dirname(toAbs), { recursive: true });

      // mueve archivo
      await fsp.rename(fromAbs, toAbs);

      updates.primaryImageUrl = incomingRel;
      moved = true;
    }

    if ("packageTiers" in updates) {
      updates.packageTiers = normalizePackageTiersStrict(updates.packageTiers);
    }

    // Stock de ficha: sin multistock hay que escribir también ERP_store_stocks
    // (Caja lee el local del turno, no solo InventoryProduct.stock).
    const multiStockEnabled = Boolean(getAppSettingsSync()?.multiStockEnabled);
    let catalogStock = null;
    if ("stock" in updates) {
      if (multiStockEnabled) {
        // En multistock el stock por local se gestiona en movimientos/locales.
        delete updates.stock;
      } else if (updates.stock !== undefined && updates.stock !== null && updates.stock !== "") {
        const n = Number(updates.stock);
        if (!Number.isFinite(n) || n < 0) {
          notifyFail("product.update_failed", "Stock inválido", { req, httpStatus: 400 });
          return res.status(400).json({ message: "Stock inválido" });
        }
        catalogStock = n;
        delete updates.stock;
      } else {
        delete updates.stock;
      }
    }

    // ===============================
    // 3️⃣ Actualiza BD
    // ===============================
    await row.update(updates);
    if (catalogStock != null) {
      await setProductCatalogStock(row.id, catalogStock, { allowNegative: false });
      await row.reload();
    }

    notifyOk("product.updated", `Producto #${id}`, { product: row });

    return res.json({
      message: moved
        ? "Producto actualizado y la imagen fue movida"
        : "Producto actualizado",
      product: row,
    });
  } catch (error) {
    console.error(error);
    const uniqueMsg = productUniqueErrorMessage(error);
    if (uniqueMsg) {
      notifyFail("product.update_failed", uniqueMsg, { error, req, httpStatus: 409 });
      return res.status(409).json({ message: uniqueMsg });
    }
    if (error?.message && /(wholesaleRules|packageTiers|stock)/i.test(error.message)) {
      notifyFail("product.update_failed", error.message, { error, req, httpStatus: 400 });
      return res.status(400).json({ message: error.message });
    }
    notifyFail("product.update_failed", "Error al actualizar producto", {
      error,
      req,
      httpStatus: 500,
    });
    return res
      .status(500)
      .json({ message: "Error al actualizar producto", error });
  }
};


export const createProduct = async (req, res) => {
  let tempRelPath = null; // ✅ para rollback si falla
  try {
    const payload = { ...req.body };
    applyBarcodeFields(payload);
    normalizeProductNumericFields(payload, { fillMissing: true });
    normalizeProductRelationFields(payload);
    syncProductIngredientFlags(payload);
    await ensureGenericStoredInGrams(payload);

    // --- booleanos ---
    if ("isActive" in payload) {
      payload.isActive = String(payload.isActive) === "true";
    }

    // ✅ IMAGEN: guardar la ruta relativa EXACTA que calculó el middleware
    // - "" => "archivo.png"
    // - "EdDeli/products" => "EdDeli/products/archivo.png"
    if (req.file?.filename) {
      tempRelPath = req.uploadInfo?.relPath || req.file.filename;
      payload.primaryImageUrl = tempRelPath;
    }

    // ---------- WHOLESALE RULES (estricto JSON) ----------
    const normalizeWholesaleRulesStrict = (input) => {
      if (input == null || input === "") return null;

      let val = input;
      if (typeof val === "string") {
        try {
          val = JSON.parse(val);
        } catch {
          throw new Error("wholesaleRules debe ser JSON válido (string no parseó).");
        }
      }

      let tiers = Array.isArray(val)
        ? val
        : val && Array.isArray(val.tiers)
        ? val.tiers
        : null;

      if (!tiers) throw new Error("wholesaleRules debe ser un array o un objeto { tiers: [...] }.");

      tiers = tiers
        .map((t) => {
          if (!t || typeof t !== "object") return null;
          const out = {};
          if (t.minQty != null && Number.isFinite(Number(t.minQty))) out.minQty = Number(t.minQty);
          if (t.discountPercent != null && Number.isFinite(Number(t.discountPercent)))
            out.discountPercent = Number(t.discountPercent);
          if (t.pricePerUnit != null && Number.isFinite(Number(t.pricePerUnit)))
            out.pricePerUnit = Number(t.pricePerUnit);
          return Object.keys(out).length ? out : null;
        })
        .filter(Boolean);

      if (!tiers.length) return null;
      return tiers;
    };

    if ("wholesaleRules" in payload) {
      payload.wholesaleRules = normalizeWholesaleRulesStrict(payload.wholesaleRules);
    } else if ("wholesaleRulesText" in payload) {
      payload.wholesaleRules = normalizeWholesaleRulesStrict(payload.wholesaleRulesText);
      delete payload.wholesaleRulesText;
    }

    if ("packageTiers" in payload) {
      payload.packageTiers = normalizePackageTiersStrict(payload.packageTiers);
    }

    // ✅ NO guardar subfolder en la tabla (si te llega por form)
    delete payload.subfolder;

    // --- crear producto ---
    const product = await InventoryProduct.create(payload);
    // Alta: el stock de ficha debe quedar también en el local (Caja / bodega).
    const initialStock = Number(product.stock ?? 0);
    if (Number.isFinite(initialStock) && initialStock >= 0) {
      await setProductCatalogStock(product.id, initialStock, { allowNegative: false });
      await product.reload();
    }
    notifyOk("product.created", `Producto #${product.id}`, { product });
    return res.status(201).json(product);
  } catch (error) {
    // ✅ rollback: si subió imagen y falló el create, borra el archivo subido
    if (tempRelPath) safeUnlink(imagePath(tempRelPath));

    const uniqueMsg = productUniqueErrorMessage(error);
    if (uniqueMsg) {
      notifyFail("product.create_failed", uniqueMsg, { error, req, httpStatus: 409 });
      return res.status(409).json({ message: uniqueMsg });
    }
    if (error?.message && /(wholesaleRules|packageTiers|stock)/i.test(error.message)) {
      notifyFail("product.create_failed", error.message, { error, req, httpStatus: 400 });
      return res.status(400).json({ message: error.message });
    }

    notifyFail("product.create_failed", "Error al crear producto", { error, req, httpStatus: 500 });
    return res.status(500).json({ message: "Error al crear producto", error });
  }
};





// ¿La imagen está en uso por otros registros?
const isImageInUseElsewhere = async (filename, currentProductId = null) => {
  if (!filename) return false;

  const countProducts = await InventoryProduct.count({
    where: currentProductId
      ? { primaryImageUrl: filename, id: { [Op.ne]: currentProductId } }
      : { primaryImageUrl: filename },
  });

  // Si también la usan otras tablas, suma aquí:
  // const countHome = await HomeProduct.count({ where: { imageUrl: filename } });
  // const countPlacement = await ProductPlacement.count({ where: { imageUrl: filename } });

  return countProducts > 0; // || countHome > 0 || countPlacement > 0;
};





/** Ajuste directo de stock/minStock desde dashboard (solo Programador, sin movimiento). */
export const patchProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const { stock, minStock, storeId } = req.body ?? {};

    const row = await InventoryProduct.findByPk(id);
    if (!row) {
      notifyFail("product.stock_adjust_failed", `Producto #${id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    const prevStock = Number(row.stock ?? 0);
    const prevMinStock = Number(row.minStock ?? 0);
    const updates = {};

    if (minStock !== undefined && minStock !== null && minStock !== "") {
      const n = Number(minStock);
      if (!Number.isFinite(n) || n < 0) {
        notifyFail("product.stock_adjust_failed", "Stock mínimo inválido", { req, httpStatus: 400 });
        return res.status(400).json({ message: "Stock mínimo inválido" });
      }
      updates.minStock = n;
    }

    let nextStock = prevStock;
    if (stock !== undefined && stock !== null && stock !== "") {
      const n = Number(stock);
      if (!Number.isFinite(n) || n < 0) {
        notifyFail("product.stock_adjust_failed", "Stock inválido", { req, httpStatus: 400 });
        return res.status(400).json({ message: "Stock inválido" });
      }
      const targetStoreId =
        storeId != null && storeId !== "" ? Number(storeId) : await getDefaultStockStoreId();
      const result = await setStoreStockAbsolute(targetStoreId, row.id, n, {
        allowNegative: false,
      });
      nextStock = result.productStock;
      await row.reload();
    }

    if (!Object.keys(updates).length && (stock === undefined || stock === null || stock === "")) {
      notifyFail("product.stock_adjust_failed", "Indica stock y/o minStock", { req, httpStatus: 400 });
      return res.status(400).json({ message: "Indica stock y/o minStock" });
    }

    if (Object.keys(updates).length) {
      await row.update(updates);
      await row.reload();
    }

    nextStock = Number(row.stock ?? nextStock);
    const nextMinStock = Number(row.minStock ?? 0);

    logger({
      httpMethod: "PATCH",
      endPoint: `/inventory/products/${id}/stock`,
      action: "Ajuste directo de stock (dashboard / local)",
      description: `Producto #${id} "${row.name}": stock ${prevStock} → ${nextStock}, minStock ${prevMinStock} → ${nextMinStock}.${
        storeId != null && storeId !== "" ? ` Local #${storeId}.` : " Stock por local (bodega/default)."
      } Sin movimiento de inventario.`,
      system: req.headers["user-agent"] || "dashboard",
    });

    notifyOk("product.stock_adjusted", `Stock producto #${id}`, {
      productId: row.id,
      stock: nextStock,
      minStock: nextMinStock,
    });

    return res.json({
      message: "Stock actualizado",
      product: {
        id: row.id,
        name: row.name,
        price: Number(row.price ?? 0),
        stock: nextStock,
        minStock: nextMinStock,
        type: row.type,
        isActive: row.isActive,
      },
      storeStocks: await listProductStoreStocks(row.id),
    });
  } catch (error) {
    console.error("patchProductStock:", error);
    notifyFail("product.stock_adjust_failed", "Error al actualizar stock", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error al actualizar stock", error: error.message });
  }
};

/** GET /inventory/products/:id/store-stocks — desglose por local */
export const getProductStoreStocks = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await InventoryProduct.findByPk(id, { attributes: ["id", "name", "stock"] });
    if (!row) return res.status(404).json({ message: "Producto no encontrado" });
    const storeStocks = await listProductStoreStocks(row.id);
    res.json({
      productId: row.id,
      name: row.name,
      stockTotal: Number(row.stock ?? 0),
      storeStocks,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener productos con categoría y unidad (paginado por defecto; ?all=true para lista completa)
export const getAllProducts = async (req, res) => {
  try {
    const pagination = parsePagination(req);
    const include = [
      PRODUCT_CATEGORY_INCLUDE,
      { model: InventoryUnit, attributes: ["id", "name", "abbreviation"] },
    ];
    const order = [
      [PRODUCT_TYPE_ORDER, "ASC"],
      ["name", "ASC"],
    ];

    const loadTierGroups = async () =>
      PricingTierGroup.findAll({
        where: { isActive: true },
        order: [
          ["position", "ASC"],
          ["name", "ASC"],
        ],
      });

    if (pagination.all) {
      const products = await InventoryProduct.findAll({ include, order });

      if (req.query.withTierGroups === "true") {
        const tierGroups = await loadTierGroups();
        return res.json({ products, tierGroups });
      }

      return res.json(products);
    }

    const { count, rows } = await InventoryProduct.findAndCountAll({
      include,
      order,
      offset: pagination.offset,
      limit: pagination.limit,
      distinct: true,
    });

    if (req.query.withTierGroups === "true") {
      const tierGroups = await loadTierGroups();
      return res.json({
        products: rows,
        tierGroups,
        total: count,
        page: pagination.page,
        pageSize: pagination.pageSize,
        totalPages: Math.max(1, Math.ceil(count / pagination.pageSize)),
      });
    }

    return sendPaginated(res, {
      rows,
      total: count,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  } catch (error) {
    res.status(500).json({ message: "Error al obtener productos", error: error.message });
  }
};


// Obtener un producto por id
export const getProductById = async (req, res) => {
  try {
    const row = await InventoryProduct.findByPk(req.params.id, {
      include: [
        PRODUCT_CATEGORY_INCLUDE,
        { model: InventoryUnit, attributes: ["id", "name", "abbreviation"] },
      ],
    });
    if (!row) return res.status(404).json({ message: "Producto no encontrado" });
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener producto", error });
  }
};





// Eliminar producto (borra imagen si no está en uso por otros)
export const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await InventoryProduct.findByPk(id);
    if (!row) {
      notifyFail("product.delete_failed", `Producto #${id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Producto no encontrado" });
    }

    if (row.primaryImageUrl) {
      const used = await isImageInUseElsewhere(row.primaryImageUrl, row.id);
      if (!used) safeUnlink(imagePath(row.primaryImageUrl));
    }

    await row.destroy();
    notifyOk("product.deleted", `Producto #${id}`, { productId: id });
    res.json({ message: "Producto eliminado" });
  } catch (error) {
    notifyFail("product.delete_failed", `Error al eliminar producto #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar producto", error });
  }
};
