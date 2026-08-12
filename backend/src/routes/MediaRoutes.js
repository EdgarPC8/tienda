import { Router } from "express";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {
  deleteMediaAsset,
  getMediaCatalog,
  mediaUploadMiddleware,
  uploadMedia,
} from "../controllers/MediaController.js";

const router = Router();

router.get("/catalog", isAuthenticated, getMediaCatalog);
router.post("/upload", isAuthenticated, mediaUploadMiddleware, uploadMedia);
router.delete("/:id", isAuthenticated, deleteMediaAsset);

export default router;
