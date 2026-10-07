/**
 * El empleado opera caja, turno, tareas y su perfil.
 * El resto de la API queda para Administrador y Propietario.
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

  // Sesión: /account/:id y /account/:id/:rolId (la UI pide el rol al cambiar/entrar).
  const ownAccount = path.match(/\/account\/(\d+)(?:\/[^/]+)?\/?$/);
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

  return false;
}

const COST_KEYS = ["supplierPrice", "distributorPrice", "cost", "unitCost", "purchasePrice"];

function toPlain(value) {
  if (value == null) return value;
  if (typeof value?.toJSON === "function") {
    try {
      return value.toJSON();
    } catch {
      /* fall through */
    }
  }
  if (typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  }
  return value;
}

function stripCost(value, seen = new Set()) {
  if (!value || typeof value !== "object") return value;
  const plain = toPlain(value);
  if (!plain || typeof plain !== "object") return plain;
  if (seen.has(plain)) return plain;
  if (Array.isArray(plain)) return plain.map((item) => stripCost(item, seen));
  seen.add(plain);
  const out = { ...plain };
  for (const key of COST_KEYS) delete out[key];
  for (const key of Object.keys(out)) {
    if (out[key] && typeof out[key] === "object") out[key] = stripCost(out[key], seen);
  }
  return out;
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
  if (req.method === "GET" && /\/inventory\/products/.test(pathOf(req))) {
    const orig = res.json.bind(res);
    res.json = (body) => {
      try {
        return orig(stripCost(body));
      } catch (err) {
        console.error("stripCost products:", err?.message || err);
        return orig(body);
      }
    };
  }
  if (employeeMay(req.method, pathOf(req), user)) return next();
  return res.status(403).json({ message: "No tenés permiso para esta acción" });
}

function programmerMay(method, path) {
  const m = String(method || "GET").toUpperCase();
  if (m === "OPTIONS") return true;
  if (/\/(login|getSession|changeRole)\/?$/.test(path)) return true;
  if (m === "GET" && /\/(app\/settings|app\/time-status|subscription)\/?$/.test(path)) return true;
  if (/\/users\/me\/data\/?$/.test(path)) return true;
  if (/\/users\/photo\/\d+\/?$/.test(path)) return m === "PUT" || m === "DELETE";
  // Sesión propia (misma forma que Empleado).
  if (m === "GET" && /\/account\/\d+(?:\/[^/]+)?\/?$/.test(path)) return true;
  if (m === "GET" && /\/notifications\/unreadCount\/\d+\/?$/.test(path)) return true;

  // Módulo Desarrollador
  if (/\/comands(\/|$)/.test(path)) return true;
  if (/\/img(\/|$)/.test(path)) return true;
  if (/\/files(\/|$)/.test(path)) return true;

  // Módulo Administración
  if (/\/users(\/|$)/.test(path)) return true;
  if (/\/account(\/|$)/.test(path)) return true;
  if (/\/rol(\/|$)/.test(path)) return true;
  if (/\/notification-programs(\/|$)/.test(path)) return true;
  if (m === "GET" && /\/(news|notifications)(\/|$)/.test(path)) return true;

  return false;
}

/** Rol Programador: Desarrollador + Administración (usuarios/cuentas/roles/panel). */
export async function restrictProgrammer(req, res, next) {
  const token = getHeaderToken(req);
  if (!token) return next();
  let user;
  try {
    user = await verifyJWT(token);
  } catch {
    return next();
  }
  if (user?.loginRol !== "Programador") return next();
  if (programmerMay(req.method, pathOf(req))) return next();
  return res.status(403).json({ message: "No tenés permiso para esta acción" });
}

/** Rol Proveedor: inicio, perfil, sus pedidos a proveedor y lectura básica. */
function supplierMay(method, path) {
  const m = String(method || "GET").toUpperCase();
  if (m === "OPTIONS") return true;
  if (/\/(login|getSession|changeRole)\/?$/.test(path)) return true;
  if (m === "GET" && /\/(app\/settings|app\/time-status|subscription)\/?$/.test(path)) return true;
  if (/\/users\/me\/data\/?$/.test(path)) return true;
  if (/\/users\/photo\/\d+\/?$/.test(path)) return m === "PUT" || m === "DELETE";
  if (m === "GET" && /\/account\/\d+(?:\/[^/]+)?\/?$/.test(path)) return true;
  if (m === "GET" && /\/notifications\/unreadCount\/\d+\/?$/.test(path)) return true;
  if (m === "GET" && /\/news(\/|$)/.test(path)) return true;
  if (m === "GET" && /\/orders\/supplier-orders(\/|$)/.test(path)) return true;
  if (m === "GET" && /\/orders\/suppliers(\/|$)/.test(path)) return true;
  if (m === "GET" && /\/inventory\/suppliers(\/|$)/.test(path)) return true;
  if (m === "GET" && /\/inventory\/products(\/|$)/.test(path)) return true;
  return false;
}

export async function restrictSupplier(req, res, next) {
  const token = getHeaderToken(req);
  if (!token) return next();
  let user;
  try {
    user = await verifyJWT(token);
  } catch {
    return next();
  }
  const rol = String(user?.loginRol || "");
  if (rol !== "Proveedor" && rol !== "Proovedor") return next();
  if (supplierMay(req.method, pathOf(req))) return next();
  return res.status(403).json({ message: "No tenés permiso para esta acción" });
}
