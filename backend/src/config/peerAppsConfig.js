/**
 * Enlace fijo entre las 3 apps Raptor (EdDeli ↔ Tienda ↔ Store).
 * URLs y secreto viven solo en código — no se exponen en la UI.
 */
export const LOCAL_APP_KEY = "tienda";

/** Secreto compartido entre las tres apps para peer-sync. */
export const PEER_SYNC_SECRET = "raptor-peer-sync-v1-eddeli-tienda-store";

export const PEER_APPS = {
  eddeli: {
    key: "eddeli",
    label: "EdDeli",
    baseUrl: "http://127.0.0.1:3001/eddeliapi",
  },
  tienda: {
    key: "tienda",
    label: "Tienda",
    baseUrl: "http://127.0.0.1:3004/tiendaapi",
  },
  store: {
    key: "store",
    label: "Store",
    baseUrl: "http://127.0.0.1:3003/storeapi",
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
