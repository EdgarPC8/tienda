// src/controllers/ImgController.js


// src/controllers/ImgController.js
import path from "path";
import fs from "fs";
import archiver from "archiver";
import fileDirName from "../libs/file-dirname.js";
import { notifyOk } from "../services/notifyRaptorSolutions.js";

const { __dirname } = fileDirName(import.meta);
const IMG_BASE_DIR = path.resolve(__dirname, "../img");

const safeRelPath = (rel = "") => {
  const s = String(rel || "").replace(/\\/g, "/").trim();
  if (!s) return "";
  if (s.includes("\0")) throw new Error("Ruta inválida");
  if (s.split("/").some((seg) => seg === "..")) {
    throw new Error("Ruta inválida: contiene '..'");
  }
  if (s.startsWith("/") || s.startsWith("~")) throw new Error("Ruta inválida: absoluta");
  if (/[<>:"|?*\\]/.test(s)) throw new Error("Ruta inválida: caracteres no permitidos");
  return s;
};

export const downloadFolderZip = async (req, res) => {
  try {
    const folderRel = safeRelPath(req.query.folder || ""); // "" => todo img
    const folderAbs = path.resolve(IMG_BASE_DIR, folderRel);

    if (!folderAbs.startsWith(IMG_BASE_DIR)) {
      return res.status(400).json({ ok: false, message: "Ruta inválida" });
    }

    if (!fs.existsSync(folderAbs)) {
      return res.status(404).json({ ok: false, message: "Carpeta no existe" });
    }
    if (!fs.statSync(folderAbs).isDirectory()) {
      return res.status(400).json({ ok: false, message: "folder no es una carpeta" });
    }

    const zipName = `${(folderRel || "img").replace(/[\/\\]/g, "_")}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("ZIP error:", err);
      if (!res.headersSent) res.status(500).json({ ok: false, message: "Error creando ZIP" });
    });

    archive.pipe(res);

    // mete TODA la carpeta (subcarpetas incluidas)
    archive.directory(folderAbs, folderRel || "img");

    await archive.finalize();
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};


export const uploadImage = async (req, res) => {
    const img = req.imageManager;
    notifyOk("image.uploaded", "Imagen subida", {
      relativePath: img.relativePath,
      fileName: img.fileName,
    });
    return res.json({
      ok: true,
      message: img.replaced
        ? "Imagen reemplazada correctamente"
        : "Imagen subida correctamente",
      data: {
        fileName: img.fileName,
        relativePath: img.relativePath,
        folder: img.folderRel,
        size: img.file?.size,
      },
    });
  };
  
  export const deleteImage = async (req, res) => {
    notifyOk("image.deleted", "Imagen eliminada", { data: req.imageManager });
    return res.json({
      ok: true,
      message: "Imagen eliminada correctamente",
      data: req.imageManager,
    });
  };
  
  export const scanImages = async (req, res) => {
    return res.json({
      ok: true,
      folder: req.imageScan.folderRel,
      folders: req.imageScan.folders || [],
      totals: req.imageScan.totals,
      files: req.imageScan.files,
    });
  };

/** POST body: { paths: string[] } → cuáles ya existen bajo src/img */
export const checkImagesExist = async (req, res) => {
  try {
    const raw = Array.isArray(req.body?.paths) ? req.body.paths : [];
    const existing = [];
    const missing = [];
    const invalid = [];

    for (const item of raw) {
      try {
        const rel = safeRelPath(item);
        if (!rel) {
          invalid.push(String(item || ""));
          continue;
        }
        const abs = path.resolve(IMG_BASE_DIR, rel);
        if (!abs.startsWith(IMG_BASE_DIR)) {
          invalid.push(rel);
          continue;
        }
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) existing.push(rel);
        else missing.push(rel);
      } catch {
        invalid.push(String(item || ""));
      }
    }

    return res.json({
      ok: true,
      existing,
      missing,
      invalid,
      totals: {
        existing: existing.length,
        missing: missing.length,
        invalid: invalid.length,
      },
    });
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};
  