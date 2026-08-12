/**
 * Catálogo de tipos de acción para logs HTTP.
 * Prioridad: reglas explícitas (método + patrón de ruta) → fallback por método + recurso.
 */

/** Nombres amigables de segmentos de URL. */
const RESOURCE_LABELS = {
  login: "Login",
  logout: "Logout",
  changeRole: "Cambio de rol",
  users: "usuario",
  accounts: "cuenta",
  roles: "rol",
  products: "producto",
  categories: "categoría",
  units: "unidad",
  movements: "movimiento",
  recipes: "receta",
  stores: "sucursal/local",
  homeproducts: "producto destacado",
  catalog: "catálogo",
  customers: "cliente",
  suppliers: "proveedor",
  orders: "pedido",
  "order-items": "ítem de pedido",
  "supplier-orders": "pedido a proveedor",
  shifts: "turno",
  finance: "finanzas",
  incomes: "ingreso",
  expenses: "gasto",
  obligations: "obligación",
  notifications: "notificación",
  "notification-programs": "programa de notificación",
  tasks: "tarea",
  plans: "plan de tareas",
  items: "ítem de tarea",
  publicidad: "publicidad",
  campaigns: "campaña",
  devices: "dispositivo",
  media: "medio",
  documents: "documento",
  img: "imagen",
  files: "archivo",
  sri: "facturación SRI",
  settings: "configuración",
  app: "aplicación",
  comands: "comando",
  logs: "logs",
  backups: "backup",
  editor: "editor",
  "compare-groups": "grupo comparación",
  "tier-groups": "grupo tramos",
  "generic-ingredients": "insumo genérico",
  presentations: "presentación",
  workbench: "cobranzas",
  "item-groups": "grupo de ítems",
  payments: "pago",
  pos: "caja POS",
  checkout: "cobro",
  certificate: "certificado SRI",
};

/**
 * Reglas explícitas: { method, pattern (RegExp sobre path sin query), action }
 * El path se normaliza sin prefijo API y sin query.
 */
const EXPLICIT_RULES = [
  { method: "POST", pattern: /^\/login\/?$/, action: "Login" },
  { method: "POST", pattern: /^\/logout\/?$/, action: "Logout" },
  { method: "POST", pattern: /^\/changeRole\/?$/, action: "Cambio de rol" },

  { method: "POST", pattern: /^\/shifts\/open\/?$/, action: "Abrir turno" },
  { method: "POST", pattern: /^\/shifts\/\d+\/close\/?$/, action: "Cerrar turno" },
  { method: "POST", pattern: /^\/shifts\/\d+\/movements\/?$/, action: "Movimiento de caja" },
  { method: "PATCH", pattern: /^\/shifts\/\d+\/?$/, action: "Editar turno" },
  { method: "PATCH", pattern: /^\/shifts\/\d+\/movements\/\d+\/?$/, action: "Editar movimiento de caja" },
  { method: "DELETE", pattern: /^\/shifts\/\d+\/movements\/\d+\/?$/, action: "Eliminar movimiento de caja" },

  { method: "POST", pattern: /^\/orders\/pos\/checkout\/?$/, action: "Cobro en caja" },
  { method: "POST", pattern: /^\/orders\/?$/, action: "Crear pedido" },
  { method: "PUT", pattern: /^\/orders\/\d+\/status\/?$/, action: "Cambiar estado de pedido" },
  { method: "PUT", pattern: /^\/orders\/\d+\/mark-paid\/?$/, action: "Marcar pedido pagado" },
  { method: "DELETE", pattern: /^\/orders\/order\/\d+\/?$/, action: "Eliminar pedido" },

  { method: "POST", pattern: /^\/inventory\/products\/?$/, action: "Crear producto" },
  { method: "PUT", pattern: /^\/inventory\/products\/\d+\/?$/, action: "Actualizar producto" },
  { method: "PATCH", pattern: /^\/inventory\/products\/\d+\/stock\/?$/, action: "Ajustar stock" },
  { method: "DELETE", pattern: /^\/inventory\/products\/\d+\/?$/, action: "Eliminar producto" },

  { method: "POST", pattern: /^\/inventory\/movements(\/batch)?\/?$/, action: "Registrar movimiento" },
  { method: "POST", pattern: /^\/inventory\/movements\/open-presentation\/?$/, action: "Abrir presentación" },
  { method: "PUT", pattern: /^\/inventory\/movements\/\d+\/?$/, action: "Actualizar movimiento" },
  { method: "DELETE", pattern: /^\/inventory\/movements\/\d+\/?$/, action: "Eliminar movimiento" },

  { method: "POST", pattern: /^\/inventory\/stores\/?$/, action: "Crear sucursal/local" },
  { method: "PUT", pattern: /^\/inventory\/stores\/\d+\/?$/, action: "Actualizar sucursal/local" },
  { method: "DELETE", pattern: /^\/inventory\/stores\/\d+\/?$/, action: "Eliminar sucursal/local" },
  { method: "POST", pattern: /^\/inventory\/stores\/\d+\/products\/?$/, action: "Asignar productos al local" },
  { method: "DELETE", pattern: /^\/inventory\/stores\/\d+\/products\/\d+\/?$/, action: "Quitar producto del local" },
  { method: "PATCH", pattern: /^\/inventory\/stores\/\d+\/products\/\d+\/?$/, action: "Toggle producto del local" },

  { method: "POST", pattern: /^\/inventory\/registerProduction/i, action: "Registrar producción" },

  { method: "PUT", pattern: /^\/app\/settings\/?$/, action: "Actualizar configuración" },
  { method: "PUT", pattern: /^\/sri\/settings\/?$/, action: "Actualizar config SRI" },
  { method: "POST", pattern: /^\/sri\/certificate\/?$/, action: "Subir certificado SRI" },
  { method: "DELETE", pattern: /^\/sri\/certificate\/?$/, action: "Eliminar certificado SRI" },
  { method: "POST", pattern: /^\/sri\/invoices\/emit\/?$/, action: "Emitir factura SRI" },
  { method: "POST", pattern: /^\/sri\/invoices\/\d+\/refresh\/?$/, action: "Consultar autorización SRI" },

  { method: "PUT", pattern: /^\/notifications\/seen\//, action: "Marcar notificación leída" },
  { method: "PUT", pattern: /^\/notifications\/seen-all\//, action: "Marcar todas leídas" },
  { method: "PUT", pattern: /^\/notifications\/bulk-seen\/?$/, action: "Marcar notificaciones leídas" },
  { method: "DELETE", pattern: /^\/notifications\/bulk\/?$/, action: "Eliminar notificaciones" },
  { method: "DELETE", pattern: /^\/notifications\/read\//, action: "Eliminar notificaciones leídas" },
  { method: "DELETE", pattern: /^\/notifications\/\d+\/?$/, action: "Eliminar notificación" },

  { method: "DELETE", pattern: /^\/comands\/logs\/?$/, action: "Borrar logs" },
  { method: "DELETE", pattern: /^\/comands\/logs\/\d+\/?$/, action: "Borrar log" },
  { method: "POST", pattern: /^\/comands\/upload-backup\/?$/, action: "Subir backup" },
  { method: "GET", pattern: /^\/comands\/reloadBD\/?$/, action: "Recargar BD" },
  { method: "GET", pattern: /^\/comands\/saveBackup\/?$/, action: "Guardar backup" },

  { method: "POST", pattern: /^\/img\//, action: "Subir imagen" },
  { method: "DELETE", pattern: /^\/img\//, action: "Eliminar imagen" },
  { method: "POST", pattern: /^\/files\//, action: "Subir archivo" },
  { method: "DELETE", pattern: /^\/files\//, action: "Eliminar archivo" },
  { method: "POST", pattern: /^\/documents\//, action: "Subir documento" },
  { method: "DELETE", pattern: /^\/documents\//, action: "Eliminar documento" },
];

const METHOD_VERB = {
  POST: "Crear",
  PUT: "Actualizar",
  PATCH: "Actualizar",
  DELETE: "Eliminar",
};

function stripApiPrefix(pathname) {
  let p = String(pathname || "").split("?")[0] || "";
  p = p.replace(/\/{2,}/g, "/");
  // /eddeliapi/... o similar
  const m = p.match(/^\/([^/]+)(\/.*)?$/);
  if (m && !["login", "users", "orders", "inventory", "shifts", "app", "sri"].includes(m[1])) {
    // primer segmento suele ser API_PREFIX
    const rest = m[2] || "/";
    if (
      [
        "login",
        "users",
        "accounts",
        "orders",
        "inventory",
        "shifts",
        "finance",
        "notifications",
        "notification-programs",
        "tasks",
        "publicidad",
        "media",
        "documents",
        "img",
        "files",
        "sri",
        "app",
        "comands",
        "editor",
        "changeRole",
      ].some((seg) => rest === `/${seg}` || rest.startsWith(`/${seg}/`)) ||
      rest.startsWith("/app/")
    ) {
      return rest;
    }
  }
  // Si el path ya empieza con recurso conocido
  return p.startsWith("/") ? p : `/${p}`;
}

function normalizePath(endPoint) {
  try {
    if (String(endPoint).startsWith("http")) {
      const u = new URL(endPoint);
      return stripApiPrefix(u.pathname);
    }
  } catch {
    /* ignore */
  }
  return stripApiPrefix(endPoint);
}

function labelResource(seg) {
  if (!seg) return "recurso";
  if (/^\d+$/.test(seg)) return null;
  return RESOURCE_LABELS[seg] || seg.replace(/-/g, " ");
}

function fallbackAction(method, path) {
  const verb = METHOD_VERB[String(method || "").toUpperCase()] || String(method || "Acción");
  const parts = path.split("/").filter(Boolean);
  // Buscar último segmento con etiqueta conocida (no numérico)
  let resource = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const lab = labelResource(parts[i]);
    if (lab && !/^\d+$/.test(parts[i])) {
      resource = lab;
      break;
    }
  }
  if (!resource && parts[0]) resource = labelResource(parts[0]);
  if (resource && RESOURCE_LABELS[parts.find((p) => RESOURCE_LABELS[p])] === resource) {
    // ok
  }
  // Login especial si path incluye login
  if (parts.includes("login")) return "Login";
  if (parts.includes("logout")) return "Logout";

  if (!resource) return `${verb} recurso`;
  // "Crear producto" vs recurso ya en español
  return `${verb} ${resource}`;
}

/**
 * @param {string} httpMethod
 * @param {string} endPoint originalUrl o path
 * @returns {string} etiqueta corta para columna Acción
 */
export function resolveLogAction(httpMethod, endPoint) {
  const method = String(httpMethod || "").toUpperCase();
  const path = normalizePath(endPoint);

  for (const rule of EXPLICIT_RULES) {
    if (rule.method !== method) continue;
    if (rule.pattern.test(path)) return rule.action;
  }

  return fallbackAction(method, path);
}

/** Lista de tipos conocidos (para UI / docs). */
export function listKnownLogActions() {
  const set = new Set(EXPLICIT_RULES.map((r) => r.action));
  set.add("Login");
  set.add("Logout");
  set.add("Crear recurso");
  set.add("Actualizar recurso");
  set.add("Eliminar recurso");
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

export { EXPLICIT_RULES, RESOURCE_LABELS };
