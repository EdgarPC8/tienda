import { Op } from "sequelize";
import { InventoryCategory } from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const CATEGORY_INCLUDE_PARENT = {
  model: InventoryCategory,
  as: "parent",
  attributes: ["id", "name"],
  required: false,
};

async function validateParentId(parentId, categoryId = null) {
  if (parentId == null || parentId === "") return null;
  const pid = Number(parentId);
  if (!Number.isFinite(pid) || pid <= 0) {
    throw new Error("La categoría padre no es válida.");
  }
  if (categoryId && pid === Number(categoryId)) {
    throw new Error("Una categoría no puede ser padre de sí misma.");
  }
  const parent = await InventoryCategory.findByPk(pid);
  if (!parent) {
    throw new Error("Categoría padre no encontrada.");
  }
  if (parent.parentId) {
    throw new Error("Solo hay dos niveles: categoría principal y subcategoría.");
  }
  return pid;
}

async function assertUniqueCategoryName(name, parentId, categoryId = null) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    throw new Error("El nombre de la categoría es obligatorio.");
  }

  const where = {
    name: trimmed,
    parentId: parentId == null ? { [Op.is]: null } : parentId,
  };

  const existing = await InventoryCategory.findOne({
    where,
    include: [CATEGORY_INCLUDE_PARENT],
  });
  if (existing && (!categoryId || Number(existing.id) !== Number(categoryId))) {
    if (existing.parentId == null) {
      throw new Error(
        `Ya existe la categoría principal «${existing.name}». Búscala en la lista de la izquierda.`,
      );
    }
    const parentName = existing.parent?.name || `categoría #${existing.parentId}`;
    throw new Error(
      `Ya existe la subcategoría «${existing.name}» dentro de «${parentName}». Selecciónala a la izquierda para verla.`,
    );
  }

  return trimmed;
}

function mapCategoryError(err, fallbackMessage) {
  if (err?.message && (/packageTiers|categoría|padre|niveles|nombre|obligatorio|existe/i.test(err.message))) {
    return { status: 400, message: err.message };
  }
  if (err?.name === "SequelizeUniqueConstraintError") {
    return {
      status: 400,
      message:
        "Ya existe una categoría con ese nombre. Si el error persiste, ejecuta npm run db:sync:categorias en el servidor.",
    };
  }
  return { status: 500, message: fallbackMessage, error: err };
}

async function applyCategoryPayload(body, categoryId = null) {
  const payload = { ...body };
  delete payload.packageTiers;
  delete payload.mixMatchProductIds;
  delete payload.mixMatchLabel;

  if ("name" in payload) {
    const parentForCheck =
      "parentId" in payload
        ? payload.parentId == null || payload.parentId === ""
          ? null
          : Number(payload.parentId)
        : undefined;
    let resolvedParent = parentForCheck;
    if (resolvedParent === undefined && categoryId) {
      const current = await InventoryCategory.findByPk(categoryId, {
        attributes: ["parentId"],
      });
      resolvedParent = current?.parentId ?? null;
    }
    payload.name = await assertUniqueCategoryName(
      payload.name,
      resolvedParent ?? null,
      categoryId,
    );
  }

  if ("parentId" in payload) {
    payload.parentId = await validateParentId(payload.parentId, categoryId);
    if ("name" in payload) {
      payload.name = await assertUniqueCategoryName(payload.name, payload.parentId, categoryId);
    }
  }

  if ("isPublic" in payload) {
    payload.isPublic = Boolean(payload.isPublic);
  }

  return payload;
}

export const createCategory = async (req, res) => {
  try {
    const payload = await applyCategoryPayload(req.body);
    const category = await InventoryCategory.create(payload);
    const full = await InventoryCategory.findByPk(category.id, {
      include: [CATEGORY_INCLUDE_PARENT],
    });
    notifyOk("category.created", `Categoría #${category.id}`, { category: full });
    res.status(201).json(full);
  } catch (err) {
    const mapped = mapCategoryError(err, "Error al crear categoría");
    if (mapped.status === 500) console.error("createCategory:", err);
    notifyFail("category.create_failed", mapped.message, {
      error: mapped.error || err,
      req,
      httpStatus: mapped.status,
    });
    res.status(mapped.status).json({
      message: mapped.message,
      ...(mapped.error ? { error: mapped.error } : {}),
    });
  }
};

export const getAllCategories = async (req, res) => {
  try {
    const onlyPublic = req.query.public === "true";
    const where = {};
    if (onlyPublic) {
      where.isPublic = true;
    }

    const categories = await InventoryCategory.findAll({
      where,
      include: [CATEGORY_INCLUDE_PARENT],
      order: [
        ["parentId", "ASC"],
        ["name", "ASC"],
      ],
    });
    res.json(categories);
  } catch (err) {
    console.error("Error al obtener categorías:", err);
    res.status(500).json({ message: "Error al obtener categorías", error: err.message });
  }
};

/** Categorías visibles en catálogo público (sin autenticación). */
export const getAllCategoriesPublic = async (req, res) => {
  req.query.public = "true";
  return getAllCategories(req, res);
};

export const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = await applyCategoryPayload(req.body, id);

    if ("parentId" in updates && updates.parentId) {
      const children = await InventoryCategory.count({ where: { parentId: id } });
      if (children > 0) {
        notifyFail("category.update_failed", "Categoría con subcategorías hijas", {
          req,
          httpStatus: 400,
          extra: { categoryId: id },
        });
        return res.status(400).json({
          message: "No puedes convertir en subcategoría una categoría que ya tiene hijas.",
        });
      }
    }

    await InventoryCategory.update(updates, { where: { id } });
    const full = await InventoryCategory.findByPk(id, {
      include: [CATEGORY_INCLUDE_PARENT],
    });
    notifyOk("category.updated", `Categoría #${id}`, { category: full });
    res.json(full);
  } catch (err) {
    const mapped = mapCategoryError(err, "Error al actualizar categoría");
    if (mapped.status === 500) console.error("updateCategory:", err);
    notifyFail("category.update_failed", mapped.message, {
      error: mapped.error || err,
      req,
      httpStatus: mapped.status,
    });
    res.status(mapped.status).json({
      message: mapped.message,
      ...(mapped.error ? { error: mapped.error } : {}),
    });
  }
};

export const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const children = await InventoryCategory.count({ where: { parentId: id } });
    if (children > 0) {
      notifyFail("category.delete_failed", "Categoría con subcategorías", {
        req,
        httpStatus: 400,
        extra: { categoryId: id },
      });
      return res.status(400).json({
        message: "Elimina o reasigna las subcategorías antes de borrar esta categoría.",
      });
    }
    await InventoryCategory.destroy({ where: { id } });
    notifyOk("category.deleted", `Categoría #${id}`, { categoryId: id });
    res.json({ message: "Categoría eliminada" });
  } catch (err) {
    notifyFail("category.delete_failed", "Error al eliminar categoría", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar categoría", error: err });
  }
};
