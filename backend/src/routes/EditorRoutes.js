// routes/editor.routes.js
import express from "express";
import { Router } from "express";
import {
  createDesign,
  updateDesign,
  upsertOverride,
  getDesignResolved,

  importTemplate,
  listTemplates,
  getTemplateById,
  updateTemplate,
  deleteTemplate,
  updateTemplateDoc,
  deleteTemplateLayer,
  getDefaultTemplateResolved,
  getTemplateResolvedById,
  getTemplatePsd,
  saveTemplatePsd,
} from "../controllers/InventoryControl/EditorController.js";

import { isAuthenticated } from "../middlewares/authMiddelware.js";

const router = Router();
router.delete(
  "/templates/:templateId/layers/:layerKey",
  isAuthenticated,
  deleteTemplateLayer
);

// Templates
router.post("/templates/import", isAuthenticated, importTemplate);
router.get("/templates", isAuthenticated, listTemplates);
router.get("/templates/default", isAuthenticated, getDefaultTemplateResolved);      // ✅ nuevo
router.get("/templates/:id", isAuthenticated, getTemplateById);
router.get("/templates/:id/resolved", isAuthenticated, getTemplateResolvedById);
router.get("/templates/:id/psd", isAuthenticated, getTemplatePsd);
router.put(
  "/templates/:id/psd",
  isAuthenticated,
  express.raw({ type: "application/octet-stream", limit: "80mb" }),
  saveTemplatePsd
);
router.put("/templates/:id", isAuthenticated, updateTemplate);
router.delete("/templates/:id", isAuthenticated, deleteTemplate);

router.put("/templates/:id/doc", updateTemplateDoc);


// Designs
router.post("/designs", isAuthenticated, createDesign);
router.put("/designs/:id", isAuthenticated, updateDesign);
router.post("/designs/:id/overrides", isAuthenticated, upsertOverride);
router.get("/designs/:id", isAuthenticated, getDesignResolved);

export default router;
