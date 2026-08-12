// src/middlewares/fileManagerMiddleware.js
// Módulo general para manejar ARCHIVOS dentro de: src/files (carpeta base)
//
// ✅ Funciona para:
// - Subir archivo a una subcarpeta (crea carpetas si no existen)
// - Reemplazar (opcional) un archivo existente
// - Eliminar archivo
// - Recorrer/listar archivos con peso (bytes/KB/MB), fechas, y totales
//
// ⚠️ Seguridad:
// - Bloquea path traversal (..), caracteres raros, rutas absolutas
// - (Opcional) filtra extensiones permitidas
// - (Opcional) limita tamaño
//
// Cómo usar (ejemplo rápido):
//   import { makeFileUpload, deleteFile, scanFiles, deleteFolder } from "../middlewares/fileManagerMiddleware.js";
//   router.post("/files/upload", makeFileUpload({ fieldName:"file" }), controller);
//   router.delete("/files/delete", deleteFile(), controller);
//   router.get("/files/scan", scanFiles(), controller);
//   router.delete("/files/folder", deleteFolder(), controller);
//
// El middleware deja datos en req.fileManager (paths, urls, resultados).

import multer from "multer";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import fileDirName from "../libs/file-dirname.js";

const { __dirname } = fileDirName(import.meta);

// ==============================
// Config base
// ==============================
const FILES_BASE_DIR = path.resolve(__dirname, "../files"); // src/files

// Extensiones permitidas (ajústalas a tu gusto)
const DEFAULT_ALLOWED_EXT = new Set([
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".zip",
  ".rar",
  ".7z",
  ".json",
  ".xml",
  ".md",
  ".apk",
  ".exe", // ⚠️ si no quieres ejecutables, quítalo
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".mp4",
  ".webm",
  ".mov",
  ".m4v",
  ".mp3",
  ".wav",
  ".ogg",
  ".m4a",
  ".aac",
  ".flac",
]);

const DEFAULT_MAX_MB = 25;

// ==============================
// Helpers: seguridad + formato
// ==============================
const toPosix = (p = "") => String(p || "").replace(/\\/g, "/").trim();

const safeRelPath = (rel = "") => {
  const s = toPosix(rel);
  if (!s) return "";
  if (s.includes("..")) throw new Error("Ruta inválida: contiene '..'");
  if (s.startsWith("/") || s.startsWith("~")) throw new Error("Ruta inválida: absoluta");
  // permite letras, números, /, -, _, ., y espacios
  if (!/^[a-zA-Z0-9/._\- ]+$/.test(s)) throw new Error("Ruta inválida: caracteres no permitidos");
  return s;
};

const joinSafe = (base, rel) => {
  const safe = safeRelPath(rel);
  const full = path.resolve(base, safe);
  if (!full.startsWith(base)) throw new Error("Ruta inválida: fuera de la carpeta base");
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
  const ext = path.extname(originalname || "").toLowerCase() || ".bin";
  const stamp = Date.now();
  const rand = Math.random().toString(16).slice(2, 10);
  return `file_${stamp}_${rand}${ext}`;
};

// ==============================
// Helpers: eliminar carpetas vacías hacia arriba
// ==============================
const isSameOrChildOf = (child, parent) => {
  const c = path.resolve(child);
  const p = path.resolve(parent);
  return c === p || c.startsWith(p + path.sep);
};

const cleanupEmptyParents = async (startDir) => {
  let current = path.resolve(startDir);

  while (isSameOrChildOf(current, FILES_BASE_DIR) && current !== FILES_BASE_DIR) {
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

// ==============================
// 1) UPLOAD / REPLACE
// ==============================
// Recibe:
// - folder: subcarpeta dentro de src/files (ej "Orders/123")
// - name: nombre deseado (opcional). Si no, autogenera.
// - replace: "true" para reemplazar si existe
//
// Puedes enviar folder/name/replace por:
// - req.body (form-data)
// - req.query
//
// El archivo va en fieldName (por defecto "file")
export const makeFileUpload = ({
  fieldName = "file",
  allowedExt = DEFAULT_ALLOWED_EXT,
  maxMB = DEFAULT_MAX_MB,

  // resolver la carpeta destino:
  folderResolver = (req) => req.body?.folder || req.query?.folder || "",

  // resolver nombre:
  nameResolver = (req, file) => req.body?.name || req.query?.name || defaultFileName(file?.originalname),

  // si quieres forzar replace en server:
  forceReplace = null, // true/false/null (null = depende de req)

  // si quieres permitir cualquiera:
  allowAllExtensions = false,
} = {}) => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      try {
        const folderRel = safeRelPath(folderResolver(req, file) || "");
        const dest = joinSafe(FILES_BASE_DIR, folderRel);
        ensureDir(dest);

        req.fileManager = req.fileManager || {};
        req.fileManager.baseDir = FILES_BASE_DIR;
        req.fileManager.folderRel = folderRel;
        req.fileManager.destDir = dest;

        cb(null, dest);
      } catch (e) {
        cb(e);
      }
    },
    filename: async (req, file, cb) => {
      try {
        const ext = path.extname(file.originalname || "").toLowerCase();

        if (!allowAllExtensions && allowedExt?.size && !allowedExt.has(ext)) {
          throw new Error(`Extensión no permitida: ${ext}`);
        }

        let fname = String(nameResolver(req, file) || "");
        // si te pasan "reporte" agrega ext del original
        if (!path.extname(fname)) fname += ext || ".bin";
        fname = safeRelPath(fname).split("/").pop(); // solo nombre

        const destDir = req.fileManager?.destDir;
        if (!destDir) throw new Error("Destino no definido");

        const fullPath = path.join(destDir, fname);

        const replace =
          forceReplace === true
            ? true
            : forceReplace === false
              ? false
              : String(req.body?.replace ?? req.query?.replace ?? "false").toLowerCase() === "true";

        if (replace && fs.existsSync(fullPath)) {
          await fsp.unlink(fullPath);
          req.fileManager.replaced = true;
        } else if (!replace && fs.existsSync(fullPath)) {
          throw new Error("El archivo ya existe (usa replace=true para reemplazar)");
        }

        req.fileManager.fileName = fname;
        req.fileManager.fullPath = fullPath;

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
        if (allowAllExtensions) return cb(null, true);

        const ext = path.extname(file.originalname || "").toLowerCase();
        if (allowedExt?.size && !allowedExt.has(ext)) {
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
          message: `Error al subir archivo: ${err.message}`,
        });
      }

      req.fileManager = req.fileManager || {};

      const rel = path
        .join(req.fileManager.folderRel || "", req.fileManager.fileName || "")
        .replace(/\\/g, "/");

      req.fileManager.relativePath = rel;

      // Ayuda: si montas estático:
      // app.use(`/${api}/files`, express.static("src/files"));
      req.fileManager.publicUrl = rel;

      req.fileManager.file = req.file || null;

      next();
    });
  };
};

// ==============================
// 2) DELETE FILE
// ==============================
// Recibe:
// - relPath: ruta relativa dentro de src/files (ej "Orders/123/a.pdf")
export const deleteFile = ({
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

      const full = joinSafe(FILES_BASE_DIR, relPath);

      const st = await fsp.stat(full).catch(() => null);
      if (!st) return res.status(404).json({ ok: false, message: "No existe el archivo" });
      if (st.isDirectory()) {
        return res.status(400).json({ ok: false, message: "relPath apunta a una carpeta" });
      }

      await fsp.unlink(full);

      if (cleanupEmpty) {
        const parentDir = path.dirname(full);
        await cleanupEmptyParents(parentDir);
      }

      req.fileManager = {
        baseDir: FILES_BASE_DIR,
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

// ==============================
// 3) SCAN / LIST FILES
// ==============================
// Recibe:
// - folder: subcarpeta desde donde escanear ("" = todo src/files)
// - maxDepth: límite de profundidad
// - allowedExt: si quieres filtrar (por defecto usa DEFAULT_ALLOWED_EXT)
// - includeAll: si true incluye todo aunque no esté permitido
//
// Devuelve en req.fileScan:
// - files: [{ relPath, name, ext, sizeBytes, sizeHuman, mtime, ctime }]
// - totals: totalFiles, totalSizeBytes, totalSizeHuman
export const scanFiles = ({
  folderResolver = (req) => req.query?.folder || req.body?.folder || "",
  maxDepthResolver = (req) => Number(req.query?.maxDepth ?? 10),
  includeAllResolver = (req) => String(req.query?.includeAll ?? "true").toLowerCase() === "true",
  allowedExt = DEFAULT_ALLOWED_EXT,
} = {}) => {
  const walk = async (rootFull, rootRel, depth, maxDepth, includeAll) => {
    if (depth > maxDepth) return [];

    const entries = await fsp.readdir(rootFull, { withFileTypes: true }).catch(() => []);
    const out = [];

    for (const ent of entries) {
      const full = path.join(rootFull, ent.name);
      const rel = path.join(rootRel, ent.name).replace(/\\/g, "/");

      if (rel.includes("..")) continue;

      if (ent.isDirectory()) {
        out.push(...(await walk(full, rel, depth + 1, maxDepth, includeAll)));
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        const allowed = allowedExt?.has ? allowedExt.has(ext) : true;

        if (!includeAll && !allowed) continue;

        const st = await fsp.stat(full).catch(() => null);
        if (!st) continue;

        out.push({
          relPath: rel,
          name: ent.name,
          ext,
          allowed,
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
      const includeAll = includeAllResolver(req);

      const startFull = joinSafe(FILES_BASE_DIR, folderRel);
      const st = await fsp.stat(startFull).catch(() => null);

      if (!st || !st.isDirectory()) {
        req.fileScan = {
          baseDir: FILES_BASE_DIR,
          folderRel,
          files: [],
          totals: { totalFiles: 0, totalSizeBytes: 0, totalSizeHuman: formatBytes(0) },
        };
        return next();
      }

      const files = await walk(startFull, folderRel, 0, maxDepth, includeAll);
      const totalSizeBytes = files.reduce((acc, f) => acc + (f.sizeBytes || 0), 0);

      req.fileScan = {
        baseDir: FILES_BASE_DIR,
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

// ==============================
// 4) DELETE FOLDER (solo si está vacía, o force)
// ==============================
//
// DELETE /files/folder?folder=Orders/123&force=false
export const deleteFolder = ({
  folderResolver = (req) => req.query?.folder || req.body?.folder || "",
  forceResolver = (req) => String(req.query?.force ?? req.body?.force ?? "false").toLowerCase() === "true",
} = {}) => {
  return async (req, res, next) => {
    try {
      const folderRel = safeRelPath(folderResolver(req) || "");
      if (!folderRel) return res.status(400).json({ ok: false, message: "Falta folder" });

      const full = joinSafe(FILES_BASE_DIR, folderRel);

      const st = await fsp.stat(full).catch(() => null);
      if (!st) return res.status(404).json({ ok: false, message: "No existe la carpeta" });
      if (!st.isDirectory()) return res.status(400).json({ ok: false, message: "folder no es carpeta" });

      const force = forceResolver(req);

      if (!force) {
        const entries = await fsp.readdir(full).catch(() => []);
        if (entries.length > 0) {
          return res.status(400).json({
            ok: false,
            message: "La carpeta no está vacía (usa force=true para borrarla con todo)",
          });
        }
        await fsp.rmdir(full);
      } else {
        await fsp.rm(full, { recursive: true, force: true });
      }

      await cleanupEmptyParents(path.dirname(full));

      req.fileManager = {
        baseDir: FILES_BASE_DIR,
        folderRel,
        fullPath: full,
        deletedFolder: true,
        force,
      };

      next();
    } catch (e) {
      return res.status(400).json({ ok: false, message: `Error al borrar carpeta: ${e.message}` });
    }
  };
};

// ==============================
// 5) Helpers opcionales (útiles para controllers)
// ==============================

// Construye path absoluto seguro dentro de src/files
export const resolveFilePath = (relPath) => joinSafe(FILES_BASE_DIR, relPath);

// Normaliza ruta relativa (para DB)
export const normalizeFileRel = (relPath) => safeRelPath(relPath).replace(/\\/g, "/");
