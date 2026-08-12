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
import {
    isAuthenticated,
    requireAdminOrProgrammer,
    requireOwnAccountOrAdmin,
} from "../middlewares/authMiddelware.js";


const router = new Router();
router.get("/account", isAuthenticated, requireAdminOrProgrammer, getAccounts);
router.get("/account/:id", isAuthenticated, requireAdminOrProgrammer, getOneAccount);
router.get("/account/:accountId/:rolId", isAuthenticated, requireOwnAccountOrAdmin, getAccount);
router.post("/account", isAuthenticated, requireAdminOrProgrammer, addAccount);
router.delete("/account/:id", isAuthenticated, requireAdminOrProgrammer, deleteAccount);
router.put("/account/:id", isAuthenticated, requireAdminOrProgrammer, updateAccount);
router.put("/account/resetPassword/:id", isAuthenticated, requireAdminOrProgrammer, resetPassword);
router.put("/account/updateAccountUser/:id/:userId/:rolId", isAuthenticated, requireAdminOrProgrammer, updateAccountUser);

router.get("/rol", isAuthenticated, requireAdminOrProgrammer, getRoles);
router.get("/rol/:id", isAuthenticated, requireAdminOrProgrammer, getOneRol);
router.post("/rol", isAuthenticated, requireAdminOrProgrammer, addRol);
router.delete("/rol/:id", isAuthenticated, requireAdminOrProgrammer, deleteRol);
router.put("/rol/:id", isAuthenticated, requireAdminOrProgrammer, updateRol);


export default router;
