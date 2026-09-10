/**
 * Plantilla HTML del correo de factura (estilo portal: logo + resumen + adjuntos).
 * Usa el color primario del tema del sistema (no naranja fijo).
 */

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function money(n) {
  return Number(Number(n || 0).toFixed(2)).toFixed(2);
}

function formatQty(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return String(n ?? "");
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  return String(parseFloat(v.toFixed(3)));
}

function invoiceNumberLabel(inv) {
  const a = String(inv.establishmentCode || "001").padStart(3, "0");
  const b = String(inv.emissionPointCode || "001").padStart(3, "0");
  const c = String(Number(inv.sequential) || 0).padStart(9, "0");
  return `${a}-${b}-${c}`;
}

function formatDateEc(d) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function normalizeHexColor(raw, fallback = "#1A7A9A") {
  const s = String(raw || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return fallback;
}

function mixWithWhite(hex, amount = 0.88) {
  const h = normalizeHexColor(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const toHex = (n) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`.toUpperCase();
}

function resolveBrandColors(app = {}, accentOverride = null) {
  const primary =
    accentOverride ||
    app?.themePalette?.light?.primary ||
    app?.themePalette?.primary ||
    null;
  const accent = normalizeHexColor(primary, "#1A7A9A");
  return {
    accent,
    softBg: mixWithWhite(accent, 0.92),
    boxBg: mixWithWhite(accent, 0.86),
    tableHead: mixWithWhite(accent, 0.78),
    border: mixWithWhite(accent, 0.7),
  };
}

/** Columnas visibles de factura A4 según config de comprobantes. */
function resolveEmailItemColumns(receiptDetailSettings) {
  const defaults = [
    { id: "description", header: "Producto", align: "left" },
    { id: "qty", header: "Cant.", align: "right" },
    { id: "subtotal", header: "Total", align: "right" },
  ];
  let layouts = receiptDetailSettings?.tableLayouts;
  if (typeof layouts === "string") {
    try {
      layouts = JSON.parse(layouts);
    } catch {
      layouts = null;
    }
  }
  const raw = Array.isArray(layouts?.factura_a4) ? layouts.factura_a4 : null;
  if (!raw?.length) return defaults;

  const meta = {
    code: { header: "Código", align: "left" },
    description: { header: "Producto", align: "left" },
    qty: { header: "Cant.", align: "right" },
    unitPrice: { header: "P.U.", align: "right" },
    discount: { header: "Descto", align: "right" },
    subtotal: { header: "Total", align: "right" },
  };
  const cols = raw
    .filter((c) => c && c.visible !== false && c.visible !== "false" && meta[c.id])
    .map((c) => ({ id: c.id, ...meta[c.id] }));
  if (!cols.some((c) => c.id === "description")) {
    cols.unshift(meta.description && { id: "description", ...meta.description });
  }
  return cols.length ? cols : defaults;
}

function cellForItem(colId, it) {
  switch (colId) {
    case "code":
      return esc(String(it.code || it.barcode || "—"));
    case "description":
      return esc(it.name || "Producto");
    case "qty":
      return esc(formatQty(it.qty));
    case "unitPrice":
      return `$ ${esc(money(it.unitPrice))}`;
    case "discount":
      return `$ ${esc(money(it.discount || 0))}`;
    case "subtotal":
      return `$ ${esc(money(it.total))}`;
    default:
      return "—";
  }
}

/**
 * @param {object} opts
 * @param {object} opts.invoice
 * @param {object} opts.settings - SriBillingSettings
 * @param {object} [opts.app] - app settings (alias, themePalette, receiptDetailSettings)
 */
export function buildInvoiceEmailHtml({
  invoice,
  settings,
  app = {},
  hasLogoCid = false,
  hasPdf = false,
  hasXml = false,
  isTest = false,
  demoItems = null,
  accentColor = null,
}) {
  const num = invoiceNumberLabel(invoice);
  const legal = String(settings.legalName || settings.tradeName || app.name || "Emisor").trim();
  const brand = String(app.alias || app.name || legal).trim();
  const customer = String(invoice.customerName || "Cliente").trim();
  const { accent, softBg, boxBg, tableHead, border } = resolveBrandColors(
    app,
    accentColor,
  );

  const attachBits = [];
  if (hasPdf) attachBits.push("PDF");
  if (hasXml) attachBits.push("XML");
  const attachLabel =
    attachBits.length > 0
      ? attachBits.join(" y ")
      : "los archivos del comprobante (cuando estén disponibles)";

  const logoBlock = hasLogoCid
    ? `<img src="cid:app-logo" alt="${esc(brand)}" width="120" style="display:block;max-height:56px;width:auto;background:#fff;padding:6px 10px;border-radius:4px" />`
    : `<div style="background:#fff;color:${accent};font-weight:800;font-size:16px;padding:10px 14px;border-radius:4px;display:inline-block">${esc(brand)}</div>`;

  const items = Array.isArray(demoItems) ? demoItems : [];
  const cols = resolveEmailItemColumns(app?.receiptDetailSettings);
  const itemsHtml =
    items.length > 0
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;border-collapse:collapse;font-size:13px">
          <tr style="background:${tableHead}">
            ${cols
              .map(
                (c) =>
                  `<th align="${c.align}" style="padding:8px;border:1px solid ${border}">${esc(c.header)}</th>`,
              )
              .join("")}
          </tr>
          ${items
            .map(
              (it) => `<tr>
              ${cols
                .map(
                  (c) =>
                    `<td align="${c.align}" style="padding:8px;border:1px solid ${border}">${cellForItem(c.id, it)}</td>`,
                )
                .join("")}
            </tr>`,
            )
            .join("")}
        </table>`
      : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Factura ${esc(num)}</title>
</head>
<body style="margin:0;padding:0;background:#f3f3f3;font-family:Arial,Helvetica,sans-serif;color:#222">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f3f3;padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e8e8e8">
          <tr>
            <td style="background:${accent};padding:14px 18px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle">${logoBlock}</td>
                  <td align="right" valign="middle" style="color:#fff;font-weight:800;font-size:13px;letter-spacing:0.04em;padding-left:12px">
                    ${esc(legal.toUpperCase())}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:${softBg};padding:28px 24px 8px">
              <p style="margin:0 0 12px;font-size:16px;font-weight:800;color:${accent}">
                Estimado(a) ${esc(customer)},
              </p>
              <p style="margin:0 0 18px;font-size:14px;line-height:1.5;color:#333">
                ${
                  isTest
                    ? `Este es un <strong>correo de prueba</strong> del envío de facturas. Así verá el cliente su comprobante.`
                    : `Su <strong>FACTURA ELECTRÓNICA</strong> número <strong>${esc(num)}</strong> ya está disponible.`
                }
              </p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${boxBg};border-radius:6px;margin:0 0 18px">
                <tr>
                  <td style="padding:16px 18px;font-size:13px;line-height:1.7;color:#333">
                    <div><strong>Fecha de emisión:</strong> ${esc(formatDateEc(invoice.authorizedAt || invoice.createdAt))}</div>
                    <div><strong>Cliente:</strong> ${esc(customer)}</div>
                    <div><strong>Total:</strong> $ ${esc(money(invoice.total))}</div>
                    <div style="word-break:break-all"><strong>Clave de acceso:</strong> ${esc(invoice.accessKey || "—")}</div>
                  </td>
                </tr>
              </table>
              ${itemsHtml}
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#444">
                También hemos adjuntado los archivos oficiales del comprobante: <strong>${esc(attachLabel)}</strong>.
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#777">
                Conserve este correo como respaldo. Si necesita asistencia, responda a este mensaje.
              </p>
              ${
                String(invoice.environment || "").toLowerCase() !== "produccion"
                  ? `<p style="margin:12px 0 0;font-size:11px;color:${accent};font-weight:700">Ambiente de PRUEBAS SRI</p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px;background:${softBg};border-top:1px solid ${border}">
              <p style="margin:0;font-size:11px;color:#888;text-align:center">
                ${esc(legal)} · Facturación electrónica
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export { invoiceNumberLabel, money, formatDateEc, resolveBrandColors };
