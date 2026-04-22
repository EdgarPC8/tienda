import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMG_PRODUCTS_DIR = path.join(__dirname, "..", "img", "products");
if (!fs.existsSync(IMG_PRODUCTS_DIR)) {
  fs.mkdirSync(IMG_PRODUCTS_DIR, { recursive: true });
}

const slugify = (str = "") =>
  String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, IMG_PRODUCTS_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || ".jpg").toLowerCase();
    const base = req.body?.name?.trim() || file.originalname.replace(ext, "");
    const safe = slugify(base) || "producto";
    const rand = Math.random().toString(36).slice(2, 7);
    const filename = `${safe}-${rand}${ext}`;
    req.uploadInfo = { relPath: `products/${filename}` };
    cb(null, filename);
  },
});

const fileFilter = (_req, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!ok.includes(file.mimetype)) return cb(new Error("Solo imágenes"));
  cb(null, true);
};

export const tiendaUploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
}).single("image");
