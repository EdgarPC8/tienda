// controllers/InventoryControl/StoresController.js
import { Op } from "sequelize";
import fs from "fs";
import path from "path";
import fsp from "fs/promises";
import fileDirName from "../../libs/file-dirname.js";
import {
  mediaSubfolder,
  getAppSettingsSync,
  isMultiStockEnabled,
} from "../../services/appSettingsService.js";
import { Store, InventoryBatch, StoreProduct } from "../../models/Inventory.js";
import { StoreStock } from "../../models/StoreStock.js";
import { CashRegister } from "../../models/CashRegister.js";
import { CashShift } from "../../models/CashShift.js";
import { RecurringExpenseTemplate } from "../../models/Finance.js";
import { sequelize } from "../../database/connection.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";
import { syncProductStockFromStores } from "../../services/storeStockService.js";

const { __dirname } = fileDirName(import.meta);

// === Config carpeta imágenes ===
// ⚠️ Este controller está en src/controllers/... => para llegar a src/img es ../../img
const IMG_BASE_DIR = path.join(__dirname, "../../img");
const imagePath = (relPath) => path.join(IMG_BASE_DIR, relPath);

const safeUnlink = (fullPath) => {
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    console.warn("No se pudo borrar archivo:", fullPath, e?.message);
  }
};

const normalize = (p = "") =>
  String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");

// ¿La imagen está en uso por otros stores?
const isImageInUseElsewhere = async (filename, currentId = null) => {
  if (!filename) return false;

  const count = await Store.count({
    where: currentId
      ? { imageUrl: filename, id: { [Op.ne]: currentId } }
      : { imageUrl: filename },
  });

  return count > 0;
};

/**
 * POST /inventory/stores
 * multipart/form-data con edDeliUploadSingle
 */
export const createStore = async (req, res) => {
  let tempRelPath = null; // ✅ rollback si falla
  try {
    const payload = { ...req.body };

    // --- normalizaciones numéricas ---
    ["position", "latitude", "longitude"].forEach((k) => {
      if (k in payload && payload[k] !== null && payload[k] !== "") {
        payload[k] = Number(payload[k]);
      }
    });

    // --- booleanos ---
    if ("isActive" in payload) {
      payload.isActive = String(payload.isActive) === "true";
    }
    if ("isVisible" in payload) {
      payload.isVisible = String(payload.isVisible) === "true";
    }
    // Inactivo ⇒ no visible en home/punto de venta
    if (payload.isActive === false) {
      payload.isVisible = false;
    } else if (payload.isVisible == null) {
      payload.isVisible = true;
    }

    const kind = String(payload.locationKind || "vitrina").trim().toLowerCase();
    if (kind === "propia") payload.locationKind = "propia";
    else if (kind === "bodega") payload.locationKind = "bodega";
    else payload.locationKind = "vitrina";

    const padCode = (v, fallback = "001") => {
      const d = String(v ?? "").replace(/\D/g, "").slice(-3);
      return d ? d.padStart(3, "0") : fallback;
    };
    payload.establishmentCode = padCode(payload.establishmentCode, "001");
    payload.emissionPointCode = padCode(payload.emissionPointCode, "001");

    // --- required mínimos ---
    if (!payload.name || !String(payload.name).trim()) {
      notifyFail("store.create_failed", "El campo name es obligatorio", { req, httpStatus: 400 });
      return res.status(400).json({ message: "El campo 'name' es obligatorio." });
    }
    if (!payload.address || !String(payload.address).trim()) {
      notifyFail("store.create_failed", "El campo address es obligatorio", { req, httpStatus: 400 });
      return res.status(400).json({ message: "El campo 'address' es obligatorio." });
    }

    payload.name = String(payload.name).trim();
    payload.address = String(payload.address).trim();

    // ✅ IMAGEN: usar la ruta del input (subfolder) + nombre de archivo
    // Prioridad: subfolder del body (lo que puso el usuario en el form)
    if (req.file?.filename) {
      const subfolder = (req.body.subfolder || mediaSubfolder("stores")).trim().replace(/\/+$/, "");
      tempRelPath = subfolder
        ? `${subfolder}/${req.file.filename}`
        : req.file.filename;
      payload.imageUrl = tempRelPath;
    }

    // ✅ NO guardar subfolder/customFileName en la tabla
    delete payload.subfolder;
    delete payload.customFileName;
    delete payload.moveImage;

    const row = await Store.create(payload);
    if (row.locationKind === "propia") {
      const { ensureDefaultCashRegisters } = await import("../../models/CashRegister.js");
      await ensureDefaultCashRegisters(row);
    }
    notifyOk("store.created", `Local #${row.id}`, { store: row });
    return res.status(201).json({ message: "Creado", store: row });
  } catch (error) {
    // rollback: si subió imagen y falló el create, borra archivo
    if (tempRelPath) safeUnlink(imagePath(tempRelPath));

    console.error("Error createStore:", error);
    notifyFail("store.create_failed", "Error al crear Store", { error, req, httpStatus: 500 });
    return res.status(500).json({ message: "Error al crear Store", error: error?.message || error });
  }
};

/**
 * PUT /inventory/stores/:id
 * multipart/form-data con edDeliUploadSingle
 */
export const updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await Store.findByPk(id);
    if (!row) {
      notifyFail("store.update_failed", `Store #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: "Store no encontrado" });
    }

    const oldRel = normalize(row.imageUrl || "");
    const incomingRel = normalize(req.body.imageUrl || "");
    const updates = { ...req.body };

    let moved = false;

    // ===============================
    // 1️⃣ CASO: se sube imagen nueva (usar subfolder del form)
    // ===============================
    if (req.file?.filename) {
      const subfolder = (req.body.subfolder || mediaSubfolder("stores")).trim().replace(/\/+$/, "");
      const newRel = subfolder
        ? `${subfolder}/${req.file.filename}`
        : req.file.filename;
      updates.imageUrl = newRel;

      // borrar anterior si no está en uso
      if (oldRel && oldRel !== newRel) {
        const used = await isImageInUseElsewhere(oldRel, row.id);
        if (!used) safeUnlink(imagePath(oldRel));
      }
    }

    // =================================================
    // 2️⃣ CASO CLAVE: NO hay archivo, pero cambió la ruta
    // =================================================
    else if (incomingRel && incomingRel !== oldRel) {
      const used = await isImageInUseElsewhere(oldRel, row.id);
      if (used) {
        notifyFail("store.update_failed", "Imagen en uso por otros stores", {
          req,
          httpStatus: 400,
          extra: { storeId: id },
        });
        return res.status(400).json({
          message: "La imagen está siendo usada por otros stores. No se puede mover.",
        });
      }

      const fromAbs = imagePath(oldRel);
      const toAbs = imagePath(incomingRel);

      if (!fs.existsSync(fromAbs)) {
        notifyFail("store.update_failed", "Imagen actual no existe en servidor", {
          req,
          httpStatus: 404,
          extra: { storeId: id },
        });
        return res.status(404).json({
          message: "La imagen actual no existe físicamente en el servidor",
        });
      }

      await fsp.mkdir(path.dirname(toAbs), { recursive: true });
      await fsp.rename(fromAbs, toAbs);

      updates.imageUrl = incomingRel;
      moved = true;
    }

    // ===============================
    // Normalizaciones de campos
    // ===============================
    if ("position" in updates && updates.position !== "" && updates.position != null) {
      updates.position = Number(updates.position);
    }
    if ("latitude" in updates && updates.latitude !== "" && updates.latitude != null) {
      updates.latitude = Number(updates.latitude);
    }
    if ("longitude" in updates && updates.longitude !== "" && updates.longitude != null) {
      updates.longitude = Number(updates.longitude);
    }
    if ("isActive" in updates) {
      updates.isActive = String(updates.isActive) === "true";
    }
    if ("isVisible" in updates) {
      updates.isVisible = String(updates.isVisible) === "true";
    }
    // Inactivo ⇒ forzar no visible (bodega/sucursal apagada no sale en home)
    const nextActive =
      "isActive" in updates ? updates.isActive : row.isActive !== false && row.isActive !== 0;
    if (!nextActive) {
      updates.isVisible = false;
      const principalId = getAppSettingsSync()?.principalStoreId ?? null;
      if (principalId != null && Number(principalId) === Number(id)) {
        notifyFail(
          "store.update_failed",
          "No se puede desactivar el local enlazado en Configuración → Local",
          { req, httpStatus: 409, extra: { storeId: id, reason: "principal_store" } },
        );
        return res.status(409).json({
          message:
            "Este local está enlazado en Configuración → Local (SRI). No se puede desactivar ni ocultar. Cambiá el enlace ahí antes.",
        });
      }
      // Modo un solo local: no dejar el sistema sin ninguna sucursal propia activa
      if (!isMultiStockEnabled()) {
        const otherPropia = await Store.count({
          where: {
            id: { [Op.ne]: id },
            locationKind: "propia",
            isActive: true,
          },
        });
        if (row.locationKind === "propia" && otherPropia === 0) {
          notifyFail(
            "store.update_failed",
            "Debe quedar al menos una sucursal propia activa",
            { req, httpStatus: 409, extra: { storeId: id, reason: "last_propia" } },
          );
          return res.status(409).json({
            message:
              "En modo un solo local debe quedar al menos una sucursal propia activa (turno y caja).",
          });
        }
      }
    }

    // Local enlazado: tampoco permitir solo ocultarlo (isVisible=false) si sigue activo
    if ("isVisible" in updates && updates.isVisible === false) {
      const principalId = getAppSettingsSync()?.principalStoreId ?? null;
      const stayingActive =
        "isActive" in updates ? updates.isActive : row.isActive !== false && row.isActive !== 0;
      if (
        stayingActive &&
        principalId != null &&
        Number(principalId) === Number(id)
      ) {
        notifyFail(
          "store.update_failed",
          "No se puede ocultar el local enlazado en Configuración → Local",
          { req, httpStatus: 409, extra: { storeId: id, reason: "principal_visible" } },
        );
        return res.status(409).json({
          message:
            "El local enlazado en Configuración → Local debe permanecer visible. Los demás sí se pueden ocultar.",
        });
      }
    }

    if ("name" in updates && updates.name != null) updates.name = String(updates.name).trim();
    if ("address" in updates && updates.address != null) updates.address = String(updates.address).trim();

    if ("locationKind" in updates) {
      const kind = String(updates.locationKind || "vitrina").trim().toLowerCase();
      if (kind === "propia") updates.locationKind = "propia";
      else if (kind === "bodega") updates.locationKind = "bodega";
      else updates.locationKind = "vitrina";
    }

    const padCode = (v, fallback = "001") => {
      const d = String(v ?? "").replace(/\D/g, "").slice(-3);
      return d ? d.padStart(3, "0") : fallback;
    };
    if ("establishmentCode" in updates) {
      updates.establishmentCode = padCode(updates.establishmentCode, row.establishmentCode || "001");
    }
    if ("emissionPointCode" in updates) {
      updates.emissionPointCode = padCode(updates.emissionPointCode, row.emissionPointCode || "001");
    }

    // ✅ NO guardar subfolder/customFileName/moveImage
    delete updates.subfolder;
    delete updates.customFileName;
    delete updates.moveImage;

    // ===============================
    // 3️⃣ Actualiza BD
    // ===============================
    await row.update(updates);

    if (row.locationKind === "propia") {
      const { ensureDefaultCashRegisters } = await import("../../models/CashRegister.js");
      await ensureDefaultCashRegisters(row);
    }

    notifyOk("store.updated", `Local #${id}`, { store: row });

    return res.json({
      message: moved ? "Store actualizado y la imagen fue movida" : "Store actualizado",
      store: row,
    });
  } catch (error) {
    console.error("Error updateStore:", error);
    notifyFail("store.update_failed", "Error al actualizar Store", { error, req, httpStatus: 500 });
    return res.status(500).json({ message: "Error al actualizar Store", error: error?.message || error });
  }
};

export const getStores = async (req, res) => {
  try {
    const { isActive, isVisible, kind, locationKind } = req.query;

    const where = {};
    if (isActive === "true" || isActive === true) {
      where.isActive = true;
    } else if (isActive === "false" || isActive === false) {
      where.isActive = false;
    }

    if (isVisible === "true" || isVisible === true) {
      where.isVisible = true;
    } else if (isVisible === "false" || isVisible === false) {
      where.isVisible = false;
    }

    const kindFilter = String(kind || locationKind || "").trim().toLowerCase();
    if (kindFilter === "propia" || kindFilter === "vitrina" || kindFilter === "bodega") {
      where.locationKind = kindFilter;
    }

    const rows = await Store.findAll({
      where: Object.keys(where).length ? where : undefined,
      order: [["position", "ASC"], ["createdAt", "DESC"]],
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener Stores", error });
  }
};

export const getStoreById = async (req, res) => {
  try {
    const row = await Store.findByPk(req.params.id);
    if (!row) return res.status(404).json({ message: "Store no encontrado" });
    res.json(row);
  } catch (error) {
    res.status(500).json({ message: "Error al obtener Store", error });
  }
};

export const deleteStore = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const transferToStoreIdRaw =
      req.body?.transferToStoreId ?? req.query?.transferToStoreId ?? null;
    const transferToStoreId =
      transferToStoreIdRaw != null && transferToStoreIdRaw !== ""
        ? Number(transferToStoreIdRaw)
        : null;

    const row = await Store.findByPk(id);
    if (!row) {
      notifyFail("store.delete_failed", `Store #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: "Store no encontrado" });
    }

    const principalStoreId = getAppSettingsSync()?.principalStoreId ?? null;
    const isPrincipal =
      principalStoreId != null && Number(principalStoreId) === Number(id);

    const [stockRows, stockQty, openShifts, registers, recurring, productsLinked, otherInventory] =
      await Promise.all([
        StoreStock.count({ where: { storeId: id } }),
        StoreStock.sum("quantity", { where: { storeId: id } }),
        CashShift.count({ where: { storeId: id, status: "open" } }),
        CashRegister.count({ where: { storeId: id } }),
        RecurringExpenseTemplate.count({ where: { storeId: id } }),
        StoreProduct.count({ where: { storeId: id } }),
        Store.findAll({
          where: {
            id: { [Op.ne]: id },
            locationKind: { [Op.in]: ["propia", "bodega"] },
            isActive: true,
          },
          attributes: ["id", "name", "locationKind"],
          order: [["id", "ASC"]],
          limit: 20,
        }),
      ]);

    const qty = Number(stockQty) || 0;
    const blockers = [];
    if (isPrincipal) {
      blockers.push({
        code: "principal",
        message:
          "Es el local vinculado a Facturación SRI. Cambialo en Configuración → Local antes de eliminarlo.",
      });
    }
    if (openShifts > 0) {
      blockers.push({
        code: "open_shift",
        message: `Tiene ${openShifts} turno(s) de caja abierto(s). Cerralos primero.`,
      });
    }
    if (qty > 0 && !(Number.isFinite(transferToStoreId) && transferToStoreId > 0)) {
      blockers.push({
        code: "stock",
        message: `Tiene stock (${qty % 1 === 0 ? qty : qty.toFixed(2)} uds). Elegí a qué local pasarlo.`,
      });
    }
    if (otherInventory.length === 0 && (qty > 0 || stockRows > 0)) {
      blockers.push({
        code: "last_inventory",
        message: "No hay otro local activo (propia/bodega) para recibir el stock.",
      });
    }

    // Enlaces informativos (se pueden limpiar al borrar si hay destino o están en 0)
    const links = [];
    if (stockRows > 0) links.push(`${stockRows} fila(s) de stock`);
    if (registers > 0) links.push(`${registers} caja(s) POS`);
    if (recurring > 0) links.push(`${recurring} egreso(s) recurrente(s)`);
    if (productsLinked > 0) links.push(`${productsLinked} producto(s) asignado(s)`);

    if (blockers.length) {
      notifyFail("store.delete_failed", blockers[0].message, {
        req,
        httpStatus: 409,
        extra: { storeId: id, blockers },
      });
      return res.status(409).json({
        message: blockers.map((b) => b.message).join(" "),
        blockers,
        links,
        transferCandidates: otherInventory,
      });
    }

    const targetId =
      Number.isFinite(transferToStoreId) && transferToStoreId > 0
        ? transferToStoreId
        : otherInventory[0]?.id || null;

    if (targetId && Number(targetId) === Number(id)) {
      return res.status(400).json({ message: "El local destino no puede ser el mismo." });
    }

    if (qty > 0 && !targetId) {
      return res.status(409).json({
        message: "Elegí un local destino para pasar el stock antes de eliminar.",
        transferCandidates: otherInventory,
      });
    }

    await sequelize.transaction(async (t) => {
      if (targetId && (qty > 0 || stockRows > 0)) {
        const stocks = await StoreStock.findAll({
          where: { storeId: id },
          transaction: t,
        });
        const touchedProducts = new Set();
        for (const s of stocks) {
          const q = Number(s.quantity) || 0;
          touchedProducts.add(s.productId);
          if (q === 0) {
            await s.destroy({ transaction: t });
            continue;
          }
          const [dest] = await StoreStock.findOrCreate({
            where: { storeId: targetId, productId: s.productId },
            defaults: { quantity: 0 },
            transaction: t,
          });
          await dest.update(
            { quantity: (Number(dest.quantity) || 0) + q },
            { transaction: t },
          );
          await s.destroy({ transaction: t });
        }
        await InventoryBatch.update(
          { storeId: targetId },
          { where: { storeId: id }, transaction: t },
        );
        for (const productId of touchedProducts) {
          await syncProductStockFromStores(productId, { transaction: t });
        }
      } else {
        await StoreStock.destroy({ where: { storeId: id }, transaction: t });
        await InventoryBatch.update(
          { storeId: null },
          { where: { storeId: id }, transaction: t },
        );
      }

      await StoreProduct.destroy({ where: { storeId: id }, transaction: t });
      await CashRegister.destroy({ where: { storeId: id }, transaction: t });
      await RecurringExpenseTemplate.update(
        { storeId: null },
        { where: { storeId: id }, transaction: t },
      );
      // Historial de turnos: soltar FK sin borrar movimientos
      await CashShift.update(
        { storeId: null },
        { where: { storeId: id }, transaction: t },
      );

      if (row.imageUrl) {
        const used = await isImageInUseElsewhere(row.imageUrl, row.id);
        if (!used) safeUnlink(imagePath(row.imageUrl));
      }

      await row.destroy({ transaction: t });
    });

    notifyOk("store.deleted", `Local #${id}`, {
      storeId: id,
      transferToStoreId: targetId || null,
    });
    res.json({
      message: targetId
        ? "Local eliminado. El stock se pasó al local elegido."
        : "Local eliminado",
      transferToStoreId: targetId || null,
    });
  } catch (error) {
    console.error("deleteStore", error);
    const msg =
      error?.original?.sqlMessage ||
      error?.message ||
      "Error al eliminar Store";
    notifyFail("store.delete_failed", `Error al eliminar Store #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({
      message:
        "No se pudo eliminar el local. Puede estar enlazado a stock, turnos o cajas. Probá pasar el stock a otro local o desactivarlo.",
      detail: msg,
    });
  }
};
