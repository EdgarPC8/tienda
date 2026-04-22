import { Router } from "express";
import { login, verifytoken, changeRole } from "../controllers/AuthController.js";
import { isAuthenticated } from "../middlewares/authMiddelware.js";

const router = Router();

router.post("/login", login);
router.post("/changeRole", isAuthenticated, changeRole);
router.get("/getSession", isAuthenticated, verifytoken);

export default router;
