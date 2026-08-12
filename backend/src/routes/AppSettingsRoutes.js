import { Router } from "express";
import { getAppSettings, putAppSettings, getAppTimeStatus } from "../controllers/AppSettingsController.js";
import { isAuthenticated, requireAdminOrProgrammer } from "../middlewares/authMiddelware.js";

const router = Router();

router.get("/app/settings", getAppSettings);
router.get("/app/time-status", getAppTimeStatus);
router.put("/app/settings", isAuthenticated, requireAdminOrProgrammer, putAppSettings);

export default router;
