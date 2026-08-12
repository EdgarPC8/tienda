

  // src/routes/ImgRoutes.js

import { Router } from "express";



import {
  uploadImage,
  deleteImage,
  scanImages as scanImagesController,
  downloadFolderZip,
  checkImagesExist,
} from "../controllers/ImgController.js";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {     
    makeImageUpload,
    deleteImage as deleteImageMiddleware,
    scanImages,
    deleteFolder, 
} from "../middlewares/imgMiddleware.js";



const router = new Router();

router.get(
  "/download",
  isAuthenticated, 
  downloadFolderZip
);

router.post(
  "/check-exists",
  isAuthenticated,
  checkImagesExist
);

router.post(
  "/upload",
  isAuthenticated,
  makeImageUpload({ fieldName: "file" }),
  uploadImage
);

// ELIMINAR
// DELETE /eddeliapi/img/delete?relPath=EdDeli/products/a.png
router.delete(
  "/delete",
  isAuthenticated,
  deleteImageMiddleware(),
  deleteImage
);

// ESCANEAR
// GET /eddeliapi/img/scan?folder=EdDeli&maxDepth=5
router.get(
  "/scan",
  isAuthenticated,
  scanImages(),
  scanImagesController,
);
// DELETE /eddeliapi/img/folder?folder=EdDeli/products
router.delete("/folder", isAuthenticated, deleteFolder(), (req, res) => {
  res.json({ ok: true, ...req.imageManager });
});
export default router;
