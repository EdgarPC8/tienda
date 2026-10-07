import { Op } from "sequelize";
import { Supplier, SupplierOrder } from "../../models/Orders.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import {
  linkSupplierAccount,
  unlinkSupplierAccount,
  listSupplierLinkedAccounts,
} from "../../services/supplierAccountService.js";
import {
  ensurePeerSyncSchema,
  newPeerSyncSecret,
  serializeSupplierWithLinks,
} from "../../services/supplierPeerSyncService.js";

function pickSupplierFields(body = {}) {
  const out = {};
  const keys = [
    "name",
    "tradeName",
    "identType",
    "identNumber",
    "category",
    "contactName",
    "contactRole",
    "phone",
    "whatsapp",
    "email",
    "invoiceEmail",
    "website",
    "address",
    "city",
    "province",
    "bankName",
    "bankAccountType",
    "bankAccountNumber",
    "paymentTermDays",
    "preferredPaymentMethod",
    "notes",
    "isActive",
    "remoteApp",
    "remoteSupplierId",
    "remoteBaseUrl",
    "remoteSyncSecret",
  ];
  for (const key of keys) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  if (out.name != null) out.name = String(out.name).trim();
  if (out.remoteApp != null) out.remoteApp = String(out.remoteApp).trim() || null;
  if (out.remoteBaseUrl != null) {
    out.remoteBaseUrl = String(out.remoteBaseUrl).trim().replace(/\/+$/, "") || null;
  }
  if (out.remoteSyncSecret != null) {
    out.remoteSyncSecret = String(out.remoteSyncSecret).trim() || null;
  }
  if (out.remoteSupplierId != null && out.remoteSupplierId !== "") {
    out.remoteSupplierId = Number(out.remoteSupplierId);
    if (!Number.isFinite(out.remoteSupplierId)) out.remoteSupplierId = null;
  } else if (out.remoteSupplierId === "") {
    out.remoteSupplierId = null;
  }
  return out;
}

export const getAllSuppliers = async (req, res) => {
  try {
    await ensurePeerSyncSchema();
    const rows = await Supplier.findAll({ order: [["name", "ASC"]] });
    let list = rows;
    try {
      const { getHeaderToken, verifyJWT } = await import("../../libs/jwt.js");
      const token = getHeaderToken(req);
      const user = token ? await verifyJWT(token).catch(() => null) : null;
      const rol = String(user?.loginRol || "");
      if (rol === "Proveedor" || rol === "Proovedor") {
        const { getLinkedSupplierIdsForAccount } = await import(
          "../../services/supplierAccountService.js"
        );
        const ids = new Set(await getLinkedSupplierIdsForAccount(user.accountId));
        list = rows.filter((r) => ids.has(Number(r.id)));
      }
    } catch {
      /* keep full list */
    }
    const enriched = [];
    for (const row of list) {
      enriched.push(await serializeSupplierWithLinks(row));
    }
    res.json(enriched);
  } catch (error) {
    console.error("getAllSuppliers:", error);
    res.status(500).json({ message: "Error al obtener proveedores" });
  }
};

export const createSupplier = async (req, res) => {
  try {
    await ensurePeerSyncSchema();
    const fields = pickSupplierFields(req.body || {});
    const ident = String(fields.identNumber || req.body?.ruc || "").trim();
    if (ident && !/^\d{13}$/.test(ident) && !/^\d{10}$/.test(ident)) {
      return res.status(400).json({ message: "El documento del proveedor no es válido" });
    }
    if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(fields.email).trim())) {
      return res.status(400).json({ message: "El correo no es válido" });
    }
    if (!fields.name) {
      notifyFail("supplier.create_failed", "El nombre del proveedor es obligatorio", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "El nombre del proveedor es obligatorio" });
    }
    if (ident) fields.identNumber = ident;
    if (fields.remoteApp) {
      await Supplier.update(
        { remoteApp: null },
        { where: { remoteApp: fields.remoteApp } },
      );
    }
    const row = await Supplier.create(fields);
    notifyOk("supplier.created", "Proveedor creado", { supplierId: row.id });
    res.status(201).json(await serializeSupplierWithLinks(row));
  } catch (error) {
    console.error("createSupplier:", error);
    notifyFail("supplier.create_failed", "Error al crear proveedor", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al crear proveedor" });
  }
};

export const updateSupplier = async (req, res) => {
  try {
    await ensurePeerSyncSchema();
    const row = await Supplier.findByPk(req.params.id);
    if (!row) {
      notifyFail("supplier.update_failed", `Proveedor #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }
    const fields = pickSupplierFields(req.body || {});
    if (fields.name != null && !fields.name) {
      notifyFail("supplier.update_failed", "El nombre del proveedor es obligatorio", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "El nombre del proveedor es obligatorio" });
    }
    // Solo un proveedor por app enlazada
    if (fields.remoteApp) {
      await Supplier.update(
        { remoteApp: null },
        {
          where: {
            remoteApp: fields.remoteApp,
            id: { [Op.ne]: row.id },
          },
        },
      );
    }
    await row.update(fields);
    notifyOk("supplier.updated", `Proveedor #${req.params.id}`, { supplierId: row.id });
    res.json(await serializeSupplierWithLinks(row));
  } catch (error) {
    console.error("updateSupplier:", error);
    notifyFail("supplier.update_failed", `Error al actualizar proveedor #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al actualizar proveedor" });
  }
};

export const deleteSupplier = async (req, res) => {
  try {
    const supplier = await Supplier.findByPk(req.params.id);
    if (!supplier) {
      notifyFail("supplier.delete_failed", `Proveedor #${req.params.id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }
    const orders = await SupplierOrder.count({ where: { supplierId: supplier.id } });
    if (orders > 0) {
      return res.status(400).json({
        message: "Este proveedor tiene compras. No se puede borrar sin quitarlas.",
      });
    }
    await supplier.destroy();
    notifyOk("supplier.deleted", `Proveedor #${req.params.id}`, { supplierId: Number(req.params.id) });
    res.json({ message: "Proveedor eliminado" });
  } catch (error) {
    console.error("deleteSupplier:", error);
    notifyFail("supplier.delete_failed", `Error al eliminar proveedor #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar proveedor" });
  }
};

export const getSupplierAccounts = async (req, res) => {
  try {
    const accounts = await listSupplierLinkedAccounts(req.params.id);
    res.json(accounts);
  } catch (error) {
    console.error("getSupplierAccounts:", error);
    res.status(500).json({ message: "Error al listar cuentas del proveedor" });
  }
};

export const linkSupplierAccountHandler = async (req, res) => {
  try {
    const accountId = Number(req.body?.accountId);
    if (!Number.isFinite(accountId) || accountId <= 0) {
      return res.status(400).json({ message: "accountId es obligatorio" });
    }
    const result = await linkSupplierAccount(req.params.id, accountId);
    res.status(result.created ? 201 : 200).json({
      message: result.created ? "Cuenta vinculada al proveedor" : "La cuenta ya estaba vinculada",
      supplierId: Number(req.params.id),
      accountId,
      linkedAccounts: await listSupplierLinkedAccounts(req.params.id),
    });
  } catch (error) {
    console.error("linkSupplierAccount:", error);
    res.status(error.status || 500).json({ message: error.message || "Error al vincular cuenta" });
  }
};

export const unlinkSupplierAccountHandler = async (req, res) => {
  try {
    const accountId = Number(req.params.accountId);
    await unlinkSupplierAccount(req.params.id, accountId);
    res.json({
      message: "Cuenta desvinculada",
      linkedAccounts: await listSupplierLinkedAccounts(req.params.id),
    });
  } catch (error) {
    console.error("unlinkSupplierAccount:", error);
    res.status(500).json({ message: "Error al desvincular cuenta" });
  }
};

export const generateSupplierPeerSecret = async (req, res) => {
  try {
    await ensurePeerSyncSchema();
    const row = await Supplier.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Proveedor no encontrado" });
    const secret = newPeerSyncSecret();
    await row.update({ remoteSyncSecret: secret });
    res.json({ id: row.id, remoteSyncSecret: secret });
  } catch (error) {
    console.error("generateSupplierPeerSecret:", error);
    res.status(500).json({ message: "Error al generar secreto" });
  }
};
