import path from "path";
import fs from "fs";
import archiver from "archiver";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMG_BASE_DIR = path.resolve(__dirname, "../img");

const safeRelPath = (rel = "") => {
  const s = String(rel || "").replace(/\\/g, "/").trim();
  if (s.includes("..")) throw new Error("Ruta inválida");
  if (s.startsWith("/") || s.startsWith("~")) throw new Error("Ruta inválida");
  if (!/^[a-zA-Z0-9/._\- ]*$/.test(s)) throw new Error("Ruta inválida");
  return s;
};

export const downloadFolderZip = async (req, res) => {
  try {
    const folderRel = safeRelPath(req.query.folder || "");
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
    archive.on("error", () => {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, message: "Error creando ZIP" });
      }
    });
    archive.pipe(res);
    archive.directory(folderAbs, folderRel || "img");
    await archive.finalize();
  } catch (e) {
    return res.status(400).json({ ok: false, message: e.message });
  }
};

export const uploadImage = async (req, res) => {
  const img = req.imageManager;
  return res.json({
    ok: true,
    message: img.replaced ? "Imagen reemplazada correctamente" : "Imagen subida correctamente",
    data: {
      fileName: img.fileName,
      relativePath: img.relativePath,
      folder: img.folderRel,
      size: img.file?.size,
    },
  });
};

export const deleteImage = async (req, res) => {
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
    totals: req.imageScan.totals,
    files: req.imageScan.files,
  });
};
