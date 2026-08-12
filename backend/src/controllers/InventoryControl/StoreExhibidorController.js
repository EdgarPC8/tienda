import { Store, StoreExhibidor, StoreProduct } from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

async function assertStore(storeId) {
  const store = await Store.findByPk(storeId);
  if (!store) {
    const err = new Error("Local no encontrado");
    err.status = 404;
    throw err;
  }
  return store;
}

/** GET /inventory/stores/:storeId/exhibidores */
export async function listStoreExhibidores(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    await assertStore(storeId);
    const rows = await StoreExhibidor.findAll({
      where: { storeId },
      order: [
        ["position", "ASC"],
        ["id", "ASC"],
      ],
    });
    return res.json(
      rows.map((r) => ({
        id: r.id,
        storeId: r.storeId,
        name: r.name,
        position: r.position,
        isActive: r.isActive !== false,
      })),
    );
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({ message: error.message || "Error al listar exhibidores" });
  }
}

/** POST /inventory/stores/:storeId/exhibidores  body: { name, position? } */
export async function createStoreExhibidor(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    await assertStore(storeId);
    const name = String(req.body?.name || "").trim();
    if (!name) {
      notifyFail("store.exhibidor_create_failed", "Nombre requerido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "El nombre del exhibidor es obligatorio." });
    }
    const maxPos = await StoreExhibidor.max("position", { where: { storeId } });
    const position =
      req.body?.position != null && Number.isFinite(Number(req.body.position))
        ? Number(req.body.position)
        : (Number.isFinite(maxPos) ? maxPos + 1 : 0);

    const row = await StoreExhibidor.create({
      storeId,
      name,
      position,
      isActive: req.body?.isActive === false ? false : true,
    });
    notifyOk("store.exhibidor_created", `Exhibidor #${row.id} en local #${storeId}`, {
      storeId,
      exhibidorId: row.id,
    });
    return res.status(201).json({
      message: "Exhibidor creado",
      exhibidor: {
        id: row.id,
        storeId: row.storeId,
        name: row.name,
        position: row.position,
        isActive: row.isActive !== false,
      },
    });
  } catch (error) {
    notifyFail("store.exhibidor_create_failed", "Error al crear exhibidor", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: error.message || "Error al crear exhibidor" });
  }
}

/** PUT /inventory/stores/:storeId/exhibidores/:exhibidorId */
export async function updateStoreExhibidor(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const exhibidorId = Number(req.params.exhibidorId);
    await assertStore(storeId);
    const row = await StoreExhibidor.findOne({ where: { id: exhibidorId, storeId } });
    if (!row) {
      return res.status(404).json({ message: "Exhibidor no encontrado" });
    }
    const updates = {};
    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "Nombre inválido" });
      updates.name = name;
    }
    if (req.body?.position != null && Number.isFinite(Number(req.body.position))) {
      updates.position = Number(req.body.position);
    }
    if (req.body?.isActive != null) {
      updates.isActive = Boolean(req.body.isActive);
    }
    await row.update(updates);
    notifyOk("store.exhibidor_updated", `Exhibidor #${exhibidorId}`, { storeId, exhibidorId });
    return res.json({
      message: "Exhibidor actualizado",
      exhibidor: {
        id: row.id,
        storeId: row.storeId,
        name: row.name,
        position: row.position,
        isActive: row.isActive !== false,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Error al actualizar exhibidor" });
  }
}

/** DELETE /inventory/stores/:storeId/exhibidores/:exhibidorId */
export async function deleteStoreExhibidor(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const exhibidorId = Number(req.params.exhibidorId);
    await assertStore(storeId);
    const row = await StoreExhibidor.findOne({ where: { id: exhibidorId, storeId } });
    if (!row) {
      return res.status(404).json({ message: "Exhibidor no encontrado" });
    }
    // Liberar productos del exhibidor (siguen en el local; stock intacto)
    await StoreProduct.update(
      { exhibidorId: null },
      { where: { storeId, exhibidorId } },
    );
    await row.destroy();
    notifyOk("store.exhibidor_deleted", `Exhibidor #${exhibidorId} eliminado`, {
      storeId,
      exhibidorId,
    });
    return res.json({ message: "Exhibidor eliminado; productos quedan sin exhibidor" });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Error al eliminar exhibidor" });
  }
}
