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
  defaultPrintFormat: "a4",
};

const CASE_ALLOWED = new Set(["as_stored", "upper", "lower", "title"]);

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
  const out = {
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
    defaultPrintFormat: ["a4", "ticket80", "ticket55"].includes(
      String(src.defaultPrintFormat || ""),
    )
      ? String(src.defaultPrintFormat)
      : "a4",
  };
  return out;
}

export function serializeReceiptDetailSettings(raw) {
  return JSON.stringify(normalizeReceiptDetailSettings(raw));
}
