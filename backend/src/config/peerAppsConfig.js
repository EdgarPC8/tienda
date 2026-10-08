/**
 * Enlace entre las 3 apps Raptor (EdDeli ↔ Tienda ↔ Store).
 * Local: 127.0.0.1:puerto · Producción: mismo origen que el build Vite.
 *
 * Modo:
 *   PEER_APPS_MODE=local|production
 *   o NODE_ENV=production
 *   o se infiere de SUBSCRIPTION_API_URL (si apunta al dominio institucional)
 *
 * Override por app: PEER_EDDELI_BASE_URL, PEER_TIENDA_BASE_URL, PEER_STORE_BASE_URL
 * Origen global: PEER_APPS_ORIGIN (ej. https://aplicaciones.marianosamaniego.edu.ec)
 */
export const LOCAL_APP_KEY = "tienda";

/** Secreto compartido entre las tres apps para peer-sync. */
export const PEER_SYNC_SECRET = "raptor-peer-sync-v1-eddeli-tienda-store";

/** Mismo origen que `build-app.mjs` / deployEnv del frontend. */
export const PRODUCTION_ORIGIN =
  "https://aplicaciones.marianosamaniego.edu.ec";

const LOCAL_PORTS = {
  eddeli: 3001,
  store: 3003,
  tienda: 3004,
};

const API_PREFIX = {
  eddeli: "eddeliapi",
  store: "storeapi",
  tienda: "tiendaapi",
};

function stripSlash(url) {
  return String(url || "").replace(/\/$/, "");
}

function resolvePeerMode() {
  const explicit = String(process.env.PEER_APPS_MODE || "")
    .trim()
    .toLowerCase();
  if (explicit === "local" || explicit === "production") return explicit;

  if (String(process.env.NODE_ENV || "").trim().toLowerCase() === "production") {
    return "production";
  }

  const sub = String(process.env.SUBSCRIPTION_API_URL || "");
  if (/aplicaciones\.marianosamaniego\.edu\.ec/i.test(sub)) return "production";
  if (/127\.0\.0\.1|localhost/i.test(sub)) return "local";

  return "local";
}

function resolveOrigin(mode) {
  const fromEnv = stripSlash(process.env.PEER_APPS_ORIGIN || "");
  if (fromEnv) return fromEnv;
  if (mode === "production") return PRODUCTION_ORIGIN;
  return null;
}

function peerBaseUrl(key, mode) {
  const envName = `PEER_${String(key).toUpperCase()}_BASE_URL`;
  const override = stripSlash(process.env[envName] || "");
  if (override) return override;

  const prefix = API_PREFIX[key];
  const origin = resolveOrigin(mode);
  if (origin) return `${origin}/${prefix}`;

  const port = LOCAL_PORTS[key];
  return `http://127.0.0.1:${port}/${prefix}`;
}

export const PEER_APPS_MODE = resolvePeerMode();

export const PEER_APPS = {
  eddeli: {
    key: "eddeli",
    label: "EdDeli",
    baseUrl: peerBaseUrl("eddeli", PEER_APPS_MODE),
  },
  tienda: {
    key: "tienda",
    label: "Tienda",
    baseUrl: peerBaseUrl("tienda", PEER_APPS_MODE),
  },
  store: {
    key: "store",
    label: "Store",
    baseUrl: peerBaseUrl("store", PEER_APPS_MODE),
  },
};

export function getPeerApp(key) {
  const k = String(key || "")
    .trim()
    .toLowerCase();
  if (!k || k === LOCAL_APP_KEY) return null;
  return PEER_APPS[k] || null;
}

export function peerAppLabel(key) {
  const k = String(key || "")
    .trim()
    .toLowerCase();
  return PEER_APPS[k]?.label || k || "Sistema";
}

export function listRemotePeerOptions() {
  return Object.values(PEER_APPS).filter((p) => p.key !== LOCAL_APP_KEY);
}
