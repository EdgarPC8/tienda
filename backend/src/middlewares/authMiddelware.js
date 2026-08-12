/**
 * Middlewares de autenticación y autorización.
 *
 * El payload JWT (AuthController) incluye:
 *   userId, accountId, rolId, loginRol
 * NO incluye `id` — usar accountId o userId según el caso.
 */
import { getHeaderToken, verifyJWT } from "../libs/jwt.js";

/** Sesión válida requerida. Token inválido → 401 (no 500). */
const isAuthenticated = async (req, res, next) => {
  try {
    const token = getHeaderToken(req);
    if (!token) {
      return res.status(401).json({ message: "No token, unauthorized" });
    }

    const verify = await verifyJWT(token);
    req.user = verify;
    next();
  } catch (error) {
    return res.status(401).json({
      message: "Token inválido o expirado",
      error: error.message,
    });
  }
};

/**
 * Solo rol Programador (Comandos, backup, reload BD, rutas de mantenimiento).
 * Debe usarse DESPUÉS de isAuthenticated.
 */
const requireProgrammer = (req, res, next) => {
  if (req.user?.loginRol !== "Programador") {
    return res.status(403).json({
      message: "No tenés permiso para esta acción",
    });
  }
  next();
};

/**
 * Admin o Programador (panel de control, guardar backup en servidor).
 * Debe usarse DESPUÉS de isAuthenticated.
 */
const requireAdminOrProgrammer = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (rol !== "Programador" && rol !== "Administrador") {
    return res.status(403).json({
      message: "No tenés permiso para esta acción",
    });
  }
  next();
};

/**
 * Administrador, Programador o Empleado (operación de caja/turno).
 * Debe usarse DESPUÉS de isAuthenticated.
 */
const requireStaff = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (!["Programador", "Administrador", "Empleado"].includes(rol)) {
    return res.status(403).json({ message: "Rol no autorizado para esta acción" });
  }
  next();
};

/** Foto de perfil: el propio usuario o admin/programador. */
const requireSelfOrAdmin = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (rol === "Programador" || rol === "Administrador") return next();
  const userId = Number(req.params.userId);
  if (Number(req.user?.userId) === userId) return next();
  return res.status(403).json({ message: "No puedes modificar la foto de otro usuario" });
};

/** Perfil de cuenta: la propia cuenta o admin/programador. */
const requireOwnAccountOrAdmin = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (rol === "Programador" || rol === "Administrador") return next();
  const accountId = Number(req.params.accountId);
  if (Number(req.user?.accountId) === accountId) return next();
  return res.status(403).json({ message: "No puedes consultar la cuenta de otro usuario" });
};

export {
  isAuthenticated,
  requireProgrammer,
  requireAdminOrProgrammer,
  requireStaff,
  requireSelfOrAdmin,
  requireOwnAccountOrAdmin,
};
