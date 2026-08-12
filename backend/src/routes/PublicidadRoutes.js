/**
 * Rutas del módulo Publicidad (campañas + catálogo de medios).
 */
import express from "express";
import { isAuthenticated } from "../middlewares/authMiddelware.js";
import {
  listCampaigns,
  getCampaignById,
  getCampaignPlayback,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  getMediaCatalog,
  registerDevice,
  getDevicePlayback,
  listDevices,
  updateDevice,
  deleteDevice,
} from "../controllers/PublicidadController.js";

const router = express.Router();

router.post("/devices/register", registerDevice);
router.get("/devices/:deviceId/playback", getDevicePlayback);
router.get("/devices", isAuthenticated, listDevices);
router.put("/devices/:deviceId", isAuthenticated, updateDevice);
router.delete("/devices/:deviceId", isAuthenticated, deleteDevice);

router.get("/campaigns", isAuthenticated, listCampaigns);
router.post("/campaigns", isAuthenticated, createCampaign);
router.get("/campaigns/:id/playback", getCampaignPlayback);
router.get("/campaigns/:id", isAuthenticated, getCampaignById);
router.put("/campaigns/:id", isAuthenticated, updateCampaign);
router.delete("/campaigns/:id", isAuthenticated, deleteCampaign);
router.get("/media-catalog", isAuthenticated, getMediaCatalog);

export default router;
