import { Router } from "express";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {
  listNotificationPrograms,
  createNotificationProgram,
  updateNotificationProgram,
  deleteNotificationProgram,
  sendNotificationProgramNow,
} from "../controllers/NotificationProgramController.js";

const router = Router();

router.get("/", isAuthenticated, listNotificationPrograms);
router.post("/", isAuthenticated, createNotificationProgram);
router.put("/:id", isAuthenticated, updateNotificationProgram);
router.delete("/:id", isAuthenticated, deleteNotificationProgram);
router.post("/:id/send", isAuthenticated, sendNotificationProgramNow);

export default router;
