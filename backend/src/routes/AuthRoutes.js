import { Router } from "express";
import {
  login,                  
  verifytoken,
  getLicenses,
  addLicense,
  deleteLicense,
  updateLicense,
  getOneLicense,
  renoveLicense,
  changeRole
} from "../controllers/AuthController.js";
import { isAuthenticated, requireProgrammer } from "../middlewares/authMiddelware.js";

const router = Router();

router.post("/login", login);
router.post("/changeRole", isAuthenticated, changeRole);
router.get("/getSession", isAuthenticated, verifytoken);
router.get("/getLicenses", isAuthenticated, requireProgrammer, getLicenses);
router.post("/renoveLicense", isAuthenticated, requireProgrammer, renoveLicense);
router.post("/addLicense", isAuthenticated, requireProgrammer, addLicense);
router.delete("/license/:id", isAuthenticated, requireProgrammer, deleteLicense);
router.put("/license/:id", isAuthenticated, requireProgrammer, updateLicense);
router.get("/license/:id", isAuthenticated, requireProgrammer, getOneLicense);

export default router;
