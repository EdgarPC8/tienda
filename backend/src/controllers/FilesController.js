// src/controllers/FilesController.js
import path from "path";
import fs from "fs";
import archiver from "archiver";
import fileDirName from "../libs/file-dirname.js";
import { notifyOk } from "../services/notifyRaptorSolutions.js";

const { __dirname } = fileDirName(import.meta);
const FILES_BASE_DIR = path.resolve(__dirname, "../files");

// ✅ MISMA seguridad que ImgController
const safeRelPath = (rel = "") => {
  const s = String(rel || "").replace(/\\/g, "/").trim();
  if (s.includes("..")) throw new Error("Ruta inválida");
  if (s.startsWith("/") || s.startsWith("~")) throw new Error("Ruta inválida");
  if (!/^[a-zA-Z0-9/._\- ]*$/.test(s)) throw new Error("Ruta inválida");
  return s;
};

// ==============================
// 1) ZIP de carpeta (descarga)
// ==============================
export const downloadFolderZip = async (req, res) => {
  try {
    const folderRel = safeRelPath(req.query.folder || ""); // "" => todo files
    const folderAbs = path.resolve(FILES_BASE_DIR, folderRel);

    if (!folderAbs.startsWith(FILES_BASE_DIR)) {
      return res.status(400).json({ ok: false, message: "Ruta inválida" });
    }

    if (!fs.existsSync(folderAbs)) {
      return res.status(404).json({ ok: false, message: "Carpeta no existe" });
    }
    if (!fs.statSync(folderAbs).isDirectory()) {
      return res.status(400).json({ ok: false, message: "folder no es una carpeta" });
    }

    const zipName = `${(folderRel || "files").replace(/[\/\\]/g, "_")}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${zipName}"`);

    const archive = archiver("zip", { zlib: { level: 9 } });

    archive.on("error", (err) => {
      console.error("ZIP error:", err);
      if (!res.headersSent) res.status(500).json({ ok: false, message: "Error creando ZIP" });
    });

    archive.pipe(res);

    // mete TODA la carpeta (subcarpetas incluidas)
    archive.directory(folderAbs, folderRel || "files");

    await archive.finalize();
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};

// ==============================
// 2) Upload file
// ==============================
export const uploadFile = async (req, res) => {
  const f = req.fileManager;
  notifyOk("file.uploaded", "Archivo subido", {
    relativePath: f.relativePath,
    fileName: f.fileName,
  });
  return res.json({
    ok: true,
    message: f.replaced ? "Archivo reemplazado correctamente" : "Archivo subido correctamente",
    data: {
      fileName: f.fileName,
      relativePath: f.relativePath,
      folder: f.folderRel,
      size: f.file?.size,
      mimeType: f.file?.mimetype,
      originalName: f.file?.originalname,
    },
  });
};

// ==============================
// 3) Delete file
// ==============================
export const deleteFile = async (req, res) => {
  notifyOk("file.deleted", "Archivo eliminado", { data: req.fileManager });
  return res.json({
    ok: true,
    message: "Archivo eliminado correctamente",
    data: req.fileManager,
  });
};

// ==============================
// 4) Scan files
// ==============================
export const scanFiles = async (req, res) => {
  return res.json({
    ok: true,
    folder: req.fileScan.folderRel,
    totals: req.fileScan.totals,
    files: req.fileScan.files,
  });
};

// ==============================
// 5) Delete folder
// ==============================
export const deleteFolder = async (req, res) => {
  notifyOk("file.deleted", "Carpeta eliminada", { data: req.fileManager });
  return res.json({
    ok: true,
    message: "Carpeta eliminada correctamente",
    data: req.fileManager,
  });
};

// ==============================
// 6) Download 1 file (por relPath)
// ==============================
// GET /files/download?relPath=Orders/123/a.pdf
export const downloadFile = async (req, res) => {
  try {
    const relPath = safeRelPath(req.query.relPath || "");
    if (!relPath) return res.status(400).json({ ok: false, message: "Falta relPath" });

    const abs = path.resolve(FILES_BASE_DIR, relPath);
    if (!abs.startsWith(FILES_BASE_DIR)) {
      return res.status(400).json({ ok: false, message: "Ruta inválida" });
    }

    if (!fs.existsSync(abs)) {
      return res.status(404).json({ ok: false, message: "Archivo no existe" });
    }
    const st = fs.statSync(abs);
    if (!st.isFile()) {
      return res.status(400).json({ ok: false, message: "relPath no es un archivo" });
    }

    // descarga como attachment
    return res.download(abs, path.basename(abs));
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};

// ==============================
// 7) View inline (útil PDFs)
// ==============================
// GET /files/view?relPath=Orders/123/a.pdf
export const viewFileInline = async (req, res) => {
  try {
    const relPath = safeRelPath(req.query.relPath || "");
    if (!relPath) return res.status(400).json({ ok: false, message: "Falta relPath" });

    const abs = path.resolve(FILES_BASE_DIR, relPath);
    if (!abs.startsWith(FILES_BASE_DIR)) {
      return res.status(400).json({ ok: false, message: "Ruta inválida" });
    }

    if (!fs.existsSync(abs)) {
      return res.status(404).json({ ok: false, message: "Archivo no existe" });
    }

    const st = fs.statSync(abs);
    if (!st.isFile()) {
      return res.status(400).json({ ok: false, message: "relPath no es un archivo" });
    }

    // inline
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(abs)}"`);
    return res.sendFile(abs);
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};
