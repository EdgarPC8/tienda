import { Router } from "express";
import {
  uploadImage,
  deleteImage,
  scanImages as scanImagesController,
  downloadFolderZip,
} from "../controllers/ImgController.js";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {
  makeImageUpload,
  deleteImage as deleteImageMiddleware,
  scanImages,
  deleteFolder,
} from "../middlewares/imgMiddleware.js";

const router = new Router();

router.get("/download", isAuthenticated, downloadFolderZip);

router.post(
  "/upload",
  isAuthenticated,
  makeImageUpload({ fieldName: "file" }),
  uploadImage
);

router.delete("/delete", isAuthenticated, deleteImageMiddleware(), deleteImage);

router.get("/scan", isAuthenticated, scanImages(), scanImagesController);

router.delete("/folder", isAuthenticated, deleteFolder(), (req, res) => {
  res.json({ ok: true, ...req.imageManager });
});

export default router;
