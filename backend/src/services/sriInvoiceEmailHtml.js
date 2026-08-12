/**
 * Plantilla HTML del correo de factura (estilo portal: logo + resumen + adjuntos).
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

/**
 * @param {object} opts
 * @param {object} opts.invoice
 * @param {object} opts.settings - SriBillingSettings
 * @param {object} [opts.app] - { name, alias }
 * @param {boolean} [opts.hasLogoCid]
 * @param {boolean} [opts.hasPdf]
 * @param {boolean} [opts.hasXml]
 * @param {boolean} [opts.isTest]
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
}) {
  const num = invoiceNumberLabel(invoice);
  const legal = String(settings.legalName || settings.tradeName || app.name || "Emisor").trim();
  const brand = String(app.alias || app.name || legal).trim();
  const customer = String(invoice.customerName || "Cliente").trim();
  const accent = "#E65100";
  const softBg = "#FFF8F1";
  const boxBg = "#F7EFE6";

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
  const itemsHtml =
    items.length > 0
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 18px;border-collapse:collapse;font-size:13px">
          <tr style="background:#efe6dc">
            <th align="left" style="padding:8px;border:1px solid #e0d4c6">Producto</th>
            <th align="right" style="padding:8px;border:1px solid #e0d4c6">Cant.</th>
            <th align="right" style="padding:8px;border:1px solid #e0d4c6">Total</th>
          </tr>
          ${items
            .map(
              (it) => `<tr>
              <td style="padding:8px;border:1px solid #e0d4c6">${esc(it.name)}</td>
              <td align="right" style="padding:8px;border:1px solid #e0d4c6">${esc(String(it.qty))}</td>
              <td align="right" style="padding:8px;border:1px solid #e0d4c6">$ ${esc(money(it.total))}</td>
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
                  ? `<p style="margin:12px 0 0;font-size:11px;color:#9a3412;font-weight:700">Ambiente de PRUEBAS SRI</p>`
                  : ""
              }
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 22px;background:${softBg};border-top:1px solid #f0e6da">
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

export { invoiceNumberLabel, money, formatDateEc };
