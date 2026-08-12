import { Op } from "sequelize";
import { Store } from "../../models/Inventory.js";
import {
  CashRegister,
  ensureDefaultCashRegisters,
  padEmissionCode,
} from "../../models/CashRegister.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const ADMIN_ROLES = new Set(["Administrador", "Programador"]);

function registerToJson(row) {
  if (!row) return null;
  const j = typeof row.toJSON === "function" ? row.toJSON() : row;
  return {
    id: j.id,
    storeId: j.storeId,
    name: j.name,
    code: j.code,
    emissionPointCode: j.emissionPointCode,
    isActive: j.isActive,
    position: j.position,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
}

async function loadOwnStore(storeId) {
  const store = await Store.findByPk(storeId);
  if (!store) return { error: { status: 404, message: "Local no encontrado." } };
  if (store.locationKind === "vitrina") {
    return {
      error: {
        status: 400,
        message: "Las vitrinas no tienen cajas POS. Usa un local propio.",
      },
    };
  }
  return { store };
}

/** GET /inventory/stores/:storeId/registers */
export async function listCashRegisters(req, res) {
  try {
    const storeId = Number(req.params.storeId);
    const { store, error } = await loadOwnStore(storeId);
    if (error) return res.status(error.status).json({ message: error.message });

    await ensureDefaultCashRegisters(store);

    const includeInactive = String(req.query.all || "") === "true";
    const where = { storeId };
    if (!includeInactive) where.isActive = true;

    const rows = await CashRegister.findAll({
      where,
      order: [
        ["position", "ASC"],
        ["id", "ASC"],
      ],
    });
    res.json(rows.map(registerToJson));
  } catch (error) {
    console.error("listCashRegisters:", error);
    res.status(500).json({ message: error.message });
  }
}

/** POST /inventory/stores/:storeId/registers */
export async function createCashRegister(req, res) {
  try {
    if (!ADMIN_ROLES.has(req.user?.loginRol)) {
      notifyFail("cash_register.create_failed", "Sin permiso", { req, httpStatus: 403 });
      return res.status(403).json({ message: "Solo administrador o programador puede crear cajas." });
    }

    const storeId = Number(req.params.storeId);
    const { store, error } = await loadOwnStore(storeId);
    if (error) {
      notifyFail("cash_register.create_failed", error.message, { req, httpStatus: error.status });
      return res.status(error.status).json({ message: error.message });
    }

    await ensureDefaultCashRegisters(store);

    const name = String(req.body?.name || "").trim();
    if (!name) {
      return res.status(400).json({ message: "El nombre de la caja es obligatorio." });
    }

    const count = await CashRegister.count({ where: { storeId } });
    const nextNum = count + 1;
    const codeRaw = String(req.body?.code || `C${nextNum}`).trim().slice(0, 20);
    const emissionPointCode = padEmissionCode(
      req.body?.emissionPointCode,
      padEmissionCode(store.emissionPointCode, String(nextNum).padStart(3, "0")),
    );

    const dupCode = await CashRegister.findOne({
      where: { storeId, code: codeRaw },
    });
    if (dupCode) {
      return res.status(400).json({ message: `Ya existe una caja con código ${codeRaw} en este local.` });
    }

    const maxPos = await CashRegister.max("position", { where: { storeId } });
    const position =
      req.body?.position != null && req.body.position !== ""
        ? Number(req.body.position)
        : (Number.isFinite(maxPos) ? maxPos : -1) + 1;

    const row = await CashRegister.create({
      storeId,
      name,
      code: codeRaw || null,
      emissionPointCode,
      isActive: req.body?.isActive === false || req.body?.isActive === "false" ? false : true,
      position: Number.isFinite(position) ? position : nextNum - 1,
    });

    notifyOk("cash_register.created", `${name} · local #${storeId}`, { registerId: row.id });
    res.status(201).json({ message: "Caja creada.", register: registerToJson(row) });
  } catch (error) {
    console.error("createCashRegister:", error);
    notifyFail("cash_register.create_failed", error.message, { error, req, httpStatus: 500 });
    res.status(500).json({ message: error.message });
  }
}

/** PUT /inventory/registers/:id */
export async function updateCashRegister(req, res) {
  try {
    if (!ADMIN_ROLES.has(req.user?.loginRol)) {
      return res.status(403).json({ message: "Solo administrador o programador puede editar cajas." });
    }

    const row = await CashRegister.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Caja no encontrada." });

    const updates = {};
    if (req.body?.name != null) {
      const name = String(req.body.name).trim();
      if (!name) return res.status(400).json({ message: "Nombre inválido." });
      updates.name = name;
    }
    if (req.body?.code != null) {
      const code = String(req.body.code).trim().slice(0, 20);
      if (code) {
        const dup = await CashRegister.findOne({
          where: {
            storeId: row.storeId,
            code,
            id: { [Op.ne]: row.id },
          },
        });
        if (dup) {
          return res.status(400).json({ message: `Ya existe una caja con código ${code}.` });
        }
      }
      updates.code = code || null;
    }
    if (req.body?.emissionPointCode != null) {
      updates.emissionPointCode = padEmissionCode(req.body.emissionPointCode, row.emissionPointCode);
    }
    if (req.body?.isActive != null) {
      updates.isActive = !(req.body.isActive === false || req.body.isActive === "false");
    }
    if (req.body?.position != null && req.body.position !== "") {
      updates.position = Number(req.body.position);
    }

    await row.update(updates);
    notifyOk("cash_register.updated", `Caja #${row.id}`, { registerId: row.id });
    res.json({ message: "Caja actualizada.", register: registerToJson(row) });
  } catch (error) {
    console.error("updateCashRegister:", error);
    res.status(500).json({ message: error.message });
  }
}

/** DELETE /inventory/registers/:id — desactiva (soft) */
export async function deactivateCashRegister(req, res) {
  try {
    if (!ADMIN_ROLES.has(req.user?.loginRol)) {
      return res.status(403).json({ message: "Solo administrador o programador puede desactivar cajas." });
    }

    const row = await CashRegister.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Caja no encontrada." });

    const activeCount = await CashRegister.count({
      where: { storeId: row.storeId, isActive: true },
    });
    if (row.isActive && activeCount <= 1) {
      return res.status(400).json({
        message: "Debe quedar al menos una caja activa en el local.",
      });
    }

    await row.update({ isActive: false });
    notifyOk("cash_register.deactivated", `Caja #${row.id}`, { registerId: row.id });
    res.json({ message: "Caja desactivada.", register: registerToJson(row) });
  } catch (error) {
    console.error("deactivateCashRegister:", error);
    res.status(500).json({ message: error.message });
  }
}
