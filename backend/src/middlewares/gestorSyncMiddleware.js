/**
 * Autoriza llamadas del gestor al backend de la app (push de entitlement).
 * Header: Authorization: Bearer <GESTOR_SYNC_SECRET>
 */
export function requireGestorSyncSecret(req, res, next) {
  const secret = process.env.GESTOR_SYNC_SECRET || "";
  if (!secret) {
    return res.status(503).json({
      error: "GESTOR_SYNC_SECRET no configurado en el backend de la app",
    });
  }

  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== secret) {
    return res.status(401).json({ error: "No autorizado (gestor sync)" });
  }

  /** Probe del gestor: valida auth sin modificar entitlement. */
  if (req.body && req.body._gestor_probe === true) {
    return res.json({
      ok: true,
      probe: true,
      module: "subscription/entitlement",
    });
  }

  return next();
}
