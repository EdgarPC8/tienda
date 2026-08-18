import { Router } from "express";
import {
  getNotificationsByUser,
  createNotification,
  markAsSeen,
  deleteNotification,
  getUnreadCountByUser,
  markManyAsSeen,
  deleteManyNotifications,
  markAllAsSeenByUser,
  deleteReadByUser,
  demoNotificationToasts,
} from "../controllers/NotificationsController.js";
import {
  isAuthenticated,
  requireAdminOrProgrammer,
  requireLocalhost,
} from "../middlewares/authMiddelware.js";

const router = new Router();

router.get("/unreadCount/:userId", isAuthenticated, getUnreadCountByUser);
router.put("/seen-all/:userId", isAuthenticated, markAllAsSeenByUser);
router.delete("/read/:userId", isAuthenticated, deleteReadByUser);
router.put("/bulk-seen", isAuthenticated, markManyAsSeen);
router.delete("/bulk", isAuthenticated, deleteManyNotifications);
router.post(
  "/demo-toasts",
  isAuthenticated,
  requireAdminOrProgrammer,
  demoNotificationToasts,
);
router.post("/demo-toasts-local", requireLocalhost, demoNotificationToasts);
router.get("/:userId", isAuthenticated, getNotificationsByUser);
router.post("", isAuthenticated, createNotification);
router.put("/seen/:id", isAuthenticated, markAsSeen);
router.delete("/:id", isAuthenticated, deleteNotification);

export default router;
