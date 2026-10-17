import express from "express";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {
  createTaskPlan,
  closeTaskPlan,
  deleteTaskItem,
  deleteTaskPlan,
  executeTaskOpenBox,
  executeTaskProduction,
  getMyTaskItems,
  getTaskAssignees,
  getTaskPlans,
  previewTaskProduction,
  publishTaskPlan,
  updateTaskItemStatus,
  updateTaskPlan,
} from "../controllers/InventoryControl/TaskController.js";

const router = express.Router();

router.get("/assignees", isAuthenticated, getTaskAssignees);
router.get("/plans", isAuthenticated, getTaskPlans);
router.post("/plans", isAuthenticated, createTaskPlan);
router.put("/plans/:id", isAuthenticated, updateTaskPlan);
router.delete("/plans/:id", isAuthenticated, deleteTaskPlan);
router.post("/plans/:id/close", isAuthenticated, closeTaskPlan);
router.post("/plans/:id/publish", isAuthenticated, publishTaskPlan);
router.get("/my-items", isAuthenticated, getMyTaskItems);
router.put("/items/:id/status", isAuthenticated, updateTaskItemStatus);
router.delete("/items/:id", isAuthenticated, deleteTaskItem);
router.post("/items/:id/execute-open-box", isAuthenticated, executeTaskOpenBox);
router.get("/items/:id/production-preview", isAuthenticated, previewTaskProduction);
router.post("/items/:id/execute-production", isAuthenticated, executeTaskProduction);

export default router;
