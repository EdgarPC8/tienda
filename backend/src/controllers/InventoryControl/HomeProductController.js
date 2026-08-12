// controllers/InventoryControl/HomeProductController.js
import { Op } from "sequelize";
import {
  InventoryProduct,
  InventoryUnit,
  InventoryCategory,
  HomeProduct,
} from "../../models/Inventory.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

// controllers/InventoryControl/HomeProductController.js
import { join } from "path";
import fs from "fs";
import fileDirName from "../../libs/file-dirname.js";
import { mediaFolderPrefix } from "../../services/appSettingsService.js";
const { __dirname } = fileDirName(import.meta);

const appImgDir = () => join(__dirname, "../../img", mediaFolderPrefix());

const imagePath = (filename) => join(appImgDir(), filename);

const safeUnlink = (fullPath) => {
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch (e) {
    console.warn("No se pudo borrar archivo:", fullPath, e?.message);
  }
};

// ¿Esta imagen la usan otros registros?
const isImageInUseByOthers = async (filename, currentId = null) => {
  if (!filename) return false;
  const where = currentId ? { imageUrl: filename, id: { [Op.ne]: currentId } } : { imageUrl: filename };
  const count = await HomeProduct.count({ where });
  return count > 0;
};


// GET /api/homeproducts (igual a tu versión, OK)
export const getHomeProducts = async (req, res) => {
  try {
    const {
      section,
      isActive,
      q,
      limit = 50,
      offset = 0,
      withProduct = "true",
      orderBy = "position",
      orderDir = "ASC",
    } = req.query;

    const where = {};
    if (section) where.section = section;
    if (typeof isActive !== "undefined") where.isActive = isActive === "true";

    if (q && q.trim()) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } },
      ];
    }

    const include = [];
    if (withProduct === "true") {
      include.push({
        model: InventoryProduct,
        as: "product",
        include: [
          { model: InventoryUnit, as: "ERP_inventory_unit", required: false },
          { model: InventoryCategory, as: "ERP_inventory_category", required: false },
        ],
      });
    }

    const rows = await HomeProduct.findAll({
      where,
      include,
      limit: Number(limit),
      offset: Number(offset),
      order: [[orderBy, orderDir], ["createdAt", "DESC"]],
    });

    res.status(200).json(rows);
  } catch (error) {
    console.error("Error getHomeProducts:", error);
    res.status(500).json({ message: "Error al obtener Home Products" });
  }
};

export const getHomeProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await HomeProduct.findByPk(id, {
      include: [
        {
          model: InventoryProduct,
          as: "product",
          include: [
            { model: InventoryUnit, as: "ERP_inventory_unit", required: false },
            { model: InventoryCategory, as: "ERP_inventory_category", required: false },
          ],
        },
      ],
    });
    if (!row) return res.status(404).json({ message: "HomeProduct no encontrado" });
    res.status(200).json(row);
  } catch (error) {
    console.error("Error getHomeProductById:", error);
    res.status(500).json({ message: "Error al obtener Home Product" });
  }
};

// create
export const createHomeProduct = async (req, res) => {
    try {
      const {
        productId = null,
        name,
        description = null,
        priceOverride = null,
        section = "home",
        badge = null,
        position = 0,
        isActive = "true",
        createdBy = null,
      } = req.body;
  
      if (!name || !String(name).trim()) {
        notifyFail("home_product.create_failed", "El campo name es obligatorio", { req, httpStatus: 400 });
        return res.status(400).json({ message: "El campo 'name' es obligatorio." });
      }
  
      // Si subieron archivo, úsalo; si no, respeta imageUrl si vino en el body (mantener imagen anterior)
      const imageUrl = req.file?.filename || req.body?.imageUrl || null;
  
      const row = await HomeProduct.create({
        productId: productId ? Number(productId) : null,
        name: String(name).trim(),
        description,
        imageUrl, // 👈 campo del modelo
        priceOverride: priceOverride === "" ? null : Number(priceOverride),
        section,
        badge,
        position: Number(position) || 0,
        isActive: String(isActive) === "true",
        createdBy,
      });
  
      notifyOk("home_product.created", `Producto destacado #${row.id}`, { homeProduct: row });
      res.status(201).json({ message: "Creado", homeProduct: row });
    } catch (error) {
      console.error("Error createHomeProduct:", error);
      notifyFail("home_product.create_failed", "Error al crear Home Product", {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({ message: "Error al crear Home Product" });
    }
  };
  
  export const updateHomeProduct = async (req, res) => {
    try {
      const { id } = req.params;
      const row = await HomeProduct.findByPk(id);
      if (!row) {
        notifyFail("home_product.update_failed", "HomeProduct no encontrado", { req, httpStatus: 404 });
        return res.status(404).json({ message: "No encontrado" });
      }
  
      const {
        productId, name, description, priceOverride,
        section, badge, position, isActive, clearImage // 👈 opcional
      } = req.body;
  
      const updates = {};
  
      if (typeof productId !== "undefined") updates.productId = productId ? Number(productId) : null;
      if (typeof name !== "undefined") {
        if (!String(name).trim()) {
          notifyFail("home_product.update_failed", "Nombre vacío", { req, httpStatus: 400 });
          return res.status(400).json({ message: "Nombre vacío" });
        }
        updates.name = String(name).trim();
      }
      if (typeof description !== "undefined") updates.description = description;
      if (typeof priceOverride !== "undefined") updates.priceOverride = priceOverride === "" ? null : Number(priceOverride);
      if (typeof section !== "undefined") updates.section = section;
      if (typeof badge !== "undefined") updates.badge = badge;
      if (typeof position !== "undefined") updates.position = Number(position) || 0;
      if (typeof isActive !== "undefined") updates.isActive = String(isActive) === "true";
  
      // 1) Si se pidió limpiar imagen explícitamente
      if (String(clearImage) === "true" && row.imageUrl) {
        const used = await isImageInUseByOthers(row.imageUrl, row.id);
        if (!used) safeUnlink(imagePath(row.imageUrl));
        updates.imageUrl = null;
      }
  
      // 2) Si subieron una NUEVA imagen
      if (req.file?.filename) {
        // borrar la anterior si existe y no la usan otros
        if (row.imageUrl) {
          const used = await isImageInUseByOthers(row.imageUrl, row.id);
          if (!used) safeUnlink(imagePath(row.imageUrl));
        }
        updates.imageUrl = req.file.filename;
      } else if (typeof req.body.imageUrl !== "undefined") {
        // mantener o poner null (si vino vacío) sin tocar archivos
        updates.imageUrl = req.body.imageUrl || null;
      }
  
      await row.update(updates);
      notifyOk("home_product.updated", `Producto destacado #${id}`, { homeProduct: row });
      res.status(200).json({ message: "Actualizado", homeProduct: row });
    } catch (error) {
      console.error("Error updateHomeProduct:", error);
      notifyFail("home_product.update_failed", "Error al actualizar Home Product", {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({ message: "Error al actualizar Home Product" });
    }
  };
  
  
  export const deleteHomeProduct = async (req, res) => {
    try {
      const { id } = req.params;
      const row = await HomeProduct.findByPk(id);
      if (!row) {
        notifyFail("home_product.delete_failed", "HomeProduct no encontrado", { req, httpStatus: 404 });
        return res.status(404).json({ message: "HomeProduct no encontrado" });
      }
  
      // antes de borrar el registro, intenta borrar la imagen si no la usan otros
      if (row.imageUrl) {
        const used = await isImageInUseByOthers(row.imageUrl, row.id);
        if (!used) safeUnlink(imagePath(row.imageUrl));
      }
  
      await row.destroy();
      notifyOk("home_product.deleted", `Producto destacado #${id}`, { homeProductId: id });
      res.status(200).json({ message: "HomeProduct eliminado correctamente." });
    } catch (error) {
      console.error("Error deleteHomeProduct:", error);
      notifyFail("home_product.delete_failed", "Error al eliminar Home Product", {
        error,
        req,
        httpStatus: 500,
      });
      res.status(500).json({ message: "Error al eliminar Home Product" });
    }
  };
  