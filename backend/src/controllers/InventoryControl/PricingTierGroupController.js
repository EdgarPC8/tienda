import { PricingTierGroup, InventoryCategory } from "../../models/Inventory.js";
import { normalizePackageTiersStrict } from "../../utils/productPricingUtils.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const GROUP_INCLUDE = {
  model: InventoryCategory,
  as: "category",
  attributes: ["id", "name", "parentId"],
  required: false,
};

function normalizeProductIds(raw) {
  if (raw == null || raw === "") return null;
  let val = raw;
  if (typeof val === "string") {
    try {
      val = JSON.parse(val);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(val)) return null;
  const ids = [...new Set(val.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))];
  return ids.length ? ids : null;
}

async function applyTierGroupPayload(body) {
  const payload = { ...body };

  if ("name" in payload) {
    const name = String(payload.name ?? "").trim();
    if (!name) throw new Error("El nombre del tramo es obligatorio.");
    payload.name = name;
  }

  if ("description" in payload) {
    const desc = String(payload.description ?? "").trim();
    payload.description = desc || null;
  }

  if ("packageTiers" in payload) {
    payload.packageTiers = normalizePackageTiersStrict(payload.packageTiers);
  }

  if ("productIds" in payload) {
    payload.productIds = normalizeProductIds(payload.productIds);
  }

  if ("categoryId" in payload) {
    if (payload.categoryId == null || payload.categoryId === "") {
      payload.categoryId = null;
    } else {
      const cid = Number(payload.categoryId);
      if (!Number.isFinite(cid) || cid <= 0) {
        throw new Error("La categoría no es válida.");
      }
      const cat = await InventoryCategory.findByPk(cid);
      if (!cat) throw new Error("Categoría no encontrada.");
      payload.categoryId = cid;
    }
  }

  if ("isActive" in payload) {
    payload.isActive = Boolean(payload.isActive);
  }

  if ("position" in payload) {
    payload.position = Number.isFinite(Number(payload.position)) ? Number(payload.position) : 0;
  }

  return payload;
}

export const getAllTierGroups = async (req, res) => {
  try {
    const where = {};
    if (req.query.active === "true") where.isActive = true;

    const groups = await PricingTierGroup.findAll({
      where,
      include: [GROUP_INCLUDE],
      order: [
        ["position", "ASC"],
        ["name", "ASC"],
      ],
    });
    res.json(groups);
  } catch (err) {
    console.error("Error al obtener tramos:", err);
    res.status(500).json({ message: "Error al obtener tramos", error: err });
  }
};

export const getTierGroupById = async (req, res) => {
  try {
    const group = await PricingTierGroup.findByPk(req.params.id, { include: [GROUP_INCLUDE] });
    if (!group) return res.status(404).json({ message: "Tramo no encontrado" });
    res.json(group);
  } catch (err) {
    res.status(500).json({ message: "Error al obtener tramo", error: err });
  }
};

export const createTierGroup = async (req, res) => {
  try {
    const payload = await applyTierGroupPayload(req.body);
    const group = await PricingTierGroup.create(payload);
    const full = await PricingTierGroup.findByPk(group.id, { include: [GROUP_INCLUDE] });
    notifyOk("tier_group.created", `Grupo tramos #${group.id}`, { tierGroupId: group.id });
    res.status(201).json(full);
  } catch (err) {
    if (err?.message && /(packageTiers|tramo|categoría|productIds)/i.test(err.message)) {
      notifyFail("tier_group.create_failed", err.message, { error: err, req, httpStatus: 400 });
      return res.status(400).json({ message: err.message });
    }
    notifyFail("tier_group.create_failed", "Error al crear tramo", { error: err, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al crear tramo", error: err });
  }
};

export const updateTierGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = await applyTierGroupPayload(req.body);
    const existing = await PricingTierGroup.findByPk(id);
    if (!existing) {
      notifyFail("tier_group.update_failed", "Tramo no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Tramo no encontrado" });
    }

    await PricingTierGroup.update(updates, { where: { id } });
    const full = await PricingTierGroup.findByPk(id, { include: [GROUP_INCLUDE] });
    notifyOk("tier_group.updated", `Grupo tramos #${id}`, { tierGroupId: id });
    res.json(full);
  } catch (err) {
    if (err?.message && /(packageTiers|tramo|categoría|productIds)/i.test(err.message)) {
      notifyFail("tier_group.update_failed", err.message, { error: err, req, httpStatus: 400 });
      return res.status(400).json({ message: err.message });
    }
    notifyFail("tier_group.update_failed", "Error al actualizar tramo", { error: err, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al actualizar tramo", error: err });
  }
};

export const deleteTierGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await PricingTierGroup.destroy({ where: { id } });
    if (!deleted) {
      notifyFail("tier_group.delete_failed", "Tramo no encontrado", { req, httpStatus: 404 });
      return res.status(404).json({ message: "Tramo no encontrado" });
    }
    notifyOk("tier_group.deleted", `Grupo tramos #${id}`, { tierGroupId: id });
    res.json({ message: "Tramo eliminado" });
  } catch (err) {
    notifyFail("tier_group.delete_failed", "Error al eliminar tramo", { error: err, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al eliminar tramo", error: err });
  }
};

/** Migra tramos configurados en categorías al nuevo módulo y limpia la categoría. */
export const migrateTierGroupsFromCategories = async (req, res) => {
  try {
    const categories = await InventoryCategory.findAll();
    let created = 0;
    let skipped = 0;

    for (const cat of categories) {
      const tiers = normalizePackageTiersStrict(cat.packageTiers);
      const productIds = normalizeProductIds(cat.mixMatchProductIds);
      if (!tiers?.length || !productIds?.length) {
        skipped += 1;
        continue;
      }

      const label = String(cat.mixMatchLabel ?? "").trim() || cat.name;
      const existing = await PricingTierGroup.findOne({
        where: { categoryId: cat.id, name: label },
      });
      if (!existing) {
        await PricingTierGroup.create({
          name: label,
          description: cat.description || null,
          categoryId: cat.id,
          packageTiers: tiers,
          productIds,
          isActive: true,
          position: 0,
        });
        created += 1;
      }

      await InventoryCategory.update(
        { packageTiers: null, mixMatchLabel: null, mixMatchProductIds: null },
        { where: { id: cat.id } },
      );
    }

    const groups = await PricingTierGroup.findAll({ include: [GROUP_INCLUDE] });
    notifyOk("tier_group.migrated_from_categories", "Migración tramos desde categorías", {
      created,
      skipped,
    });
    res.json({ message: "Migración completada", created, skipped, groups });
  } catch (err) {
    console.error("Error en migración de tramos:", err);
    notifyFail("tier_group.migrate_failed", "Error al migrar tramos desde categorías", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al migrar tramos desde categorías", error: err });
  }
};
