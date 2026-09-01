/** Catálogo y normalización de atajos de teclado (JSON en app_settings). */

export const KEYBOARD_SHORTCUT_CATALOG = [
  {
    id: "caja.checkout",
    module: "caja",
    label: "Realizar venta",
    description: "Cobra la venta actual (mismo botón «Realizar venta»).",
    defaultKeys: "Ctrl+Enter",
  },
  {
    id: "caja.clearCart",
    module: "caja",
    label: "Vaciar carrito",
    description: "Quita todas las líneas del listado de venta.",
    defaultKeys: "Ctrl+Backspace",
  },
  {
    id: "caja.focusProduct",
    module: "caja",
    label: "Foco en buscar producto",
    description: "Lleva el cursor al buscador de productos.",
    defaultKeys: "F2",
  },
  {
    id: "caja.quickAccess",
    module: "caja",
    label: "Accesos rápidos",
    description: "Abre el panel de productos rápidos.",
    defaultKeys: "F3",
  },
  {
    id: "caja.focusCustomer",
    module: "caja",
    label: "Foco en cliente",
    description: "Lleva el cursor al selector de cliente.",
    defaultKeys: "F4",
  },
  {
    id: "caja.receivedEqualsTotal",
    module: "caja",
    label: "Efectivo recibido = total",
    description: "Completa el monto recibido con el total de la venta.",
    defaultKeys: "F5",
  },
  {
    id: "caja.printLast",
    module: "caja",
    label: "Imprimir último comprobante",
    description: "Abre la impresión de la última venta cobrada.",
    defaultKeys: "Ctrl+P",
  },
  {
    id: "caja.newSale",
    module: "caja",
    label: "Nueva venta",
    description: "Limpia el carrito y deja la pantalla lista para otra venta.",
    defaultKeys: "Ctrl+N",
  },
  {
    id: "caja.removeLastLine",
    module: "caja",
    label: "Quitar última línea",
    description: "Elimina el último producto agregado al carrito.",
    defaultKeys: "Ctrl+Shift+Backspace",
  },
];

const CATALOG_IDS = new Set(KEYBOARD_SHORTCUT_CATALOG.map((c) => c.id));

function defaultMap() {
  const out = {};
  for (const cmd of KEYBOARD_SHORTCUT_CATALOG) {
    out[cmd.id] = { keys: cmd.defaultKeys, enabled: true };
  }
  return out;
}

function parseStored(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

/** Mapa id → { keys, enabled } con defaults del catálogo. */
export function normalizeKeyboardShortcuts(raw) {
  const stored = parseStored(raw);
  const out = defaultMap();
  for (const [id, value] of Object.entries(stored)) {
    if (!CATALOG_IDS.has(id)) continue;
    const keys = String(value?.keys ?? value?.combo ?? "").trim();
    out[id] = {
      keys: keys || out[id].keys,
      enabled: value?.enabled !== false,
    };
  }
  return out;
}

export function serializeKeyboardShortcuts(value) {
  const normalized = normalizeKeyboardShortcuts(value);
  return JSON.stringify(normalized);
}
