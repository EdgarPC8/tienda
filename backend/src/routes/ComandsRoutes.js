import { Router } from "express";
import {
  getLogs,
  deleteLogs,
  deleteLogById,
  createLicense,
  reloadBdController,
  uploadBackupController,
  saveBackupController,
  listBackupsController,
  setMainBackupController,
  deleteStoredBackupController,
  pruneStoredBackupsController,
  downloadStoredBackupController,
  downloadMainBackupController,
  getPanelStatsController,
} from "../controllers/ComandsController.js";
import { downloadBackup } from "../database/insertData.js";
import {
  isAuthenticated,
  requireProgrammer,
  requireAdminOrProgrammer,
} from "../middlewares/authMiddelware.js";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

/**
 * Rutas destructivas / sensibles: login + rol Programador.
 * Antes upload-backup estaba público → cualquiera podía subir un backup.json.
 */
router.get("/createLicense", isAuthenticated, requireProgrammer, createLicense);
router.get("/getLogs", isAuthenticated, requireAdminOrProgrammer, getLogs);
router.delete("/logs", isAuthenticated, requireProgrammer, deleteLogs);
router.delete("/logs/:id", isAuthenticated, requireProgrammer, deleteLogById);
router.get("/panel-stats", isAuthenticated, requireAdminOrProgrammer, getPanelStatsController);
router.get("/saveBackup", isAuthenticated, requireAdminOrProgrammer, saveBackupController);
router.get("/downloadBackup", isAuthenticated, requireProgrammer, downloadBackup);
router.get("/backups", isAuthenticated, requireProgrammer, listBackupsController);
router.get("/backups/main/download", isAuthenticated, requireProgrammer, downloadMainBackupController);
router.get("/backups/stored/:filename/download", isAuthenticated, requireProgrammer, downloadStoredBackupController);
router.post("/backups/stored/:filename/set-main", isAuthenticated, requireProgrammer, setMainBackupController);
router.delete("/backups/stored/:filename", isAuthenticated, requireProgrammer, deleteStoredBackupController);
router.post(
  "/backups/stored/prune-and-save",
  isAuthenticated,
  requireProgrammer,
  pruneStoredBackupsController,
);
router.get("/reloadBD", isAuthenticated, requireProgrammer, reloadBdController);
router.post(
  "/upload-backup",
  isAuthenticated,
  requireProgrammer,
  upload.single("backup"),
  uploadBackupController,
);

export default router;
