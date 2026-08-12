// src/routes/FilesRoutes.js

import { Router } from "express";

import {
  uploadFile,
  deleteFile as deleteFileController,
  scanFiles as scanFilesController,
  deleteFolder as deleteFolderController,
  downloadFolderZip,
  downloadFile,
  viewFileInline,
} from "../controllers/FilesController.js";

import { isAuthenticated } from "../middlewares/authMiddelware.js";

import {
  makeFileUpload,
  deleteFile as deleteFileMiddleware,
  scanFiles,
  deleteFolder,
} from "../middlewares/fileManagerMiddleware.js";

const router = new Router();

// ===============================
// ZIP de carpeta
// GET /eddeliapi/files/download?folder=Orders/123
// ===============================
router.get(
  "/download",
  isAuthenticated,
  downloadFolderZip
);

// ===============================
// SUBIR
// POST /eddeliapi/files/upload
// form-data: file, folder, name?, replace?
// ===============================
router.post(
  "/upload",
  isAuthenticated,
  makeFileUpload({ fieldName: "file" }),
  uploadFile
);

// ===============================
// ELIMINAR ARCHIVO
// DELETE /eddeliapi/files/delete?relPath=Orders/123/a.pdf
// ===============================
router.delete(
  "/delete",
  isAuthenticated,
  deleteFileMiddleware(),
  deleteFileController
);

// ===============================
// ESCANEAR
// GET /eddeliapi/files/scan?folder=Orders&maxDepth=5&includeAll=true
// ===============================
router.get(
  "/scan",
  isAuthenticated,
  scanFiles(),
  scanFilesController
);

// ===============================
// ELIMINAR CARPETA
// DELETE /eddeliapi/files/folder?folder=Orders/123&force=false
// ===============================
router.delete(
  "/folder",
  isAuthenticated,
  deleteFolder(),
  deleteFolderController
);

// ===============================
// DESCARGAR UN ARCHIVO (por relPath)
// GET /eddeliapi/files/file/download?relPath=Orders/123/a.pdf
// ===============================
router.get(
  "/file/download",
  isAuthenticated,
  downloadFile
);

// ===============================
// VER INLINE (PDF, imágenes, etc)
// GET /eddeliapi/files/file/view?relPath=Orders/123/a.pdf
// ===============================
router.get(
  "/file/view",
  isAuthenticated,
  viewFileInline
);

export default router;
