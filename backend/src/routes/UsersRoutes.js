import { Router } from "express";
import {
  getUsers,
  getOneUser,
  addUser,
  deleteUser,
  updateUserData,
  addUsersBulk,
} from "../controllers/UserController.js";
import { getMyData, updateMyData } from "../controllers/UserDataController.js";
import { isAuthenticated } from "../middlewares/authMiddelware.js";

const router = new Router();

router.get("/me/data", isAuthenticated, getMyData);
router.put("/me/data", isAuthenticated, updateMyData);

router.post("", isAuthenticated, addUser);
router.post("/bulk", isAuthenticated, addUsersBulk);
router.get("", isAuthenticated, getUsers);
router.delete("/:userId", isAuthenticated, deleteUser);
router.put("/:userId", isAuthenticated, updateUserData);
router.get("/:userId", isAuthenticated, getOneUser);

export default router;
