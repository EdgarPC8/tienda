import express from "express";
import { isAuthenticated, requireOwner } from "../middlewares/authMiddelware.js";
import {
  closeShift,
  createShiftMovement,
  deleteShiftMovementProgrammer,
  getActiveShift,
  getDailyShiftReport,
  getWeeklyShiftReport,
  getPendingDifferenceShifts,
  getShiftById,
  getShiftMovements,
  getShifts,
  openShift,
  resolveShiftDifference,
  resolveShiftDifferencesBulk,
  setActiveCashRegister,
  updateShiftMovementProgrammer,
  updateShiftProgrammer,
} from "../controllers/InventoryControl/ShiftController.js";

const router = express.Router();

router.get("/active", isAuthenticated, getActiveShift);
router.get("/reports/weekly", isAuthenticated, getWeeklyShiftReport);
router.get("/reports/daily", isAuthenticated, getDailyShiftReport);
router.get("/difference-pending", isAuthenticated, getPendingDifferenceShifts);
router.post("/resolve-differences", isAuthenticated, resolveShiftDifferencesBulk);
router.get("/", isAuthenticated, getShifts);
router.get("/:id/movements", isAuthenticated, getShiftMovements);
router.post("/:id/movements", isAuthenticated, createShiftMovement);
router.post("/:id/resolve-difference", isAuthenticated, resolveShiftDifference);
router.patch("/:id/active-register", isAuthenticated, setActiveCashRegister);
router.patch("/:id", isAuthenticated, requireOwner, updateShiftProgrammer);
router.patch("/:id/movements/:movementId", isAuthenticated, requireOwner, updateShiftMovementProgrammer);
router.delete("/:id/movements/:movementId", isAuthenticated, requireOwner, deleteShiftMovementProgrammer);
router.get("/:id", isAuthenticated, getShiftById);
router.post("/open", isAuthenticated, openShift);
router.post("/:id/close", isAuthenticated, closeShift);

export default router;
