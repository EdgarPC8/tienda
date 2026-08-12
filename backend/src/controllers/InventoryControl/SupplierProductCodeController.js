import { Supplier, SupplierProductCode } from "../../models/Orders.js";
import { InventoryProduct } from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

let schemaReady = false;

async function ensureSchema() {
  if (schemaReady) return;
  await SupplierProductCode.sync();
  schemaReady = true;
}

function normalizeSupplierCode(raw) {
  return String(raw ?? "").trim();
}

function codeKey(raw) {
  return normalizeSupplierCode(raw).toLowerCase();
}

export const listSupplierProductCodes = async (req, res) => {
  try {
    await ensureSchema();
    const supplierId = Number(req.query.supplierId);
    if (!supplierId) {
      return res.status(400).json({ message: "supplierId es obligatorio" });
    }
    const rows = await SupplierProductCode.findAll({
      where: { supplierId },
      include: [
        {
          model: InventoryProduct,
          as: "ERP_inventory_product",
          attributes: ["id", "name", "sku", "barcode"],
        },
      ],
      order: [["supplierCode", "ASC"]],
    });
    res.json({ codes: rows });
  } catch (error) {
    console.error("listSupplierProductCodes:", error);
    res.status(500).json({ message: "Error al listar códigos de proveedor" });
  }
};

/**
 * Resuelve productId por código del proveedor (principal o auxiliar).
 * GET ?supplierId=&code=
 */
export const resolveSupplierProductCode = async (req, res) => {
  try {
    await ensureSchema();
    const supplierId = Number(req.query.supplierId);
    const code = normalizeSupplierCode(req.query.code);
    if (!supplierId || !code) {
      return res.status(400).json({ message: "supplierId y code son obligatorios" });
    }
    const rows = await SupplierProductCode.findAll({ where: { supplierId } });
    const hit = rows.find((r) => codeKey(r.supplierCode) === codeKey(code));
    if (!hit) return res.json({ productId: null, mapping: null });
    res.json({ productId: hit.productId, mapping: hit });
  } catch (error) {
    console.error("resolveSupplierProductCode:", error);
    res.status(500).json({ message: "Error al resolver código de proveedor" });
  }
};

/**
 * Crea o actualiza: (supplierId, supplierCode) → productId
 * Body: { supplierId, supplierCode, productId, notes? }
 * También acepta items: [{ supplierCode, productId }, ...]
 */
export const upsertSupplierProductCodes = async (req, res) => {
  try {
    await ensureSchema();
    const body = req.body || {};
    const supplierId = Number(body.supplierId);
    if (!supplierId) {
      notifyFail("supplier_product_code.upsert_failed", "supplierId obligatorio", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "supplierId es obligatorio" });
    }

    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      return res.status(404).json({ message: "Proveedor no encontrado" });
    }

    let items = Array.isArray(body.items) ? body.items : null;
    if (!items) {
      items = [
        {
          supplierCode: body.supplierCode,
          productId: body.productId,
          notes: body.notes,
        },
      ];
    }

    const saved = [];
    for (const it of items) {
      const supplierCode = normalizeSupplierCode(it.supplierCode);
      const productId = Number(it.productId);
      if (!supplierCode || !productId) continue;

      const product = await InventoryProduct.findByPk(productId);
      if (!product) continue;

      const existing = await SupplierProductCode.findAll({ where: { supplierId } });
      const hit = existing.find((r) => codeKey(r.supplierCode) === codeKey(supplierCode));

      let row;
      if (hit) {
        await hit.update({
          productId,
          supplierCode,
          ...(it.notes !== undefined ? { notes: it.notes || null } : {}),
        });
        row = hit;
      } else {
        row = await SupplierProductCode.create({
          supplierId,
          productId,
          supplierCode,
          notes: it.notes || null,
        });
      }
      saved.push(row);
    }

    notifyOk("supplier_product_code.upserted", `Códigos proveedor #${supplierId}`, {
      supplierId,
      count: saved.length,
    });
    res.json({ ok: true, codes: saved });
  } catch (error) {
    console.error("upsertSupplierProductCodes:", error);
    notifyFail("supplier_product_code.upsert_failed", "Error al guardar códigos", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al guardar códigos de proveedor" });
  }
};

export const deleteSupplierProductCode = async (req, res) => {
  try {
    await ensureSchema();
    const id = Number(req.params.id);
    const deleted = await SupplierProductCode.destroy({ where: { id } });
    if (!deleted) {
      return res.status(404).json({ message: "Mapeo no encontrado" });
    }
    notifyOk("supplier_product_code.deleted", `Código proveedor #${id}`, { id });
    res.json({ ok: true });
  } catch (error) {
    console.error("deleteSupplierProductCode:", error);
    res.status(500).json({ message: "Error al eliminar código de proveedor" });
  }
};

/** Utilidad: mapa codeLower → productId para un proveedor */
export async function loadSupplierCodeMap(supplierId) {
  await ensureSchema();
  const sid = Number(supplierId);
  if (!sid) return new Map();
  const rows = await SupplierProductCode.findAll({ where: { supplierId: sid } });
  const map = new Map();
  for (const r of rows) {
    map.set(codeKey(r.supplierCode), Number(r.productId));
  }
  return map;
}
