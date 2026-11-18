import {
  getEntitlementResponse,
  saveEntitlement,
  pullEntitlementFromGestor,
  acknowledgeUpdateComplete,
} from "../services/entitlementService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";
import { broadcastEntitlementUpdated } from "../sockets/notificationSocket.js";

/** GET — lo que usa el frontend EdDeli (sin llamar al gestor). */
export async function getSubscription(req, res, next) {
  try {
    const data = await getEntitlementResponse();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

/**
 * PUT — el gestor empuja la habilitación aquí.
 * Header: Authorization: Bearer <GESTOR_SYNC_SECRET>
 * Body: mismo shape que /api/subscriptions/check del gestor.
 */
export async function putEntitlementFromGestor(req, res, next) {
  try {
    const data = await saveEntitlement(req.body, "gestor_push");
    broadcastEntitlementUpdated(data);
    notifyOk("subscription.entitlement_updated", "Entitlement actualizado", data);
    res.json({ ok: true, ...data });
  } catch (err) {
    notifyFail("subscription.entitlement_update_failed", "Error al actualizar entitlement", {
      error: err,
      req,
      httpStatus: err.status || 500,
    });
    next(err);
  }
}

/**
 * POST — Frontend: usuario pulsó Continuar tras la barra de progreso.
 * Body: { version?: "1.0.0.10" }
 */
export async function postUpdateComplete(req, res, next) {
  try {
    const version = req.body?.version;
    const data = await acknowledgeUpdateComplete(version);
    broadcastEntitlementUpdated(data);
    notifyOk("subscription.update_ack", "Actualización confirmada", {
      version: version || null,
    });
    res.json({ ok: true, ...data });
  } catch (err) {
    notifyFail("subscription.update_ack_failed", "Error al confirmar actualización", {
      error: err,
      req,
      httpStatus: err.status || 500,
    });
    next(err);
  }
}

/** POST — Propietario: forzar pull desde el gestor (diagnóstico / bootstrap). */
export async function pullSubscription(req, res, next) {
  try {
    const data = await pullEntitlementFromGestor();
    broadcastEntitlementUpdated(data);
    notifyOk("subscription.pulled", "Suscripción sincronizada", data);
    res.json({ ok: true, ...data });
  } catch (err) {
    const status = err.response?.status || err.status || 500;
    const message =
      err.response?.data?.error ||
      err.message ||
      "Error al sincronizar con el gestor";
    notifyFail("subscription.pull_failed", message, {
      error: err,
      req,
      httpStatus: status,
    });
    res.status(status).json({ error: message });
  }
}
