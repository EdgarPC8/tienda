import { Router } from "express";
import {
  updateAccountUser,
  resetPassword,
  getAccounts,
  getOneAccount,
  addAccount,
  deleteAccount,
  updateAccount,
  getAccount,
  getRoles,
  getOneRol,
  addRol,
  deleteRol,
  updateRol,
} from "../controllers/AccountController.js";
import { isAuthenticated } from "../middlewares/authMiddelware.js";

const router = new Router();
router.get("/account", isAuthenticated, getAccounts);
router.get("/account/:accountId/:rolId", isAuthenticated, getAccount);
router.get("/account/:id", isAuthenticated, getOneAccount);
router.post("/account", isAuthenticated, addAccount);
router.delete("/account/:id", isAuthenticated, deleteAccount);
router.put("/account/resetPassword/:id", isAuthenticated, resetPassword);
router.put("/account/updateAccountUser/:id/:userId/:rolId", isAuthenticated, updateAccountUser);
router.put("/account/:id", isAuthenticated, updateAccount);

router.get("/rol", getRoles);
router.get("/rol/:id", isAuthenticated, getOneRol);
router.post("/rol", isAuthenticated, addRol);
router.delete("/rol/:id", isAuthenticated, deleteRol);
router.put("/rol/:id", isAuthenticated, updateRol);

export default router;
