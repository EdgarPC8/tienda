/**
 * El empleado opera caja, turno, tareas y su perfil.
 * El resto de la API queda para Administrador y Programador.
 */
import { getHeaderToken, verifyJWT } from "../libs/jwt.js";

function pathOf(req) {
  return String(req.originalUrl || req.url || "").split("?")[0];
}

function employeeMay(method, path, user) {
  const m = String(method || "GET").toUpperCase();
  if (m === "OPTIONS") return true;

  if (/\/(login|getSession|changeRole)\/?$/.test(path)) return true;
  if (m === "GET" && /\/(app\/settings|app\/time-status|subscription)\/?$/.test(path)) return true;

  if (/\/users\/me\/data\/?$/.test(path)) return true;
  if (/\/users\/photo\/\d+\/?$/.test(path)) return m === "PUT" || m === "DELETE";

  const ownAccount = path.match(/\/account\/(\d+)\/?$/);
  if (ownAccount && Number(ownAccount[1]) === Number(user?.accountId) && (m === "GET" || m === "PUT")) {
    return true;
  }

  if (/\/shifts(\/|$)/.test(path)) return true;
  if (/\/tasks\/(my-items|items\/)/.test(path)) return true;

  if (/\/notifications(\/|$)/.test(path)) return true;

  if (m === "GET" && /\/news(\/|$)/.test(path)) return true;

  if (m === "GET" && /\/inventory\/(products|categories|units)(\/|$)/.test(path)) return true;
  if (m === "GET" && /\/inventory\/(stores\/\d+\/stocks|products\/\d+\/store-stocks)/.test(path)) return true;
  if (m === "GET" && /\/inventory\/tier-groups/.test(path)) return true;
  if (m === "POST" && /\/inventory\/movements\/open-presentation/.test(path)) return true;

  if (m === "GET" && /\/orders\/customers\/?$/.test(path)) return true;
  if (m === "POST" && /\/orders\/customers\/?$/.test(path)) return true;
  if (m === "GET" && /\/orders\/supplier-product-codes/.test(path)) return true;
  if (m === "POST" && /\/orders\/pos\/checkout\/?$/.test(path)) return true;

  if (m === "GET" && /\/sri\/settings\/?$/.test(path)) return true;

  return false;
}

export async function restrictEmployee(req, res, next) {
  const token = getHeaderToken(req);
  if (!token) return next();
  let user;
  try {
    user = await verifyJWT(token);
  } catch {
    return next();
  }
  if (user?.loginRol !== "Empleado") return next();
  if (employeeMay(req.method, pathOf(req), user)) return next();
  return res.status(403).json({ message: "No tenés permiso para esta acción" });
}
