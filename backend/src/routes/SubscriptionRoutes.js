import { Router } from "express";
import {
  getSubscription,
  putEntitlementFromGestor,
  pullSubscription,
  postUpdateComplete,
} from "../controllers/SubscriptionController.js";
import { requireGestorSyncSecret } from "../middlewares/gestorSyncMiddleware.js";
import {
  isAuthenticated,
  requireAdminOrProgrammer,
} from "../middlewares/authMiddelware.js";

const router = Router();

/** Frontend EdDeli: suscripción local. */
router.get("/subscription", getSubscription);

/** Frontend: terminó la UI de update → limpia flags y avisa al gestor. */
router.post(
  "/subscription/update-complete",
  isAuthenticated,
  postUpdateComplete,
);

/** Gestor → habilita / actualiza entitlement en esta app. */
router.put(
  "/subscription/entitlement",
  requireGestorSyncSecret,
  putEntitlementFromGestor,
);

/** Bootstrap manual desde el gestor (solo admin/programador). */
router.post(
  "/subscription/pull",
  isAuthenticated,
  requireAdminOrProgrammer,
  pullSubscription,
);

export default router;
