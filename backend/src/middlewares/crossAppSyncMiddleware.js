export function requireCrossAppSyncSecret(req, res, next) {
  const secret =
    String(process.env.CROSS_APP_SYNC_SECRET || "").trim() ||
    String(process.env.GESTOR_SYNC_SECRET || "").trim();

  if (!secret) {
    return res.status(503).json({
      message: "CROSS_APP_SYNC_SECRET o GESTOR_SYNC_SECRET no configurado",
    });
  }

  const header = String(req.headers.authorization || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token || token !== secret) {
    return res.status(401).json({ message: "No autorizado para sincronizacion entre apps" });
  }

  return next();
}
