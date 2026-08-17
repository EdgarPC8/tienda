import express from "express";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {
  listPromoGroups,
  getPromoGroupById,
  createPromoGroup,
  updatePromoGroup,
  deletePromoGroup,
  addPromoMember,
  removePromoMember,
  getPromoByCustomer,
} from "../controllers/MarketingPromotionsController.js";

const router = express.Router();

router.get("/groups", isAuthenticated, listPromoGroups);
router.post("/groups", isAuthenticated, createPromoGroup);
router.get("/groups/:id", isAuthenticated, getPromoGroupById);
router.put("/groups/:id", isAuthenticated, updatePromoGroup);
router.delete("/groups/:id", isAuthenticated, deletePromoGroup);
router.post("/groups/:id/members", isAuthenticated, addPromoMember);
router.delete("/groups/:id/members/:customerId", isAuthenticated, removePromoMember);
router.get("/customer/:customerId", isAuthenticated, getPromoByCustomer);

export default router;
