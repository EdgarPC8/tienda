import { InventoryUnit } from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

  // controllers/inventoryUnitController.js
  export const createUnit = async (req, res) => {
    try {
      const unit = await InventoryUnit.create(req.body);
      notifyOk("unit.created", `Unidad #${unit.id}`, { unit });
      res.status(201).json(unit);
    } catch (err) {
      notifyFail("unit.create_failed", "Error al crear unidad", { error: err, req, httpStatus: 500 });
      res.status(500).json({ message: 'Error al crear unidad', error: err });
    }
  };
  
  export const getAllUnits = async (req, res) => {
    try {
      const units = await InventoryUnit.findAll();
      res.json(units);
    } catch (err) {
      res.status(500).json({ message: 'Error al obtener unidades', error: err });
    }
  };
  
  export const updateUnit = async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await InventoryUnit.update(req.body, { where: { id } });
      notifyOk("unit.updated", `Unidad #${id}`, { unitId: id });
      res.json({ message: 'Unidad actualizada', updated });
    } catch (err) {
      notifyFail("unit.update_failed", `Error al actualizar unidad #${req.params.id}`, {
        error: err,
        req,
        httpStatus: 500,
      });
      res.status(500).json({ message: 'Error al actualizar unidad', error: err });
    }
  };
  
  export const deleteUnit = async (req, res) => {
    try {
      const { id } = req.params;
      await InventoryUnit.destroy({ where: { id } });
      notifyOk("unit.deleted", `Unidad #${id}`, { unitId: id });
      res.json({ message: 'Unidad eliminada' });
    } catch (err) {
      notifyFail("unit.delete_failed", `Error al eliminar unidad #${req.params.id}`, {
        error: err,
        req,
        httpStatus: 500,
      });
      res.status(500).json({ message: 'Error al eliminar unidad', error: err });
    }
  };
  
