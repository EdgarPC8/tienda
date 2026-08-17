import { PromoGroup, PromoBenefit, PromoMember } from "../models/MarketingPromotions.js";
import { InventoryProduct } from "../models/Inventory.js";
import { Customer } from "../models/Orders.js";
import { sequelize } from "../database/connection.js";

const BENEFIT_INCLUDE = {
  model: PromoBenefit,
  as: "benefits",
  include: [
    {
      model: InventoryProduct,
      as: "product",
      attributes: ["id", "name", "price", "sku"],
    },
  ],
};

const MEMBER_INCLUDE = {
  model: PromoMember,
  as: "members",
  include: [
    {
      model: Customer,
      as: "customer",
      attributes: ["id", "name", "firstName", "firstLastName", "cedula", "phone"],
    },
  ],
};

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function serializeGroup(row) {
  const json = row.toJSON ? row.toJSON() : row;
  const benefits = (json.benefits || []).map((b) => ({
    id: b.id,
    productId: b.productId,
    quantity: toNumber(b.quantity),
    price: toNumber(b.price),
    sortOrder: b.sortOrder || 0,
    productName: b.product?.name || "Producto",
    productSku: b.product?.sku || null,
    listPrice: toNumber(b.product?.price),
  }));
  const members = (json.members || []).map((m) => ({
    id: m.id,
    customerId: m.customerId,
    name: m.customer?.name || "Cliente",
    cedula: m.customer?.cedula || "",
    phone: m.customer?.phone || "",
  }));
  return {
    id: json.id,
    name: json.name,
    description: json.description || "",
    isActive: Boolean(json.isActive),
    createdAt: json.createdAt,
    updatedAt: json.updatedAt,
    benefits,
    members,
    memberCount: members.length,
  };
}

async function replaceBenefits(groupId, benefits = [], transaction) {
  await PromoBenefit.destroy({ where: { groupId }, transaction });
  const rows = (Array.isArray(benefits) ? benefits : [])
    .map((raw, index) => ({
      groupId,
      productId: Number(raw.productId),
      quantity: Math.max(0.001, toNumber(raw.quantity, 1)),
      price: Math.max(0, toNumber(raw.price)),
      sortOrder: index,
    }))
    .filter((row) => Number.isFinite(row.productId) && row.productId > 0);
  if (rows.length) await PromoBenefit.bulkCreate(rows, { transaction });
}

export async function listPromoGroups(_req, res) {
  try {
    const rows = await PromoGroup.findAll({
      include: [BENEFIT_INCLUDE, MEMBER_INCLUDE],
      order: [
        ["name", "ASC"],
        [{ model: PromoBenefit, as: "benefits" }, "sortOrder", "ASC"],
      ],
    });
    res.json(rows.map(serializeGroup));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function getPromoGroupById(req, res) {
  try {
    const row = await PromoGroup.findByPk(req.params.id, {
      include: [BENEFIT_INCLUDE, MEMBER_INCLUDE],
    });
    if (!row) return res.status(404).json({ message: "Grupo no encontrado" });
    res.json(serializeGroup(row));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function createPromoGroup(req, res) {
  const t = await sequelize.transaction();
  try {
    const name = String(req.body?.name || "").trim();
    if (!name) {
      await t.rollback();
      return res.status(400).json({ message: "El nombre del grupo es obligatorio" });
    }
    const group = await PromoGroup.create(
      {
        name,
        description: String(req.body?.description || "").trim() || null,
        isActive: req.body?.isActive !== false,
      },
      { transaction: t },
    );
    await replaceBenefits(group.id, req.body?.benefits, t);
    const memberIds = Array.isArray(req.body?.customerIds) ? req.body.customerIds : [];
    for (const rawId of memberIds) {
      await assignCustomerToGroup(group.id, rawId, t);
    }
    await t.commit();
    const fresh = await PromoGroup.findByPk(group.id, {
      include: [BENEFIT_INCLUDE, MEMBER_INCLUDE],
    });
    res.status(201).json({
      message: "Grupo de promoción creado",
      group: serializeGroup(fresh),
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: error.message });
  }
}

export async function updatePromoGroup(req, res) {
  const t = await sequelize.transaction();
  try {
    const group = await PromoGroup.findByPk(req.params.id, { transaction: t });
    if (!group) {
      await t.rollback();
      return res.status(404).json({ message: "Grupo no encontrado" });
    }
    const name = String(req.body?.name ?? group.name).trim();
    if (!name) {
      await t.rollback();
      return res.status(400).json({ message: "El nombre del grupo es obligatorio" });
    }
    await group.update(
      {
        name,
        description: String(req.body?.description ?? group.description ?? "").trim() || null,
        isActive: req.body?.isActive !== false,
      },
      { transaction: t },
    );
    if (Array.isArray(req.body?.benefits)) {
      await replaceBenefits(group.id, req.body.benefits, t);
    }
    if (Array.isArray(req.body?.customerIds)) {
      await PromoMember.destroy({ where: { groupId: group.id }, transaction: t });
      for (const rawId of req.body.customerIds) {
        await assignCustomerToGroup(group.id, rawId, t);
      }
    }
    await t.commit();
    const fresh = await PromoGroup.findByPk(group.id, {
      include: [BENEFIT_INCLUDE, MEMBER_INCLUDE],
    });
    res.json({
      message: "Grupo de promoción actualizado",
      group: serializeGroup(fresh),
    });
  } catch (error) {
    await t.rollback();
    res.status(500).json({ message: error.message });
  }
}

export async function deletePromoGroup(req, res) {
  try {
    const group = await PromoGroup.findByPk(req.params.id);
    if (!group) return res.status(404).json({ message: "Grupo no encontrado" });
    await PromoBenefit.destroy({ where: { groupId: group.id } });
    await PromoMember.destroy({ where: { groupId: group.id } });
    await group.destroy();
    res.json({ message: "Grupo de promoción eliminado" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function assignCustomerToGroup(groupId, rawCustomerId, transaction) {
  const customerId = Number(rawCustomerId);
  if (!Number.isFinite(customerId) || customerId <= 0) return { skipped: true };
  const existing = await PromoMember.findOne({
    where: { customerId },
    transaction,
  });
  if (existing) {
    if (Number(existing.groupId) === Number(groupId)) return { already: true };
    await existing.destroy({ transaction });
  }
  await PromoMember.create({ groupId, customerId }, { transaction });
  return { moved: Boolean(existing) };
}

export async function addPromoMember(req, res) {
  try {
    const group = await PromoGroup.findByPk(req.params.id);
    if (!group) return res.status(404).json({ message: "Grupo no encontrado" });
    const result = await assignCustomerToGroup(group.id, req.body?.customerId);
    if (result.skipped) {
      return res.status(400).json({ message: "Cliente inválido" });
    }
    const fresh = await PromoGroup.findByPk(group.id, {
      include: [BENEFIT_INCLUDE, MEMBER_INCLUDE],
    });
    res.json({
      message: result.moved
        ? "Cliente movido a este grupo"
        : "Cliente añadido al grupo",
      group: serializeGroup(fresh),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

export async function removePromoMember(req, res) {
  try {
    const deleted = await PromoMember.destroy({
      where: {
        groupId: req.params.id,
        customerId: req.params.customerId,
      },
    });
    if (!deleted) return res.status(404).json({ message: "Cliente no está en el grupo" });
    res.json({ message: "Cliente quitado del grupo" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

/** Para caja: beneficio activo del cliente, si tiene grupo. */
export async function getPromoByCustomer(req, res) {
  try {
    const customerId = Number(req.params.customerId);
    if (!Number.isFinite(customerId) || customerId <= 0) {
      return res.json(null);
    }
    const member = await PromoMember.findOne({
      where: { customerId },
      include: [
        {
          model: PromoGroup,
          as: "group",
          where: { isActive: true },
          required: true,
          include: [BENEFIT_INCLUDE],
        },
      ],
    });
    if (!member?.group) return res.json(null);
    res.json(serializeGroup(member.group));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
