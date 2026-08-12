import {
  InventoryProduct,
  InventoryCategory,
  InventoryUnit,
  StoreProduct,
  Store,
  StoreExhibidor,
} from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import { Op, where, fn, col } from "sequelize";

export const getProductsByStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { activeOnly = "true", q = "" } = req.query;

    const whereSP = { storeId: Number(storeId) };
    if (String(activeOnly) === "true") whereSP.isActive = true;

    const whereProduct = { type: "final", isActive: true };
    const search = String(q || "").trim();
    if (search) {
      whereProduct[Op.and] = [
        where(fn("lower", col("ERP_inventory_product.name")), {
          [Op.like]: `%${search.toLowerCase()}%`,
        }),
      ];
    }

    const rows = await StoreProduct.findAll({
      where: whereSP,
      order: [["createdAt", "DESC"]],
      include: [
        {
          model: InventoryProduct,
          where: whereProduct,
          required: true,
          include: [
            { model: InventoryCategory, required: false },
            { model: InventoryUnit, required: false },
          ],
        },
        {
          model: StoreExhibidor,
          as: "exhibidor",
          required: false,
          attributes: ["id", "name", "position", "isActive"],
        },
      ],
      raw: false,
      nest: true,
    });

    const data = rows.map((sp) => {
      const p = sp.ERP_inventory_product;
      const ex = sp.exhibidor;
      return {
        linkId: sp.id,
        storeId: sp.storeId,
        productId: p.id,
        isActive: !!sp.isActive,
        exhibidorId: sp.exhibidorId ?? null,
        exhibidor: ex
          ? {
              id: ex.id,
              name: ex.name,
              position: ex.position,
              isActive: ex.isActive !== false,
            }
          : null,
        product: {
          id: p.id,
          name: p.name,
          price: Number(p.price || 0),
          stock: p.stock != null ? Number(p.stock) : null,
          primaryImageUrl: p.primaryImageUrl || null,
          type: p.type,
          isActive: !!p.isActive,
          categoryId: p.ERP_inventory_category?.id ?? p.categoryId ?? null,
          category: p.ERP_inventory_category?.name ?? null,
          categoryParentId: p.ERP_inventory_category?.parentId ?? null,
          unitId: p.ERP_inventory_unit?.id ?? null,
          unit: p.ERP_inventory_unit?.abbreviation ?? p.ERP_inventory_unit?.name ?? null,
        },
        createdAt: sp.createdAt,
        updatedAt: sp.updatedAt,
      };
    });

    return res.json(data);
  } catch (err) {
    console.error("getProductsByStore error:", err);
    return res.status(500).json({ message: "Error al obtener productos de la tienda" });
  }
};

export const addProductsToStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { productIds = [], exhibidorId = null } = req.body;

    if (!Array.isArray(productIds) || productIds.length === 0) {
      notifyFail("store.product_assign_failed", "productIds es requerido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "productIds es requerido (array)" });
    }

    let resolvedExhibidorId = null;
    if (exhibidorId != null && exhibidorId !== "") {
      const ex = await StoreExhibidor.findOne({
        where: { id: Number(exhibidorId), storeId: Number(storeId) },
      });
      if (!ex) {
        return res.status(400).json({ message: "Exhibidor no válido para este local" });
      }
      resolvedExhibidorId = ex.id;
    }

    const ops = productIds.map(async (pid) => {
      const [row, created] = await StoreProduct.findOrCreate({
        where: { storeId: Number(storeId), productId: Number(pid) },
        defaults: { isActive: true, exhibidorId: resolvedExhibidorId },
      });
      if (!row.isActive) await row.update({ isActive: true });
      if (!created && resolvedExhibidorId != null && row.exhibidorId !== resolvedExhibidorId) {
        await row.update({ exhibidorId: resolvedExhibidorId });
      }
      return row;
    });

    const created = await Promise.all(ops);
    notifyOk("store.product_assigned", `Productos asignados al local #${storeId}`, {
      storeId,
      count: created.length,
    });
    res.status(201).json({ message: "Asignaciones creadas/activadas", rows: created });
  } catch (err) {
    console.error("addProductsToStore error:", err);
    notifyFail("store.product_assign_failed", "Error al asignar productos a la tienda", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al asignar productos a la tienda" });
  }
};

export const removeProductFromStore = async (req, res) => {
  try {
    const { storeId, productId } = req.params;
    const row = await StoreProduct.findOne({
      where: { storeId: Number(storeId), productId: Number(productId) },
    });
    if (!row) {
      notifyFail("store.product_remove_failed", "Relación store-producto no encontrada", {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Relación no encontrada" });
    }

    await row.destroy();
    notifyOk("store.product_removed", `Producto #${productId} quitado del local #${storeId}`, {
      storeId,
      productId,
    });
    res.json({ message: "Desasignado" });
  } catch (err) {
    console.error("removeProductFromStore error:", err);
    notifyFail("store.product_remove_failed", "Error al desasignar producto", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al desasignar producto" });
  }
};

export const toggleStoreProduct = async (req, res) => {
  try {
    const { storeId, productId } = req.params;
    const { isActive, exhibidorId } = req.body ?? {};

    const row = await StoreProduct.findOne({
      where: { storeId: Number(storeId), productId: Number(productId) },
    });
    if (!row) {
      notifyFail("store.product_toggle_failed", "Relación store-producto no encontrada", {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Relación no encontrada" });
    }

    const updates = {};
    if (isActive !== undefined) updates.isActive = Boolean(isActive);

    if (exhibidorId !== undefined) {
      if (exhibidorId === null || exhibidorId === "" || exhibidorId === "none") {
        updates.exhibidorId = null;
      } else {
        const ex = await StoreExhibidor.findOne({
          where: { id: Number(exhibidorId), storeId: Number(storeId) },
        });
        if (!ex) {
          return res.status(400).json({ message: "Exhibidor no válido para este local" });
        }
        updates.exhibidorId = ex.id;
      }
    }

    if (!Object.keys(updates).length) {
      return res.status(400).json({ message: "Indica isActive y/o exhibidorId" });
    }

    await row.update(updates);
    notifyOk("store.product_toggled", `Actualizado producto #${productId} en local #${storeId}`, {
      storeId,
      productId,
      ...updates,
    });
    res.json({ message: "Actualizado", row });
  } catch (err) {
    console.error("toggleStoreProduct error:", err);
    notifyFail("store.product_toggle_failed", "Error al actualizar relación", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar relación" });
  }
};

export const getStoresByProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const links = await StoreProduct.findAll({
      where: { productId: Number(productId), isActive: true },
      include: [{ model: Store, required: true }],
      order: [[Store, "position", "ASC"]],
    });

    const data = links.map((l) => ({
      storeId: l.storeId,
      name: l.Store?.name,
      address: l.Store?.address,
      city: l.Store?.city,
      province: l.Store?.province,
      imageUrl: l.Store?.imageUrl || null,
      isActive: !!l.Store?.isActive,
      exhibidorId: l.exhibidorId ?? null,
    }));

    res.json(data);
  } catch (err) {
    console.error("getStoresByProduct error:", err);
    res.status(500).json({ message: "Error al obtener tiendas del producto" });
  }
};
