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

  return false;
}

const COST_KEYS = ["supplierPrice", "distributorPrice", "cost", "unitCost", "purchasePrice"];

function stripCost(value, seen = new Set()) {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return value;
  if (Array.isArray(value)) return value.map((item) => stripCost(item, seen));
  seen.add(value);
  const out = { ...value };
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
    res.json = (body) => orig(stripCost(body));
  }
  if (employeeMay(req.method, pathOf(req), user)) return next();
  return res.status(403).json({ message: "No tenés permiso para esta acción" });
}
