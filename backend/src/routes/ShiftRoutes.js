import express from "express";
import { isAuthenticated, requireProgrammer } from "../middlewares/authMiddelware.js";
import {
  closeShift,
  createShiftMovement,
  deleteShiftMovementProgrammer,
  getActiveShift,
  getDailyShiftReport,
  getWeeklyShiftReport,
  getShiftById,
  getShiftMovements,
  getShifts,
  openShift,
  setActiveCashRegister,
  updateShiftMovementProgrammer,
  updateShiftProgrammer,
} from "../controllers/InventoryControl/ShiftController.js";

const router = express.Router();

router.get("/active", isAuthenticated, getActiveShift);
router.get("/reports/weekly", isAuthenticated, getWeeklyShiftReport);
router.get("/reports/daily", isAuthenticated, getDailyShiftReport);
router.get("/", isAuthenticated, getShifts);
router.get("/:id/movements", isAuthenticated, getShiftMovements);
router.post("/:id/movements", isAuthenticated, createShiftMovement);
router.patch("/:id/active-register", isAuthenticated, setActiveCashRegister);
router.patch("/:id", isAuthenticated, requireProgrammer, updateShiftProgrammer);
router.patch("/:id/movements/:movementId", isAuthenticated, requireProgrammer, updateShiftMovementProgrammer);
router.delete("/:id/movements/:movementId", isAuthenticated, requireProgrammer, deleteShiftMovementProgrammer);
router.get("/:id", isAuthenticated, getShiftById);
router.post("/open", isAuthenticated, openShift);
router.post("/:id/close", isAuthenticated, closeShift);

export default router;
