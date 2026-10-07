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
  requireOwnerOrProgrammer,
  requireLogsAccess,
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
 * Desarrollador (Programador): logs, reload BD, licencias.
 * Backups JSON: Propietario (Configuración) o Programador (menú Desarrollador).
 * Panel: Admin / Propietario / Programador.
 */
router.get("/createLicense", isAuthenticated, requireProgrammer, createLicense);
router.get("/getLogs", isAuthenticated, requireLogsAccess, getLogs);
router.delete("/logs", isAuthenticated, requireProgrammer, deleteLogs);
router.delete("/logs/:id", isAuthenticated, requireProgrammer, deleteLogById);
router.get("/panel-stats", isAuthenticated, requireAdminOrProgrammer, getPanelStatsController);
router.get("/saveBackup", isAuthenticated, requireAdminOrProgrammer, saveBackupController);
router.get("/downloadBackup", isAuthenticated, requireOwnerOrProgrammer, downloadBackup);
router.get("/backups", isAuthenticated, requireOwnerOrProgrammer, listBackupsController);
router.get("/backups/main/download", isAuthenticated, requireOwnerOrProgrammer, downloadMainBackupController);
router.get(
  "/backups/stored/:filename/download",
  isAuthenticated,
  requireOwnerOrProgrammer,
  downloadStoredBackupController,
);
router.post(
  "/backups/stored/:filename/set-main",
  isAuthenticated,
  requireOwnerOrProgrammer,
  setMainBackupController,
);
router.delete(
  "/backups/stored/:filename",
  isAuthenticated,
  requireOwnerOrProgrammer,
  deleteStoredBackupController,
);
router.post(
  "/backups/stored/prune-and-save",
  isAuthenticated,
  requireOwnerOrProgrammer,
  pruneStoredBackupsController,
);
router.get("/reloadBD", isAuthenticated, requireProgrammer, reloadBdController);
router.post(
  "/upload-backup",
  isAuthenticated,
  requireOwnerOrProgrammer,
  upload.single("backup"),
  uploadBackupController,
);

export default router;
