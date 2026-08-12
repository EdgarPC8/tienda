import { Router } from "express";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {
  uploadDocument,
  listDocuments,
  deleteDocument,
  documentUploadMiddleware,
} from "../controllers/DocumentAttachmentController.js";

const router = Router();

router.post("/upload", isAuthenticated, documentUploadMiddleware, uploadDocument);
router.get("/", isAuthenticated, listDocuments);
router.delete("/:id", isAuthenticated, deleteDocument);

export default router;
