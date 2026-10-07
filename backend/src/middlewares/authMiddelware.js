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
 * Propietario o Programador (correcciones de negocio, stock, turnos técnicos).
 * Desarrollador (comandos/logs) sigue con requireProgrammer.
 * Debe usarse DESPUÉS de isAuthenticated.
 */
const requireOwner = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (rol !== "Propietario" && rol !== "Programador") {
    return res.status(403).json({
      message: "No tenés permiso para esta acción",
    });
  }
  next();
};

/**
 * Solo rol Programador (módulo Desarrollador: comandos, backups, img, files, logs).
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

/** Lectura/gestión de logs: solo Programador (módulo Desarrollador). */
const requireLogsAccess = (req, res, next) => {
  if (req.user?.loginRol === "Programador") {
    return next();
  }
  return res.status(403).json({ message: "No tenés permiso para esta acción" });
};

/**
 * Propietario (Configuración → Backups) o Programador (módulo Desarrollador).
 * Debe usarse DESPUÉS de isAuthenticated.
 */
const requireOwnerOrProgrammer = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (rol === "Propietario" || rol === "Programador") {
    return next();
  }
  return res.status(403).json({ message: "No tenés permiso para esta acción" });
};

/**
 * Admin, Propietario o Programador (módulo Administración: usuarios, cuentas, roles, panel).
 * Debe usarse DESPUÉS de isAuthenticated.
 */
const requireAdminOrProgrammer = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (
    rol !== "Propietario" &&
    rol !== "Administrador" &&
    rol !== "Programador"
  ) {
    return res.status(403).json({
      message: "No tenés permiso para esta acción",
    });
  }
  next();
};

/**
 * Administrador, Propietario o Empleado (operación de caja/turno).
 * Debe usarse DESPUÉS de isAuthenticated.
 */
const requireStaff = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (!["Propietario", "Programador", "Administrador", "Empleado"].includes(rol)) {
    return res.status(403).json({ message: "Rol no autorizado para esta acción" });
  }
  next();
};

/** Foto de perfil: el propio usuario o admin/propietario/programador. */
const requireSelfOrAdmin = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (rol === "Propietario" || rol === "Administrador" || rol === "Programador") {
    return next();
  }
  const userId = Number(req.params.userId);
  if (Number(req.user?.userId) === userId) return next();
  return res.status(403).json({ message: "No puedes modificar la foto de otro usuario" });
};

/** Perfil de cuenta: la propia cuenta o admin/propietario/programador. */
const requireOwnAccountOrAdmin = (req, res, next) => {
  const rol = req.user?.loginRol;
  if (rol === "Propietario" || rol === "Administrador" || rol === "Programador") {
    return next();
  }
  const accountId = Number(req.params.accountId);
  if (Number(req.user?.accountId) === accountId) return next();
  return res.status(403).json({ message: "No puedes consultar la cuenta de otro usuario" });
};

/** Solo peticiones desde esta máquina (scripts de demo). */
const requireLocalhost = (req, res, next) => {
  const ip = String(req.ip || req.socket?.remoteAddress || "");
  const local =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip === "::ffff:127.0.0.1" ||
    ip.endsWith("127.0.0.1");
  if (!local) {
    return res.status(403).json({ message: "Solo desde localhost" });
  }
  next();
};

export {
  isAuthenticated,
  requireOwner,
  requireProgrammer,
  requireOwnerOrProgrammer,
  requireLogsAccess,
  requireAdminOrProgrammer,
  requireStaff,
  requireSelfOrAdmin,
  requireOwnAccountOrAdmin,
  requireLocalhost,
};
