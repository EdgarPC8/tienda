import { Op } from "sequelize";
import { DocumentAttachment, DOCUMENT_ENTITY_TYPES } from "../models/DocumentAttachment.js";
import { verifyJWT, getHeaderToken } from "../libs/jwt.js";
import { makeFileUpload } from "../middlewares/fileManagerMiddleware.js";
import fs from "fs";
import path from "path";
import fileDirName from "../libs/file-dirname.js";
import { mediaSubfolder } from "../services/appSettingsService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

const { __dirname } = fileDirName(import.meta);
const FILES_BASE_DIR = path.resolve(__dirname, "../files");

const VOUCHER_EXT = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp"]);

let documentAttachmentSchemaReady = false;

async function ensureDocumentAttachmentSchema() {
  if (documentAttachmentSchemaReady) return;
  try {
    const { sequelize } = await import("../database/connection.js");
    const [found] = await sequelize.query(
      "SHOW COLUMNS FROM `ERP_document_attachments` LIKE 'invoiceNumber'",
    );
    if (!Array.isArray(found) || found.length === 0) {
      await sequelize.query(
        "ALTER TABLE `ERP_document_attachments` ADD COLUMN `invoiceNumber` VARCHAR(80) NULL",
      );
    }
    documentAttachmentSchemaReady = true;
  } catch (e) {
    console.warn("ensureDocumentAttachmentSchema invoiceNumber:", e?.message || e);
  }
}

function parseLinkExpenseIds(raw) {
  if (!raw) return [];
  try {
    const val = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(val)) return [];
    return val.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0);
  } catch {
    return [];
  }
}

function resolveEntityFolder(entityType, entityId, batchKey) {
  const key = batchKey || (entityId != null ? String(entityId) : "misc");
  return mediaSubfolder("vouchers", entityType, key);
}

export const documentUploadMiddleware = makeFileUpload({
  fieldName: "file",
  folderResolver: (req) => {
    const entityType = String(req.body?.entityType || "movement").trim();
    const entityId = req.body?.entityId;
    const batchKey = req.body?.batchKey;
    return resolveEntityFolder(entityType, entityId, batchKey);
  },
  allowedExt: VOUCHER_EXT,
  maxMB: 10,
});

export const uploadDocument = async (req, res) => {
  try {
    await ensureDocumentAttachmentSchema();
    if (!req.file?.filename) {
      notifyFail("document.upload_failed", "No se recibió ningún archivo", { req, httpStatus: 400 });
      return res.status(400).json({ message: "No se recibió ningún archivo." });
    }

    const entityType = String(req.body?.entityType || "").trim();
    if (!DOCUMENT_ENTITY_TYPES.includes(entityType)) {
      notifyFail("document.upload_failed", "entityType inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "entityType inválido." });
    }

    const entityIdRaw = req.body?.entityId;
    const entityId =
      entityIdRaw != null && entityIdRaw !== "" ? Number(entityIdRaw) : null;
    const batchKey = req.body?.batchKey ? String(req.body.batchKey).trim() : null;
    const label = req.body?.label ? String(req.body.label).trim() : null;
    const invoiceNumber = req.body?.invoiceNumber
      ? String(req.body.invoiceNumber).trim().slice(0, 80)
      : null;

    if (entityType === "movement_batch" && !batchKey) {
      notifyFail("document.upload_failed", "batchKey requerido para movement_batch", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "batchKey requerido para movement_batch." });
    }
    if (entityType !== "movement_batch" && !entityId) {
      notifyFail("document.upload_failed", "entityId requerido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "entityId requerido." });
    }

    const token = getHeaderToken(req);
    const user = await verifyJWT(token);

    const relPath = req.fileManager?.relativePath || req.fileManager?.publicUrl;
    if (!relPath) {
      notifyFail("document.upload_failed", "No se pudo determinar la ruta del archivo", {
        req,
        httpStatus: 500,
      });
      return res.status(500).json({ message: "No se pudo determinar la ruta del archivo." });
    }

    const baseRow = {
      entityType,
      entityId: entityType === "movement_batch" ? null : entityId,
      batchKey: entityType === "movement_batch" ? batchKey : batchKey || null,
      filePath: relPath.replace(/\\/g, "/"),
      originalName: req.file.originalname || req.file.filename,
      mimeType: req.file.mimetype || null,
      sizeBytes: req.file.size ?? null,
      label: label || "Comprobante",
      invoiceNumber: invoiceNumber || null,
      uploadedBy: user.accountId,
    };

    const created = await DocumentAttachment.create(baseRow);

    const linkExpenseIds = parseLinkExpenseIds(req.body?.linkExpenseIds);
    const linked = [];
    for (const expenseId of linkExpenseIds) {
      const row = await DocumentAttachment.create({
        ...baseRow,
        entityType: "expense",
        entityId: expenseId,
        batchKey: null,
        label: label || "Comprobante de compra",
      });
      linked.push(row);
    }

    notifyOk("document.uploaded", "Documento subido", {
      attachmentId: created.id,
      entityType,
    });
    return res.status(201).json({
      message: "Comprobante guardado.",
      attachment: created,
      linkedExpenses: linked,
    });
  } catch (error) {
    console.error("uploadDocument:", error);
    notifyFail("document.upload_failed", "Error al subir comprobante", {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({
      message: error?.message || "Error al subir comprobante",
    });
  }
};

export const listDocuments = async (req, res) => {
  try {
    const { entityType, entityId, batchKey } = req.query;
    if (!entityType) {
      return res.status(400).json({ message: "entityType requerido." });
    }

    const where = { entityType: String(entityType) };
    if (entityType === "movement_batch") {
      if (!batchKey) return res.status(400).json({ message: "batchKey requerido." });
      where.batchKey = String(batchKey);
    } else {
      const id = Number(entityId);
      if (!Number.isFinite(id)) return res.status(400).json({ message: "entityId requerido." });
      where.entityId = id;
    }

    const rows = await DocumentAttachment.findAll({
      where,
      order: [["createdAt", "DESC"]],
    });

    return res.json(rows);
  } catch (error) {
    console.error("listDocuments:", error);
    return res.status(500).json({ message: "Error al listar comprobantes" });
  }
};

export const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const row = await DocumentAttachment.findByPk(id);
    if (!row) {
      notifyFail("document.delete_failed", `Comprobante #${id} no encontrado`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "Comprobante no encontrado." });
    }

    const filePath = row.filePath;
    const others = await DocumentAttachment.count({
      where: { filePath, id: { [Op.ne]: row.id } },
    });

    await row.destroy();

    if (others === 0 && filePath) {
      const abs = path.resolve(FILES_BASE_DIR, filePath);
      if (abs.startsWith(FILES_BASE_DIR) && fs.existsSync(abs)) {
        try {
          fs.unlinkSync(abs);
        } catch (e) {
          console.warn("No se pudo borrar archivo:", abs, e?.message);
        }
      }
    }

    notifyOk("document.deleted", `Documento #${id}`, { attachmentId: id });
    return res.json({ message: "Comprobante eliminado." });
  } catch (error) {
    console.error("deleteDocument:", error);
    notifyFail("document.delete_failed", `Error al eliminar comprobante #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    return res.status(500).json({ message: "Error al eliminar comprobante" });
  }
};
