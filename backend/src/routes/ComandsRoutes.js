import { Router } from "express";
import {
  reloadBdController,
  uploadBackupController,
  saveBackupController,
} from "../controllers/ComandsController.js";
import { downloadBackup } from "../database/insertData.js";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import multer from "multer";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
  },
});

router.get("/saveBackup", isAuthenticated, saveBackupController);
router.get("/downloadBackup", isAuthenticated, downloadBackup);
router.get("/reloadBD", isAuthenticated, reloadBdController);
router.post("/upload-backup", isAuthenticated, upload.single("backup"), uploadBackupController);

export default router;
