import { Router } from "express";
import {
  listLocalNews,
  putNewsSyncFromGestor,
} from "../controllers/NewsController.js";
import { requireGestorSyncSecret } from "../middlewares/gestorSyncMiddleware.js";
import { isAuthenticated } from "../middlewares/authMiddelware.js";

const router = Router();

/** Gestor → sincroniza el lote de noticias publicadas. */
router.put("/news/sync", requireGestorSyncSecret, putNewsSyncFromGestor);

/** Frontend: periódico local. */
router.get("/news", isAuthenticated, listLocalNews);

export default router;
