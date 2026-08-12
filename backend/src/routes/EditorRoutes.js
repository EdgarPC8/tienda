// routes/editor.routes.js
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
  // ✅ NUEVAS
  getDefaultTemplateResolved,
  getTemplateResolvedById,
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
router.get("/templates/:id/resolved", isAuthenticated, getTemplateResolvedById);  // ✅ nuevo
router.put("/templates/:id", isAuthenticated, updateTemplate);
router.delete("/templates/:id", isAuthenticated, deleteTemplate);

router.put("/templates/:id/doc", updateTemplateDoc);


// Designs
router.post("/designs", isAuthenticated, createDesign);
router.put("/designs/:id", isAuthenticated, updateDesign);
router.post("/designs/:id/overrides", isAuthenticated, upsertOverride);
router.get("/designs/:id", isAuthenticated, getDesignResolved);

export default router;
