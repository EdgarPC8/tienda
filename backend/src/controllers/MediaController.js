/**
 * API escalable de medios (video, audio) — subida y catálogo.
 */
import path from "path";
import { MediaAsset } from "../models/MediaAsset.js";
import { makeFileUpload } from "../middlewares/fileManagerMiddleware.js";
import {
  AUDIO_EXT,
  VIDEO_EXT,
  buildMediaCatalog,
  inferMediaTypeFromFilename,
} from "../services/mediaCatalogService.js";
import { mediaSubfolder } from "../services/appSettingsService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

const MEDIA_EXT = new Set([...VIDEO_EXT, ...AUDIO_EXT]);

export const mediaUploadMiddleware = makeFileUpload({
  fieldName: "file",
  allowedExt: MEDIA_EXT,
  maxMB: 150,
  folderResolver: (req) => {
    const mediaType = String(req.body?.mediaType || req.query?.mediaType || "").toLowerCase();
    if (mediaType === "audio") return req.body?.folder || mediaSubfolder("audio");
    if (mediaType === "video") return req.body?.folder || mediaSubfolder("videos");
    return req.body?.folder || mediaSubfolder("media");
  },
});

function assetToJson(row) {
  const j = row.toJSON ? row.toJSON() : row;
  return {
    id: j.id,
    module: j.module,
    mediaType: j.mediaType,
    title: j.title,
    relativePath: j.relativePath,
    mediaPath: j.relativePath,
    storage: j.storage,
    folder: j.folder,
    durationSeconds: j.durationSeconds,
    mimeType: j.mimeType,
    sizeBytes: j.sizeBytes,
    metadata: j.metadata,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
}

export const getMediaCatalog = async (req, res) => {
  try {
    const module = req.query.module ? String(req.query.module) : undefined;
    const mediaType = req.query.mediaType ? String(req.query.mediaType) : undefined;
    const catalog = await buildMediaCatalog({ module, mediaType });
    res.json(catalog);
  } catch (error) {
    console.error("getMediaCatalog:", error);
    res.status(500).json({ message: "Error al listar medios", error: error.message });
  }
};

export const uploadMedia = async (req, res) => {
  try {
    const f = req.fileManager;
    if (!f?.relativePath) {
      notifyFail("media.upload_failed", "No se recibió archivo", { req, httpStatus: 400 });
      return res.status(400).json({ message: "No se recibió archivo" });
    }

    const inferred = inferMediaTypeFromFilename(f.fileName);
    const mediaType = String(req.body?.mediaType || inferred || "").toLowerCase();
    if (!mediaType || !["video", "audio"].includes(mediaType)) {
      notifyFail("media.upload_failed", "Tipo de medio inválido (video o audio)", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Tipo de medio inválido (video o audio)" });
    }

    const ext = path.extname(f.fileName).toLowerCase();
    const allowed = mediaType === "video" ? VIDEO_EXT : AUDIO_EXT;
    if (!allowed.has(ext)) {
      notifyFail("media.upload_failed", `Extensión no permitida para ${mediaType}`, {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: `Extensión no permitida para ${mediaType}` });
    }

    const module = String(req.body?.module || "general").slice(0, 64);
    const title = String(req.body?.title || f.fileName).trim().slice(0, 200);
    const durationRaw = req.body?.durationSeconds;
    const durationSeconds =
      durationRaw != null && Number.isFinite(Number(durationRaw))
        ? Math.max(1, Math.round(Number(durationRaw)))
        : null;

    let row = await MediaAsset.findOne({ where: { relativePath: f.relativePath } });
    const payload = {
      module,
      mediaType,
      title,
      relativePath: f.relativePath,
      storage: "files",
      folder: f.folder || null,
      durationSeconds,
        mimeType: req.file?.mimetype || null,
        sizeBytes: req.file?.size || null,
      metadata: { originalName: f.fileName },
    };
    if (row) {
      await row.update(payload);
    } else {
      row = await MediaAsset.create(payload);
    }

    notifyOk("media.uploaded", "Medio subido", { mediaId: row.id, relativePath: f.relativePath });
    res.status(201).json({
      ok: true,
      data: assetToJson(row),
      url: f.publicUrl,
      relativePath: f.relativePath,
    });
  } catch (error) {
    console.error("uploadMedia:", error);
    notifyFail("media.upload_failed", "Error al subir medio", { error, req, httpStatus: 500 });
    res.status(500).json({ message: "Error al subir medio", error: error.message });
  }
};

export const deleteMediaAsset = async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      notifyFail("media.delete_failed", "ID inválido", { req, httpStatus: 400 });
      return res.status(400).json({ message: "ID inválido" });
    }
    const row = await MediaAsset.findByPk(id);
    if (!row) {
      notifyFail("media.delete_failed", `Medio #${id} no encontrado`, { req, httpStatus: 404 });
      return res.status(404).json({ message: "Medio no encontrado" });
    }
    await row.destroy();
    notifyOk("media.deleted", `Medio #${id}`, { mediaId: id });
    res.json({ ok: true });
  } catch (error) {
    console.error("deleteMediaAsset:", error);
    notifyFail("media.delete_failed", `Error al eliminar medio #${req.params.id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "Error al eliminar medio", error: error.message });
  }
};
