/**
 * =============================================================================
 * CatalogVitrinaController.js
 * =============================================================================
 * MÓDULO: Vitrina / Catálogo público (Panadería)
 * RUTAS: GET /inventory/catalog/section/:section
 *        GET /inventory/catalog/sections?sections=home,ofertas
 * CONSUMIDO POR: CatalogPage.jsx (/backery, /catalogo)
 *
 * Devuelve el catálogo con mapeo COMPLETO (precio, categoría, filtros, etc.)
 * para la vitrina de productos en la sección Panadería.
 * =============================================================================
 */
import { Op } from "sequelize";
import {
  Catalog,
  InventoryProduct,
  InventoryCategory,
  InventoryUnit,
} from "../../models/Inventory.js";
import { slugify } from "../../helpers/functions.js";

const n = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

const formatPriceUSD = (value) => {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return `$${num.toFixed(2)}`;
};

const isActiveByDates = (row, now = new Date()) => {
  const { startsAt, endsAt } = row || {};
  if (startsAt && now < new Date(startsAt)) return false;
  if (endsAt && now > new Date(endsAt)) return false;
  return true;
};

const productIncludeForView = [
  {
    model: InventoryUnit,
    as: "ERP_inventory_unit",
    attributes: ["abbreviation"],
  },
  {
    model: InventoryCategory,
    as: "ERP_inventory_category",
    attributes: ["id", "name", "parentId"],
    include: [
      {
        model: InventoryCategory,
        as: "parent",
        attributes: ["id", "name"],
        required: false,
      },
    ],
  },
];

/**
 * Mapeo COMPLETO para CatalogPage (vitrina /backery).
 * Incluye: precio, categorySlug, wholesaleRules, desc, unitAbbr, minOrderQty, etc.
 * → Usado por: CatalogPage.jsx (ProductCard, PriceDisplay, filtro por categoría)
 */
const mapCatalogEntryToCard = (row) => {
  const product = row.product || {};
  const basePrice = row.priceOverride ?? product.price ?? null;

  const categoryObj = product.ERP_inventory_category || product["ERP_inventory_category"];
  const catName = categoryObj?.name || "";
  const categorySlug = slugify(catName);
  const parentCat = categoryObj?.parent || null;

  const unit = product.ERP_inventory_unit || product["ERP_inventory_unit"];
  const unitAbbr = unit?.abbreviation || unit?.name || null;

  let wholesaleRules = product.wholesaleRules;
  if (typeof wholesaleRules === "string") {
    try {
      wholesaleRules = JSON.parse(wholesaleRules || "[]");
    } catch {
      wholesaleRules = [];
    }
  }
  if (!Array.isArray(wholesaleRules)) wholesaleRules = [];

  let wholesaleOverrideRules = row.wholesaleOverrideRules;
  if (typeof wholesaleOverrideRules === "string") {
    try {
      wholesaleOverrideRules = JSON.parse(wholesaleOverrideRules || "[]");
    } catch {
      wholesaleOverrideRules = [];
    }
  }
  if (!Array.isArray(wholesaleOverrideRules)) wholesaleOverrideRules = [];

  const effectivePrice = n(basePrice, 0);
  return {
    id: row.id,
    badge: row.badge,
    title: row.title || product.name,
    section: row.section,
    displayPrice: formatPriceUSD(basePrice),
    minOrderQty: typeof row.minOrderQty === "number" && row.minOrderQty > 0 ? row.minOrderQty : null,
    imageUrl: row.imageUrl || product.primaryImageUrl,
    wholesaleOverrideRules: wholesaleOverrideRules.length > 0 ? wholesaleOverrideRules : undefined,
    product: {
      id: product.id,
      name: product.name,
      desc: product.desc,
      price: effectivePrice,
      primaryImageUrl: product.primaryImageUrl,
      categorySlug: categorySlug || undefined,
      categoryId: product.categoryId ?? categoryObj?.id ?? null,
      categoryParentId: categoryObj?.parentId ?? parentCat?.id ?? null,
      categoryName: catName || undefined,
      categoryParentName: parentCat?.name || undefined,
      ERP_inventory_category: categoryObj
        ? {
            id: categoryObj.id,
            name: categoryObj.name,
            parentId: categoryObj.parentId ?? null,
            parent: parentCat
              ? { id: parentCat.id, name: parentCat.name }
              : null,
          }
        : null,
      unitId: product.unitId,
      unitAbbr: unitAbbr || undefined,
      standardWeightGrams: n(product.standardWeightGrams, 0),
      wholesaleRules,
      tags: Array.isArray(product.tags) ? product.tags : [],
      isUniqueToday: Boolean(product.isUniqueToday),
    },
  };
};

/**
 * GET /inventory/catalog/section/:section
 * → CatalogPage.jsx (fetchSection) - Catálogo por sección (home, ofertas, etc.)
 */
export const getCatalogBySection = async (req, res) => {
  try {
    const { section } = req.params;
    const { storeId = null, onlyActive = "true" } = req.query;
    const now = new Date();

    const where = { section };
    if (storeId) where.storeId = Number(storeId);
    if (String(onlyActive) === "true") where.isActive = true;

    const rows = await Catalog.findAll({
      where,
      include: [
        {
          model: InventoryProduct,
          as: "product",
          required: true,
          attributes: [
            "id",
            "name",
            "desc",
            "price",
            "primaryImageUrl",
            "type",
            "categoryId",
            "unitId",
            "standardWeightGrams",
            "wholesaleRules",
          ],
          include: productIncludeForView,
        },
      ],
      order: [
        ["position", "ASC"],
        ["createdAt", "DESC"],
      ],
    });

    const valid = rows.filter((r) => isActiveByDates(r, now));
    const data = valid.map(mapCatalogEntryToCard);
    res.json(data);
  } catch (err) {
    console.error("getCatalogBySection error:", err);
    res.status(500).json({ message: "Error al obtener catálogo por sección" });
  }
};

/**
 * GET /inventory/catalog/sections?sections=home,ofertas
 * → Catálogo por múltiples secciones (p. ej. HomeLogout, Carousel3D)
 */
export const getCatalogBySections = async (req, res) => {
  try {
    const { sections = "", storeId = null, onlyActive = "true" } = req.query;
    const list = sections
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!list.length) {
      return res.status(400).json({ message: "Parámetro 'sections' requerido" });
    }

    const now = new Date();
    const where = { section: { [Op.in]: list } };
    if (storeId) where.storeId = Number(storeId);
    if (String(onlyActive) === "true") where.isActive = true;

    const rows = await Catalog.findAll({
      where,
      include: [
        {
          model: InventoryProduct,
          as: "product",
          required: true,
          attributes: [
            "id",
            "name",
            "price",
            "desc",
            "primaryImageUrl",
            "type",
            "categoryId",
            "unitId",
            "standardWeightGrams",
            "wholesaleRules",
          ],
          include: productIncludeForView,
        },
      ],
      order: [
        ["section", "ASC"],
        ["position", "ASC"],
        ["createdAt", "DESC"],
      ],
    });

    const grouped = {};
    list.forEach((s) => (grouped[s] = []));
    rows.forEach((r) => {
      if (!isActiveByDates(r, now)) return;
      const entry = mapCatalogEntryToCard(r);
      (grouped[r.section] ||= []).push(entry);
    });

    res.json(grouped);
  } catch (err) {
    console.error("getCatalogBySections error:", err);
    res.status(500).json({ message: "Error al obtener múltiples secciones de catálogo" });
  }
};
