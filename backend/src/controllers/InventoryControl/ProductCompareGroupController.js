/**
 * Grupos comparativos de productos para la vitrina (ej. pasteles por sabor/tamaño/humedad).
 */
import { Op } from "sequelize";
import {
  ProductCompareGroup,
  ProductCompareGroupItem,
  InventoryProduct,
  InventoryCategory,
  InventoryUnit,
} from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const n = (x, d = 0) => (Number.isFinite(Number(x)) ? Number(x) : d);

const formatPriceUSD = (value) => {
  if (value === undefined || value === null) return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return `$${num.toFixed(2)}`;
};

const productInclude = [
  {
    model: InventoryUnit,
    as: "ERP_inventory_unit",
    attributes: ["abbreviation", "name"],
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

const parseJsonArray = (val) => {
  if (val == null) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try {
      const parsed = JSON.parse(val);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const cellKey = (rowKey, columnKey) => `${rowKey}||${columnKey}`;

const sortByNum = (a, b) => n(a, 0) - n(b, 0);

const mapProductSnapshot = (product) => {
  if (!product) return null;
  const unit = product.ERP_inventory_unit || product["ERP_inventory_unit"];
  const category = product.ERP_inventory_category || product["ERP_inventory_category"];
  const parent = category?.parent || null;
  return {
    id: product.id,
    name: product.name,
    desc: product.desc,
    price: n(product.price, 0),
    displayPrice: formatPriceUSD(product.price),
    primaryImageUrl: product.primaryImageUrl,
    unitAbbr: unit?.abbreviation || unit?.name || null,
    categoryId: product.categoryId ?? category?.id ?? null,
    categoryParentId: category?.parentId ?? parent?.id ?? null,
    categoryName: category?.name || null,
    categoryParentName: parent?.name || null,
    ERP_inventory_category: category
      ? {
          id: category.id,
          name: category.name,
          parentId: category.parentId ?? null,
          parent: parent ? { id: parent.id, name: parent.name } : null,
        }
      : null,
  };
};

export function buildCompareGroupMatrix(group, items = []) {
  const variantMap = new Map();

  for (const item of items) {
    const variantKey = item.variantKey || "default";
    if (!variantMap.has(variantKey)) {
      variantMap.set(variantKey, {
        key: variantKey,
        sort: item.variantSort ?? 0,
        rows: new Map(),
        columns: new Map(),
        cells: {},
      });
    }
    const block = variantMap.get(variantKey);
    block.sort = Math.min(block.sort, item.variantSort ?? 0);

    const rowKey = item.rowKey || "—";
    const columnKey = item.columnKey || "—";

    if (!block.rows.has(rowKey)) {
      block.rows.set(rowKey, { key: rowKey, sort: item.rowSort ?? 0, meta: item.rowMeta || null });
    } else {
      const row = block.rows.get(rowKey);
      row.sort = Math.min(row.sort, item.rowSort ?? 0);
      if (!row.meta && item.rowMeta) row.meta = item.rowMeta;
    }

    if (!block.columns.has(columnKey)) {
      block.columns.set(columnKey, { key: columnKey, sort: item.columnSort ?? 0 });
    } else {
      const col = block.columns.get(columnKey);
      col.sort = Math.min(col.sort, item.columnSort ?? 0);
    }

    block.cells[cellKey(rowKey, columnKey)] = {
      itemId: item.id,
      product: mapProductSnapshot(item.product),
    };
  }

  const variants = [...variantMap.values()]
    .sort((a, b) => sortByNum(a.sort, b.sort))
    .map((block) => ({
      key: block.key,
      sort: block.sort,
      rows: [...block.rows.values()].sort((a, b) => sortByNum(a.sort, b.sort)),
      columns: [...block.columns.values()].sort((a, b) => sortByNum(a.sort, b.sort)),
      cells: block.cells,
    }));

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    subtitle: group.subtitle,
    imageUrl: group.imageUrl,
    section: group.section,
    fillings: parseJsonArray(group.fillings),
    rowLabel: group.rowLabel || "Tamaño",
    columnLabel: group.columnLabel || "Tipo",
    variantLabel: group.variantLabel || "Sabor",
    position: group.position ?? 0,
    isActive: Boolean(group.isActive),
    hideMemberProducts: Boolean(group.hideMemberProducts),
    variants,
    productIds: items.map((i) => i.productId).filter(Boolean),
  };
}

async function loadGroupWithItems(groupId) {
  return ProductCompareGroup.findByPk(groupId, {
    include: [
      {
        model: ProductCompareGroupItem,
        as: "items",
        include: [
          {
            model: InventoryProduct,
            as: "product",
            attributes: ["id", "name", "desc", "price", "primaryImageUrl", "categoryId", "unitId"],
            include: productInclude,
          },
        ],
      },
    ],
    order: [[{ model: ProductCompareGroupItem, as: "items" }, "rowSort", "ASC"]],
  });
}

/**
 * GET /inventory/compare-groups/public?section=home
 */
export const getPublicCompareGroups = async (req, res) => {
  try {
    const { section = "home", onlyActive = "true" } = req.query;
    const where = { section };
    if (String(onlyActive) === "true") where.isActive = true;

    const groups = await ProductCompareGroup.findAll({
      where,
      include: [
        {
          model: ProductCompareGroupItem,
          as: "items",
          required: false,
          include: [
            {
              model: InventoryProduct,
              as: "product",
              required: true,
              attributes: ["id", "name", "desc", "price", "primaryImageUrl", "categoryId", "unitId"],
              include: productInclude,
            },
          ],
        },
      ],
      order: [
        ["position", "ASC"],
        ["createdAt", "ASC"],
        [{ model: ProductCompareGroupItem, as: "items" }, "variantSort", "ASC"],
        [{ model: ProductCompareGroupItem, as: "items" }, "rowSort", "ASC"],
        [{ model: ProductCompareGroupItem, as: "items" }, "columnSort", "ASC"],
      ],
    });

    res.json(groups.map((g) => buildCompareGroupMatrix(g, g.items || [])));
  } catch (err) {
    console.error("getPublicCompareGroups error:", err);
    res.status(500).json({ message: "Error al obtener grupos comparativos" });
  }
};

/**
 * GET /inventory/compare-groups
 */
export const getCompareGroups = async (req, res) => {
  try {
    const { section, isActive, q } = req.query;
    const where = {};
    if (section) where.section = section;
    if (isActive === "true") where.isActive = true;
    if (isActive === "false") where.isActive = false;
    if (q?.trim()) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q.trim()}%` } },
        { description: { [Op.like]: `%${q.trim()}%` } },
      ];
    }

    const groups = await ProductCompareGroup.findAll({
      where,
      include: [
        {
          model: ProductCompareGroupItem,
          as: "items",
          include: [{ model: InventoryProduct, as: "product", attributes: ["id", "name", "price"] }],
        },
      ],
      order: [
        ["position", "ASC"],
        ["id", "ASC"],
      ],
    });

    res.json(groups.map((g) => buildCompareGroupMatrix(g, g.items || [])));
  } catch (err) {
    console.error("getCompareGroups error:", err);
    res.status(500).json({ message: "Error al listar grupos comparativos" });
  }
};

/**
 * GET /inventory/compare-groups/:id
 */
export const getCompareGroupById = async (req, res) => {
  try {
    const group = await loadGroupWithItems(req.params.id);
    if (!group) return res.status(404).json({ message: "Grupo no encontrado" });
    res.json(buildCompareGroupMatrix(group, group.items || []));
  } catch (err) {
    console.error("getCompareGroupById error:", err);
    res.status(500).json({ message: "Error al obtener grupo comparativo" });
  }
};

/**
 * POST /inventory/compare-groups
 */
export const createCompareGroup = async (req, res) => {
  try {
    const {
      name,
      description,
      subtitle,
      imageUrl,
      section = "home",
      fillings = [],
      rowLabel,
      columnLabel,
      variantLabel,
      position = 0,
      isActive = true,
      hideMemberProducts = true,
      items = [],
    } = req.body || {};

    if (!name?.trim()) {
      notifyFail("compare_group.create_failed", "El nombre del grupo es obligatorio", { req, httpStatus: 400 });
      return res.status(400).json({ message: "El nombre del grupo es obligatorio" });
    }

    const group = await ProductCompareGroup.create({
      name: name.trim(),
      description: description || null,
      subtitle: subtitle || null,
      imageUrl: imageUrl || null,
      section,
      fillings: parseJsonArray(fillings),
      rowLabel: rowLabel || "Tamaño",
      columnLabel: columnLabel || "Tipo",
      variantLabel: variantLabel || "Sabor",
      position: n(position, 0),
      isActive: Boolean(isActive),
      hideMemberProducts: hideMemberProducts !== false,
    });

    if (Array.isArray(items) && items.length) {
      await ProductCompareGroupItem.bulkCreate(
        items.map((it) => ({
          groupId: group.id,
          productId: it.productId,
          rowKey: it.rowKey || "",
          rowSort: n(it.rowSort, 0),
          rowMeta: it.rowMeta || null,
          columnKey: it.columnKey || "",
          columnSort: n(it.columnSort, 0),
          variantKey: it.variantKey || "default",
          variantSort: n(it.variantSort, 0),
        }))
      );
    }

    const full = await loadGroupWithItems(group.id);
    notifyOk("compare_group.created", `Grupo comparación #${group.id}`, { groupId: group.id });
    res.status(201).json(buildCompareGroupMatrix(full, full.items || []));
  } catch (err) {
    console.error("createCompareGroup error:", err);
    notifyFail("compare_group.create_failed", "Error al crear grupo comparativo", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al crear grupo comparativo" });
  }
};

/**
 * PUT /inventory/compare-groups/:id
 */
export const updateCompareGroup = async (req, res) => {
  try {
    const group = await ProductCompareGroup.findByPk(req.params.id);
    if (!group) {
      notifyFail("compare_group.update_failed", "Grupo no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Grupo no encontrado" });
    }

    const {
      name,
      description,
      subtitle,
      imageUrl,
      section,
      fillings,
      rowLabel,
      columnLabel,
      variantLabel,
      position,
      isActive,
      hideMemberProducts,
      items,
    } = req.body || {};

    await group.update({
      ...(name !== undefined ? { name: String(name).trim() } : {}),
      ...(description !== undefined ? { description: description || null } : {}),
      ...(subtitle !== undefined ? { subtitle: subtitle || null } : {}),
      ...(imageUrl !== undefined ? { imageUrl: imageUrl || null } : {}),
      ...(section !== undefined ? { section } : {}),
      ...(fillings !== undefined ? { fillings: parseJsonArray(fillings) } : {}),
      ...(rowLabel !== undefined ? { rowLabel: rowLabel || "Tamaño" } : {}),
      ...(columnLabel !== undefined ? { columnLabel: columnLabel || "Tipo" } : {}),
      ...(variantLabel !== undefined ? { variantLabel: variantLabel || "Sabor" } : {}),
      ...(position !== undefined ? { position: n(position, 0) } : {}),
      ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
      ...(hideMemberProducts !== undefined
        ? { hideMemberProducts: Boolean(hideMemberProducts) }
        : {}),
    });

    if (Array.isArray(items)) {
      await ProductCompareGroupItem.destroy({ where: { groupId: group.id } });
      if (items.length) {
        await ProductCompareGroupItem.bulkCreate(
          items.map((it) => ({
            groupId: group.id,
            productId: it.productId,
            rowKey: it.rowKey || "",
            rowSort: n(it.rowSort, 0),
            rowMeta: it.rowMeta || null,
            columnKey: it.columnKey || "",
            columnSort: n(it.columnSort, 0),
            variantKey: it.variantKey || "default",
            variantSort: n(it.variantSort, 0),
          }))
        );
      }
    }

    const full = await loadGroupWithItems(group.id);
    notifyOk("compare_group.updated", `Grupo comparación #${group.id}`, { groupId: group.id });
    res.json(buildCompareGroupMatrix(full, full.items || []));
  } catch (err) {
    console.error("updateCompareGroup error:", err);
    notifyFail("compare_group.update_failed", "Error al actualizar grupo comparativo", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar grupo comparativo" });
  }
};

/**
 * DELETE /inventory/compare-groups/:id
 */
export const deleteCompareGroup = async (req, res) => {
  try {
    const group = await ProductCompareGroup.findByPk(req.params.id);
    if (!group) {
      notifyFail("compare_group.delete_failed", "Grupo no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Grupo no encontrado" });
    }
    await group.destroy();
    notifyOk("compare_group.deleted", `Grupo comparación #${req.params.id}`, {
      groupId: req.params.id,
    });
    res.json({ message: "Grupo eliminado" });
  } catch (err) {
    console.error("deleteCompareGroup error:", err);
    notifyFail("compare_group.delete_failed", "Error al eliminar grupo comparativo", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar grupo comparativo" });
  }
};

const PASTELES_SEED = [
  { productName: "Pastel MiniTorta Vainilla", variantKey: "Vainilla", rowKey: "Mini torta", rowMeta: "4 porciones", rowSort: 1, columnKey: "Seco", columnSort: 1, variantSort: 1 },
  { productName: "Pastel Pequeño Vainilla", variantKey: "Vainilla", rowKey: "Pequeño", rowMeta: "6-8 porciones", rowSort: 2, columnKey: "Seco", columnSort: 1, variantSort: 1 },
  { productName: "Pastel Mediano Vainilla", variantKey: "Vainilla", rowKey: "Mediano", rowMeta: "13-15 porciones", rowSort: 3, columnKey: "Seco", columnSort: 1, variantSort: 1 },
  { productName: "Pastel Grande Vainilla", variantKey: "Vainilla", rowKey: "Grande", rowMeta: "23-25 porciones", rowSort: 4, columnKey: "Seco", columnSort: 1, variantSort: 1 },
  { productName: "Pastel Mini Torta de Chocolate", variantKey: "Chocolate", rowKey: "Mini torta", rowMeta: "4 porciones", rowSort: 1, columnKey: "Seco", columnSort: 1, variantSort: 2 },
  { productName: "Pastel Pequeño de Chocolate", variantKey: "Chocolate", rowKey: "Pequeño", rowMeta: "6-8 porciones", rowSort: 2, columnKey: "Seco", columnSort: 1, variantSort: 2 },
  { productName: "Pastel Mediano de Chocolate", variantKey: "Chocolate", rowKey: "Mediano", rowMeta: "13-15 porciones", rowSort: 3, columnKey: "Seco", columnSort: 1, variantSort: 2 },
  { productName: "Pastel Grande de Chocolate", variantKey: "Chocolate", rowKey: "Grande", rowMeta: "23-25 porciones", rowSort: 4, columnKey: "Seco", columnSort: 1, variantSort: 2 },
];

/**
 * POST /inventory/compare-groups/bootstrap-pasteles
 * Crea el grupo Pasteles si no existe (solo celdas con productos encontrados por nombre).
 */
export const bootstrapPastelesCompareGroup = async (req, res) => {
  try {
    const existing = await ProductCompareGroup.findOne({ where: { name: "Pasteles" } });
    if (existing) {
      const full = await loadGroupWithItems(existing.id);
      notifyOk("compare_group.pasteles_bootstrapped", "Bootstrap pasteles (ya existía)", {
        groupId: existing.id,
      });
      return res.json({
        message: "El grupo Pasteles ya existe",
        group: buildCompareGroupMatrix(full, full.items || []),
      });
    }

    const products = await InventoryProduct.findAll({
      where: { name: { [Op.in]: PASTELES_SEED.map((s) => s.productName) } },
      attributes: ["id", "name"],
    });
    const byName = new Map(products.map((p) => [p.name, p.id]));

    const items = [];
    for (const seed of PASTELES_SEED) {
      const productId = byName.get(seed.productName);
      if (!productId) continue;
      items.push({
        productId,
        variantKey: seed.variantKey,
        variantSort: seed.variantSort,
        rowKey: seed.rowKey,
        rowSort: seed.rowSort,
        rowMeta: seed.rowMeta,
        columnKey: seed.columnKey,
        columnSort: seed.columnSort,
      });
    }

    const group = await ProductCompareGroup.create({
      name: "Pasteles",
      subtitle: "Compara precios por tamaño y sabor",
      description: "Pasteles de vainilla y chocolate. Rellenos disponibles sin costo adicional: mora, piña y manjar.",
      section: "home",
      fillings: [
        { name: "Mora", color: "#7B1FA2" },
        { name: "Piña", color: "#F9A825" },
        { name: "Manjar", color: "#6D4C41" },
      ],
      rowLabel: "Tamaño",
      columnLabel: "Tipo",
      variantLabel: "Sabor",
      position: 0,
      isActive: true,
      hideMemberProducts: true,
    });

    if (items.length) {
      await ProductCompareGroupItem.bulkCreate(items.map((it) => ({ ...it, groupId: group.id })));
    }

    const full = await loadGroupWithItems(group.id);
    notifyOk("compare_group.pasteles_bootstrapped", "Bootstrap pasteles", {
      groupId: group.id,
      itemCount: items.length,
    });
    res.status(201).json({
      message: `Grupo Pasteles creado con ${items.length} productos`,
      group: buildCompareGroupMatrix(full, full.items || []),
    });
  } catch (err) {
    console.error("bootstrapPastelesCompareGroup error:", err);
    notifyFail("compare_group.pasteles_bootstrap_failed", "Error al crear grupo Pasteles", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al crear grupo Pasteles" });
  }
};
