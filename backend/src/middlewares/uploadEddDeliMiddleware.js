// src/middlewares/uploadEdDeliMiddleware.js
import multer from "multer";
import path from "path";
import fs from "fs";
import fileDirName from "../libs/file-dirname.js";
import { mediaSubfolder } from "../services/appSettingsService.js";

const { __dirname } = fileDirName(import.meta);

// ✅ Base REAL y ÚNICA: src/img
const IMG_BASE_DIR = path.join(__dirname, "../img");

if (!fs.existsSync(IMG_BASE_DIR)) {
  fs.mkdirSync(IMG_BASE_DIR, { recursive: true });
}

const slugify = (str = "") =>
  String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ✅ seguridad: permite "EdDeli", "EdDeli/products", "products", etc.
const safeSubfolder = (p = "") => {
  const s = String(p || "").replace(/\\/g, "/").trim();

  if (!s) return "";

  // no permitir traversal o rutas absolutas
  if (s.includes("..")) throw new Error("Subcarpeta inválida");
  if (s.startsWith("/") || s.startsWith("~")) throw new Error("Subcarpeta inválida");

  // limpia dobles slashes
  const cleaned = s.replace(/\/{2,}/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");

  // solo caracteres seguros
  if (!/^[a-zA-Z0-9/_-]+$/.test(cleaned)) throw new Error("Subcarpeta inválida");

  return cleaned;
};

// ✅ Puedes mandar la subcarpeta por body o query:
// - body.subfolder = ""                => guarda en src/img
// - body.subfolder = "EdDeli/stores"   => guarda en src/img/EdDeli/stores
// Si no viene subfolder, por defecto "EdDeli/stores" para stores
const resolveDestination = (req) => {
  const raw = String(req.body?.subfolder ?? req.query?.subfolder ?? "").trim();
  const sub = raw ? safeSubfolder(raw) : mediaSubfolder("stores");
  const dest = path.join(IMG_BASE_DIR, sub);
  fs.mkdirSync(dest, { recursive: true });
  return { dest, sub };
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const { dest, sub } = resolveDestination(req);

      // info útil para controllers (guardar en BD)
      req.uploadInfo = req.uploadInfo || {};
      req.uploadInfo.subfolder = sub; // ej: "EdDeli/products" o ""
      req.uploadInfo.destDir = dest;

      cb(null, dest);
    } catch (e) {
      cb(e);
    }
  },

  filename: (req, file, cb) => {
    try {
      // ✅ extensión en minúsculas
      const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();

      // nombre base preferido
      const base =
        req.body?.customFileName?.trim() ||
        req.body?.name?.trim() ||
        file.originalname.replace(ext, "");

      const safe = slugify(base) || "image";
      const rand = Math.random().toString(36).slice(2, 7);
      const filename = `${safe}-${rand}${ext}`;

      // ✅ relPath EXACTO para BD:
      // - si subfolder="" => "image-abc12.jpg"
      // - si subfolder="EdDeli/products" => "EdDeli/products/image-abc12.jpg"
      const sub = req.uploadInfo?.subfolder ? `${req.uploadInfo.subfolder}/` : "";

      req.uploadInfo = req.uploadInfo || {};
      req.uploadInfo.fileName = filename;
      req.uploadInfo.relPath = `${sub}${filename}`; // 👈 esto es lo que guardas en BD

      cb(null, filename);
    } catch (e) {
      cb(e);
    }
  },
});

const fileFilter = (req, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!ok.includes(file.mimetype)) return cb(new Error("Solo imágenes"));
  cb(null, true);
};

export const edDeliUploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
}).single("image"); // field form-data: "image"
