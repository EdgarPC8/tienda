import { Router } from "express";
import {
    getUsers,
    getOneUser,
    addUser,
    deleteUser,
    updateUserData,
    addUsersBulk
} from "../controllers/UserController.js";
import { getMyData, updateMyData } from "../controllers/UserDataController.js";
import { 
    deletePhoto,
    uploadPhoto 
} from "../middlewares/uploadPhotoMiddleware.js";

import { isAuthenticated, requireAdminOrProgrammer, requireSelfOrAdmin } from "../middlewares/authMiddelware.js";


const router = new Router();

// Datos adicionales del usuario autenticado (dirección, teléfonos, tipo de sangre, correos)
router.get("/me/data", isAuthenticated, getMyData);
router.put("/me/data", isAuthenticated, updateMyData);

router.put("/photo/:userId", isAuthenticated, requireSelfOrAdmin, uploadPhoto);
router.post("/", isAuthenticated, requireAdminOrProgrammer, addUser);
router.post("/bulk", isAuthenticated, requireAdminOrProgrammer, addUsersBulk);
router.get("/", isAuthenticated, requireAdminOrProgrammer, getUsers);
router.delete("/:userId", isAuthenticated, requireAdminOrProgrammer, deleteUser);
router.put("/:userId", isAuthenticated, requireAdminOrProgrammer, updateUserData);
router.get("/:userId", isAuthenticated, requireAdminOrProgrammer, getOneUser);
router.delete("/photo/:userId", isAuthenticated, requireSelfOrAdmin, deletePhoto);

export default router;
