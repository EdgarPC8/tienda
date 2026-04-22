import multer from "multer";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const IMG_BASE_DIR = path.resolve(__dirname, "../img");
const DEFAULT_ALLOWED_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
const DEFAULT_MAX_MB = 8;

const toPosix = (p = "") => String(p || "").replace(/\\/g, "/").trim();

const safeRelPath = (rel = "") => {
  const s = toPosix(rel);
  if (!s) return "";
  if (s.includes("..")) throw new Error("Ruta inválida");
  if (s.startsWith("/") || s.startsWith("~")) throw new Error("Ruta inválida");
  if (!/^[a-zA-Z0-9/._\- ]+$/.test(s)) throw new Error("Ruta inválida");
  return s;
};

const joinSafe = (base, rel) => {
  const safe = safeRelPath(rel);
  const full = path.resolve(base, safe);
  if (!full.startsWith(base)) throw new Error("Ruta inválida");
  return full;
};

const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });

const formatBytes = (bytes = 0) => {
  const b = Number(bytes || 0);
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(2)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
};

const defaultFileName = (originalname = "") => {
  const ext = path.extname(originalname || "").toLowerCase() || ".png";
  const stamp = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  return `img_${stamp}_${rand}${ext}`;
};

const isSameOrChildOf = (child, parent) => {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(p + path.sep);
};

const cleanupEmptyParents = async (startDir) => {
  let current = path.resolve(startDir);
  while (isSameOrChildOf(current, IMG_BASE_DIR) && current !== IMG_BASE_DIR) {
    let entries = [];
    try {
      entries = await fsp.readdir(current);
    } catch {
      break;
    }
    if (entries.length > 0) break;
    try {
      await fsp.rmdir(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
};

export const makeImageUpload = ({
  fieldName = "file",
  allowedExt = DEFAULT_ALLOWED_EXT,
  maxMB = DEFAULT_MAX_MB,
  folderResolver = (req) => req.body?.folder || req.query?.folder || "",
  nameResolver = (req, file) =>
    req.body?.name || req.query?.name || defaultFileName(file?.originalname),
  forceReplace = null,
} = {}) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const folderRel = safeRelPath(folderResolver(req, file) || "");
        const dest = joinSafe(IMG_BASE_DIR, folderRel);
        ensureDir(dest);
        req.imageManager = req.imageManager || {};
        req.imageManager.baseDir = IMG_BASE_DIR;
        req.imageManager.folderRel = folderRel;
        req.imageManager.destDir = dest;
        cb(null, dest);
      } catch (e) {
        cb(e);
      }
    },
    filename: async (req, file, cb) => {
      try {
        const ext = path.extname(file.originalname || "").toLowerCase();
        if (allowedExt && allowedExt.size && !allowedExt.has(ext)) {
          throw new Error(`Extensión no permitida: ${ext}`);
        }
        let fname = String(nameResolver(req, file) || "");
        if (!path.extname(fname)) fname += ext || ".png";
        fname = safeRelPath(fname).split("/").pop();
        const destDir = req.imageManager?.destDir;
        if (!destDir) throw new Error("Destino no definido");
        const fullPath = path.join(destDir, fname);
        const replace =
          forceReplace === true
            ? true
            : forceReplace === false
              ? false
              : String(req.body?.replace ?? req.query?.replace ?? "false").toLowerCase() ===
                "true";
        if (replace && fs.existsSync(fullPath)) {
          await fsp.unlink(fullPath);
          req.imageManager.replaced = true;
        } else if (!replace && fs.existsSync(fullPath)) {
          throw new Error("El archivo ya existe (usa replace=true para reemplazar)");
        }
        req.imageManager.fileName = fname;
        req.imageManager.fullPath = fullPath;
        cb(null, fname);
      } catch (e) {
        cb(e);
      }
    },
  });

  const upload = multer({
    storage,
    limits: { fileSize: maxMB * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      try {
        const ext = path.extname(file.originalname || "").toLowerCase();
        if (allowedExt && allowedExt.size && !allowedExt.has(ext)) {
          return cb(new Error(`Extensión no permitida: ${ext}`));
        }
        cb(null, true);
      } catch (e) {
        cb(e);
      }
    },
  }).single(fieldName);

  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          ok: false,
          message: `Error al subir imagen: ${err.message}`,
        });
      }
      req.imageManager = req.imageManager || {};
      const rel = path
        .join(req.imageManager.folderRel || "", req.imageManager.fileName || "")
        .replace(/\\/g, "/");
      req.imageManager.relativePath = rel;
      req.imageManager.publicUrl = rel;
      req.imageManager.file = req.file || null;
      next();
    });
  };
};

export const deleteImage = ({
  relPathResolver = (req) =>
    req.body?.relPath || req.query?.relPath || req.params?.relPath || "",
  cleanupEmpty = true,
} = {}) => {
  return async (req, res, next) => {
    try {
      const relPath = safeRelPath(relPathResolver(req) || "");
      if (!relPath) {
        return res.status(400).json({ ok: false, message: "Falta relPath" });
      }
      const full = joinSafe(IMG_BASE_DIR, relPath);
      const st = await fsp.stat(full).catch(() => null);
      if (!st) return res.status(404).json({ ok: false, message: "No existe el archivo" });
      if (st.isDirectory()) {
        return res.status(400).json({ ok: false, message: "relPath apunta a una carpeta" });
      }
      await fsp.unlink(full);
      if (cleanupEmpty) {
        await cleanupEmptyParents(path.dirname(full));
      }
      req.imageManager = {
        baseDir: IMG_BASE_DIR,
        deleted: true,
        relativePath: relPath,
        fullPath: full,
      };
      next();
    } catch (e) {
      return res.status(400).json({ ok: false, message: `Error al eliminar: ${e.message}` });
    }
  };
};

export const scanImages = ({
  folderResolver = (req) => req.query?.folder || req.body?.folder || "",
  maxDepthResolver = (req) => Number(req.query?.maxDepth ?? 10),
  includeNonImagesResolver = (req) =>
    String(req.query?.includeNonImages ?? "false").toLowerCase() === "true",
  allowedExt = DEFAULT_ALLOWED_EXT,
} = {}) => {
  const walk = async (rootFull, rootRel, depth, maxDepth, includeNonImages) => {
    if (depth > maxDepth) return [];
    const entries = await fsp.readdir(rootFull, { withFileTypes: true }).catch(() => []);
    const out = [];
    for (const ent of entries) {
      const full = path.join(rootFull, ent.name);
      const rel = path.join(rootRel, ent.name).replace(/\\/g, "/");
      if (rel.includes("..")) continue;
      if (ent.isDirectory()) {
        out.push(...(await walk(full, rel, depth + 1, maxDepth, includeNonImages)));
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        const isImg = allowedExt?.has ? allowedExt.has(ext) : true;
        if (!includeNonImages && !isImg) continue;
        const st = await fsp.stat(full).catch(() => null);
        if (!st) continue;
        out.push({
          relPath: rel,
          name: ent.name,
          ext,
          isImage: isImg,
          sizeBytes: st.size,
          sizeHuman: formatBytes(st.size),
          mtime: st.mtime,
          ctime: st.ctime,
        });
      }
    }
    return out;
  };

  return async (req, res, next) => {
    try {
      const folderRel = safeRelPath(folderResolver(req) || "");
      const maxDepth = Math.max(0, Math.min(50, maxDepthResolver(req)));
      const includeNonImages = includeNonImagesResolver(req);
      const startFull = joinSafe(IMG_BASE_DIR, folderRel);
      const st = await fsp.stat(startFull).catch(() => null);
      if (!st || !st.isDirectory()) {
        req.imageScan = {
          baseDir: IMG_BASE_DIR,
          folderRel,
          files: [],
          totals: { totalFiles: 0, totalSizeBytes: 0, totalSizeHuman: formatBytes(0) },
        };
        return next();
      }
      const files = await walk(startFull, folderRel, 0, maxDepth, includeNonImages);
      const totalSizeBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);
      req.imageScan = {
        baseDir: IMG_BASE_DIR,
        folderRel,
        files,
        totals: {
          totalFiles: files.length,
          totalSizeBytes,
          totalSizeHuman: formatBytes(totalSizeBytes),
        },
      };
      next();
    } catch (e) {
      return res.status(400).json({ ok: false, message: `Error al escanear: ${e.message}` });
    }
  };
};

export const deleteFolder = ({
  folderResolver = (req) => req.query?.folder || req.body?.folder || "",
  forceResolver = (req) =>
    String(req.query?.force ?? req.body?.force ?? "false").toLowerCase() === "true",
} = {}) => {
  return async (req, res, next) => {
    try {
      const folderRel = safeRelPath(folderResolver(req) || "");
      if (!folderRel) return res.status(400).json({ ok: false, message: "Falta folder" });
      const full = joinSafe(IMG_BASE_DIR, folderRel);
      const st = await fsp.stat(full).catch(() => null);
      if (!st) return res.status(404).json({ ok: false, message: "No existe la carpeta" });
      if (!st.isDirectory()) {
        return res.status(400).json({ ok: false, message: "folder no es una carpeta" });
      }
      const force = forceResolver(req);
      if (!force) {
        const entries = await fsp.readdir(full).catch(() => []);
        if (entries.length > 0) {
          return res.status(400).json({
            ok: false,
            message: "La carpeta no está vacía (usa force=true)",
          });
        }
        await fsp.rmdir(full);
      } else {
        await fsp.rm(full, { recursive: true, force: true });
      }
      req.imageManager = {
        baseDir: IMG_BASE_DIR,
        folderRel,
        fullPath: full,
        deletedFolder: true,
        force,
      };
      next();
    } catch (e) {
      return res
        .status(400)
        .json({ ok: false, message: `Error al borrar carpeta: ${e.message}` });
    }
  };
};
