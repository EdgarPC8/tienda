/** Normaliza JSON de formato de detalle en factura / nota de venta. */
export const DEFAULT_RECEIPT_DETAIL_SETTINGS = {
  productNameCase: "as_stored",
  showLineNumber: false,
  showBarcode: false,
  showUnit: false,
  maxNameLength: 0,
  trimSpaces: true,
  collapseSpaces: true,
  applyToFactura: true,
  applyToNotaVenta: true,
  showTaxRegime: true,
  showAccountingRequired: true,
  showSpecialTaxpayer: true,
  defaultPrintFormat: "a4",
  tableLayouts: {},
};

const CASE_ALLOWED = new Set(["as_stored", "upper", "lower", "title"]);
const PRINT_FORMATS = new Set(["a4", "ticket80", "ticket55"]);

const LAYOUT_KEYS = [
  "factura_a4",
  "factura_ticket80",
  "factura_ticket55",
  "nota_a4",
  "nota_ticket80",
  "nota_ticket55",
];

const DEFAULT_LAYOUTS = {
  factura_a4: [
    { id: "code", visible: true, widthPct: 18 },
    { id: "description", visible: true, widthPct: 34 },
    { id: "qty", visible: true, widthPct: 8 },
    { id: "unitPrice", visible: true, widthPct: 15 },
    { id: "discount", visible: true, widthPct: 8 },
    { id: "subtotal", visible: true, widthPct: 17 },
  ],
  factura_ticket80: [
    { id: "qty", visible: true, widthPct: 12 },
    { id: "description", visible: true, widthPct: 40 },
    { id: "unitPrice", visible: true, widthPct: 18 },
    { id: "discount", visible: true, widthPct: 12 },
    { id: "subtotal", visible: true, widthPct: 18 },
  ],
  factura_ticket55: [
    { id: "qty", visible: true, widthPct: 14 },
    { id: "description", visible: true, widthPct: 38 },
    { id: "unitPrice", visible: true, widthPct: 18 },
    { id: "discount", visible: true, widthPct: 12 },
    { id: "subtotal", visible: true, widthPct: 18 },
  ],
  nota_a4: [
    { id: "code", visible: false, widthPct: 14 },
    { id: "description", visible: true, widthPct: 46 },
    { id: "qty", visible: true, widthPct: 12 },
    { id: "unitPrice", visible: true, widthPct: 14 },
    { id: "discount", visible: false, widthPct: 10 },
    { id: "total", visible: true, widthPct: 14 },
  ],
  nota_ticket80: [
    { id: "description", visible: true, widthPct: 40 },
    { id: "qty", visible: true, widthPct: 12 },
    { id: "unitPrice", visible: true, widthPct: 24 },
    { id: "total", visible: true, widthPct: 24 },
  ],
  nota_ticket55: [
    { id: "description", visible: true, widthPct: 38 },
    { id: "qty", visible: true, widthPct: 14 },
    { id: "unitPrice", visible: true, widthPct: 24 },
    { id: "total", visible: true, widthPct: 24 },
  ],
};

const REQUIRED = new Set(["description", "subtotal", "total"]);

function normalizeCols(rawCols, layoutKey) {
  const defaults = (DEFAULT_LAYOUTS[layoutKey] || DEFAULT_LAYOUTS.factura_a4).map(
    (c) => ({ ...c }),
  );
  const allowed = new Set(defaults.map((c) => c.id));
  const byId = new Map();
  if (Array.isArray(rawCols)) {
    rawCols.forEach((c) => {
      const id = String(c?.id || "");
      if (!allowed.has(id) || byId.has(id)) return;
      const w = Number(c.widthPct);
      byId.set(id, {
        id,
        visible:
          REQUIRED.has(id) ||
          c.visible === true ||
          c.visible === "true" ||
          (c.visible !== false &&
            c.visible !== "false" &&
            defaults.find((d) => d.id === id)?.visible === true),
        widthPct:
          Number.isFinite(w) && w > 0 ? Math.min(80, Math.max(4, Math.round(w))) : undefined,
      });
    });
  }
  const ordered = [];
  const seen = new Set();
  if (Array.isArray(rawCols)) {
    for (const c of rawCols) {
      const id = String(c?.id || "");
      if (!byId.has(id) || seen.has(id)) continue;
      seen.add(id);
      const def = defaults.find((d) => d.id === id);
      const cur = byId.get(id);
      ordered.push({
        id,
        visible: REQUIRED.has(id) ? true : Boolean(cur.visible),
        widthPct: cur.widthPct ?? def?.widthPct ?? 12,
      });
    }
  }
  for (const def of defaults) {
    if (seen.has(def.id)) continue;
    seen.add(def.id);
    const cur = byId.get(def.id);
    ordered.push({
      id: def.id,
      visible: REQUIRED.has(def.id) ? true : cur ? Boolean(cur.visible) : def.visible,
      widthPct: cur?.widthPct ?? def.widthPct,
    });
  }
  const visible = ordered.filter((c) => c.visible);
  const sum = visible.reduce((a, c) => a + Number(c.widthPct || 0), 0);
  if (visible.length && sum > 0 && Math.abs(sum - 100) >= 0.6) {
    const scale = 100 / sum;
    let rounded = ordered.map((c) =>
      c.visible
        ? { ...c, widthPct: Math.max(4, Math.round(c.widthPct * scale)) }
        : c,
    );
    const vis = rounded.filter((c) => c.visible);
    const s = vis.reduce((a, c) => a + c.widthPct, 0);
    const delta = 100 - s;
    if (delta !== 0 && vis.length) {
      const lastId = vis[vis.length - 1].id;
      rounded = rounded.map((c) =>
        c.id === lastId && c.visible
          ? { ...c, widthPct: Math.max(4, c.widthPct + delta) }
          : c,
      );
    }
    return rounded;
  }
  return ordered;
}

function normalizeTableLayouts(raw) {
  let src = raw;
  if (typeof raw === "string") {
    try {
      src = JSON.parse(raw);
    } catch {
      src = {};
    }
  }
  if (!src || typeof src !== "object") src = {};
  const out = {};
  for (const key of LAYOUT_KEYS) {
    out[key] = normalizeCols(src[key], key);
  }
  return out;
}

export function normalizeReceiptDetailSettings(raw) {
  let src = raw;
  if (typeof raw === "string") {
    try {
      src = JSON.parse(raw);
    } catch {
      src = {};
    }
  }
  if (!src || typeof src !== "object") src = {};
  const caseVal = String(src.productNameCase || "as_stored");
  const maxLen = Number(src.maxNameLength);
  return {
    productNameCase: CASE_ALLOWED.has(caseVal) ? caseVal : "as_stored",
    showLineNumber: src.showLineNumber === true || src.showLineNumber === "true",
    showBarcode: src.showBarcode === true || src.showBarcode === "true",
    showUnit: src.showUnit === true || src.showUnit === "true",
    maxNameLength:
      Number.isFinite(maxLen) && maxLen > 0 ? Math.min(200, Math.round(maxLen)) : 0,
    trimSpaces: src.trimSpaces !== false && src.trimSpaces !== "false",
    collapseSpaces: src.collapseSpaces !== false && src.collapseSpaces !== "false",
    applyToFactura: src.applyToFactura !== false && src.applyToFactura !== "false",
    applyToNotaVenta:
      src.applyToNotaVenta !== false && src.applyToNotaVenta !== "false",
    showTaxRegime: src.showTaxRegime !== false && src.showTaxRegime !== "false",
    showAccountingRequired:
      src.showAccountingRequired !== false && src.showAccountingRequired !== "false",
    showSpecialTaxpayer:
      src.showSpecialTaxpayer !== false && src.showSpecialTaxpayer !== "false",
    defaultPrintFormat: PRINT_FORMATS.has(String(src.defaultPrintFormat || ""))
      ? String(src.defaultPrintFormat)
      : "a4",
    tableLayouts: normalizeTableLayouts(src.tableLayouts),
  };
}

export function serializeReceiptDetailSettings(raw) {
  return JSON.stringify(normalizeReceiptDetailSettings(raw));
}
