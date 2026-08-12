/**
 * Envío de factura electrónica por correo (SMTP).
 * Plantilla con logo + resumen; adjuntos PDF + XML.
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import nodemailer from "nodemailer";
import fileDirName from "../libs/file-dirname.js";
import { decryptSecret } from "../utils/secretCrypto.js";
import {
  SRI_PRIVATE_DIR,
  loadSriBillingSettings,
  getInvoiceEmailQuotaPublic,
  ensureSriEmailSchema,
  ensureSriPrivateDir,
} from "./sriBillingService.js";
import { loadAppSettings } from "./appSettingsService.js";
import {
  buildInvoiceEmailHtml,
  invoiceNumberLabel,
  money,
} from "./sriInvoiceEmailHtml.js";
import {
  generateAndStoreInvoicePdf,
  generateSampleInvoicePdf,
  unlinkQuiet,
} from "./sriInvoiceRidePdf.js";
import { ElectronicInvoice } from "../models/SriBilling.js";
import { sequelize } from "../database/connection.js";

const { __dirname } = fileDirName(import.meta);
const IMG_BASE = path.resolve(__dirname, "../img");

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function bumpEmailSentCount(row) {
  const today = todayIsoDate();
  const sentDate = row.invoiceEmailsSentDate
    ? String(row.invoiceEmailsSentDate).slice(0, 10)
    : null;
  if (sentDate !== today) {
    await row.update({
      invoiceEmailsSentDate: today,
      invoiceEmailsSentCount: 1,
    });
  } else {
    await row.update({
      invoiceEmailsSentCount: (Number(row.invoiceEmailsSentCount) || 0) + 1,
    });
  }
}

function buildTransport(settings, passwordPlain) {
  const host = String(settings.smtpHost || "").trim();
  if (!host) {
    const err = new Error("Falta el servidor SMTP (host). Para Gmail: smtp.gmail.com");
    err.status = 400;
    throw err;
  }
  if (host.includes("@")) {
    const err = new Error(
      "El servidor SMTP no es tu correo. Para Gmail pon host: smtp.gmail.com. Tu Gmail va en Usuario y Remitente.",
    );
    err.status = 400;
    throw err;
  }
  const port = Number(settings.smtpPort) || 587;
  const secure = Boolean(settings.smtpSecure) || port === 465;
  const user = String(settings.smtpUser || "").trim();
  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: passwordPlain },
  });
}

async function resolveAppLogoPath() {
  try {
    const app = await loadAppSettings();
    const rel = String(app.logoPath || "").replace(/^\/+/, "");
    if (!rel || rel.includes("..")) return { app, logoPath: null };
    const full = path.resolve(IMG_BASE, rel);
    if (!full.startsWith(IMG_BASE)) return { app, logoPath: null };
    try {
      await fsp.access(full);
      return { app, logoPath: full };
    } catch {
      return { app, logoPath: null };
    }
  } catch {
    return { app: { name: "Facturación", alias: "App" }, logoPath: null };
  }
}

function logoCidAttachment(logoPath) {
  if (!logoPath) return null;
  const ext = path.extname(logoPath).toLowerCase();
  const contentType =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : "image/jpeg";
  return {
    filename: `logo${ext || ".jpeg"}`,
    path: logoPath,
    cid: "app-logo",
    contentType,
    contentDisposition: "inline",
  };
}

async function resolveXmlAttachment(invoice) {
  const rel = invoice.xmlRelativePath;
  if (!rel) return null;
  const base = path.basename(String(rel));
  const candidates = [
    path.resolve(SRI_PRIVATE_DIR, "invoices", base),
    path.resolve(SRI_PRIVATE_DIR, base),
  ];
  for (const full of candidates) {
    try {
      await fsp.access(full);
      return {
        filename: `factura-${invoiceNumberLabel(invoice)}.xml`,
        path: full,
        contentType: "application/xml",
      };
    } catch {
      /* next */
    }
  }
  return null;
}

async function resolveOrCreatePdfAttachment(invoice, settings, logoPath, uploadedPdf) {
  // Preferir PDF RIDE subido desde el frontend (mismo de “Descargar”)
  if (uploadedPdf?.buffer?.length) {
    try {
      ensureSriPrivateDir();
      const invoicesDir = path.join(SRI_PRIVATE_DIR, "invoices");
      fs.mkdirSync(invoicesDir, { recursive: true });
      const key = String(invoice.accessKey || invoice.id || Date.now()).replace(/\W/g, "");
      const filename = `${key || `factura-${invoiceNumberLabel(invoice)}`}-ride.pdf`;
      const absolutePath = path.join(invoicesDir, filename);
      await fsp.writeFile(absolutePath, uploadedPdf.buffer);
      const relativePath = `invoices/${filename}`;
      if (invoice?.update && typeof invoice.update === "function") {
        try {
          await invoice.update({ ridePdfRelativePath: relativePath });
        } catch (e) {
          console.warn("No se pudo guardar ridePdfRelativePath:", e?.message || e);
        }
      }
      return {
        filename: `factura-${invoiceNumberLabel(invoice)}.pdf`,
        path: absolutePath,
        contentType: "application/pdf",
        created: true,
        source: "ride",
      };
    } catch (e) {
      console.error("guardar PDF RIDE:", e?.message || e);
    }
  }

  // Fallback: PDF generado en servidor
  try {
    const pdf = await generateAndStoreInvoicePdf(invoice, settings, logoPath);
    if (invoice?.update && typeof invoice.update === "function") {
      try {
        await invoice.update({ ridePdfRelativePath: pdf.relativePath });
      } catch (e) {
        console.warn("No se pudo guardar ridePdfRelativePath:", e?.message || e);
      }
    }
    return {
      filename: `factura-${invoiceNumberLabel(invoice)}.pdf`,
      path: pdf.absolutePath,
      contentType: "application/pdf",
      created: true,
      source: "server",
    };
  } catch (e) {
    console.error("generateAndStoreInvoicePdf:", e?.message || e);
    return null;
  }
}

async function decryptSmtpPassword(settings) {
  try {
    return decryptSecret(settings.smtpPassEnc) || "";
  } catch {
    return "";
  }
}

/**
 * Envía factura autorizada al correo del cliente si la config lo permite.
 * @param {object} invoice
 * @param {{ pdfFile?: { buffer: Buffer, originalname?: string } }} [opts]
 */
export async function maybeSendAuthorizedInvoiceEmail(invoice, opts = {}) {
  try {
    await ensureSriEmailSchema();
    await ensureInvoiceEmailSentSchema();
    const settings = await loadSriBillingSettings();
    const quota = getInvoiceEmailQuotaPublic(settings);

    if (!quota.enableSendInvoiceEmail) {
      return { ok: false, skipped: true, reason: "Envío por correo desactivado en configuración SRI." };
    }
    const to = String(invoice?.customerEmail || "").trim();
    if (!to || !to.includes("@")) {
      return {
        ok: false,
        skipped: true,
        reason: "La factura no tiene correo de cliente válido.",
      };
    }
    if (!quota.smtpReady) {
      return {
        ok: false,
        skipped: true,
        reason: "Falta configurar SMTP (host, usuario, contraseña y remitente).",
        warning: quota.invoiceEmailWarning,
      };
    }
    if (quota.invoiceEmailLimitReached) {
      return {
        ok: false,
        skipped: true,
        reason: quota.invoiceEmailWarning || "Límite diario de correos alcanzado.",
        warning: quota.invoiceEmailWarning,
        limitReached: true,
      };
    }

    if (invoice.invoiceEmailSentAt && !opts.force) {
      return {
        ok: false,
        skipped: true,
        reason: "Esta factura ya fue enviada por correo.",
        alreadySent: true,
      };
    }

    const password = await decryptSmtpPassword(settings);
    if (!password) {
      return { ok: false, skipped: true, reason: "Contraseña SMTP vacía." };
    }

    const { app, logoPath } = await resolveAppLogoPath();
    const from = String(settings.smtpFrom || settings.smtpUser || "").trim();
    const transport = buildTransport(settings, password);
    const xmlAtt = await resolveXmlAttachment(invoice);
    const pdfAtt = await resolveOrCreatePdfAttachment(
      invoice,
      settings,
      logoPath,
      opts.pdfFile || null,
    );
    const logoAtt = logoCidAttachment(logoPath);
    const num = invoiceNumberLabel(invoice);

    const attachments = [];
    if (logoAtt) attachments.push(logoAtt);
    if (pdfAtt) attachments.push(pdfAtt);
    if (xmlAtt) attachments.push(xmlAtt);

    const payloadItems = Array.isArray(invoice?.payloadJson?.items)
      ? invoice.payloadJson.items
      : [];
    const demoItems = payloadItems
      .map((it) => ({
        name: String(it.description || it.name || "Producto"),
        qty: Number(it.qty || it.quantity) || 0,
        total:
          it.lineBase != null
            ? Number(it.lineBase) + Number(it.lineTax || 0)
            : Number(it.qty || 0) * Number(it.unitPrice || 0),
      }))
      .filter((it) => it.qty > 0);

    await transport.sendMail({
      from: `"${String(settings.legalName || settings.tradeName || app.alias || "Factura").slice(0, 80)}" <${from}>`,
      to,
      subject: `Factura ${num} — ${settings.legalName || settings.tradeName || app.name || "Comprobante"}`,
      text: `Estimado(a) ${invoice.customerName || "cliente"}, su factura electrónica ${num} ya está disponible. Total $${money(invoice.total)}. Adjuntamos PDF y XML.`,
      html: buildInvoiceEmailHtml({
        invoice,
        settings,
        app,
        hasLogoCid: Boolean(logoAtt),
        hasPdf: Boolean(pdfAtt),
        hasXml: Boolean(xmlAtt),
        demoItems: demoItems.length ? demoItems : null,
      }),
      attachments,
    });

    try {
      await invoice.update({ invoiceEmailSentAt: new Date() });
    } catch (e) {
      console.warn("invoiceEmailSentAt:", e?.message || e);
    }

    await bumpEmailSentCount(settings);
    const after = getInvoiceEmailQuotaPublic(await settings.reload());
    return {
      ok: true,
      skipped: false,
      to,
      pdfSource: pdfAtt?.source || null,
      warning: after.invoiceEmailWarning,
      usage: {
        sentToday: after.invoiceEmailsSentToday,
        limit: after.invoiceEmailDailyLimit,
        remaining: after.invoiceEmailsRemainingToday,
      },
    };
  } catch (e) {
    console.error("maybeSendAuthorizedInvoiceEmail:", e?.message || e);
    return {
      ok: false,
      skipped: false,
      reason: e?.message || "Error al enviar el correo de la factura.",
    };
  }
}

let invoiceEmailSentSchemaReady = false;
async function ensureInvoiceEmailSentSchema() {
  if (invoiceEmailSentSchemaReady) return;
  try {
    const [found] = await sequelize.query(
      `SHOW COLUMNS FROM \`electronic_invoices\` LIKE 'invoiceEmailSentAt'`,
    );
    if (!Array.isArray(found) || found.length === 0) {
      await sequelize.query(
        `ALTER TABLE \`electronic_invoices\` ADD COLUMN \`invoiceEmailSentAt\` DATETIME NULL`,
      );
    }
  } catch (e) {
    console.warn("ensureInvoiceEmailSentSchema:", e?.message || e);
  }
  invoiceEmailSentSchemaReady = true;
}

/** Endpoint: envía correo con PDF RIDE opcional (multipart). */
export async function sendCustomerInvoiceEmailById(invoiceId, pdfFile, { force = false } = {}) {
  await ensureInvoiceEmailSentSchema();
  const invoice = await ElectronicInvoice.findByPk(Number(invoiceId));
  if (!invoice) {
    const err = new Error("Factura no encontrada");
    err.status = 404;
    throw err;
  }
  if (String(invoice.status || "").toLowerCase() !== "authorized") {
    const err = new Error("La factura aún no está autorizada por el SRI");
    err.status = 400;
    throw err;
  }
  const result = await maybeSendAuthorizedInvoiceEmail(invoice, { pdfFile, force });
  if (!result.ok && !result.skipped) {
    const err = new Error(result.reason || "No se pudo enviar el correo");
    err.status = 500;
    throw err;
  }
  if (!result.ok && result.skipped && result.limitReached) {
    const err = new Error(result.reason);
    err.status = 429;
    err.warning = result.warning;
    throw err;
  }
  return result;
}

/** Prueba SMTP con la misma plantilla visual + PDF de muestra. */
export async function sendSriTestEmail(toAddress) {
  await ensureSriEmailSchema();
  const settings = await loadSriBillingSettings();
  const quota = getInvoiceEmailQuotaPublic(settings);
  if (!quota.smtpReady) {
    const err = new Error("Configura host, usuario, contraseña y remitente SMTP primero.");
    err.status = 400;
    throw err;
  }
  if (quota.invoiceEmailLimitReached) {
    const err = new Error(quota.invoiceEmailWarning || "Límite diario alcanzado.");
    err.status = 429;
    err.warning = quota.invoiceEmailWarning;
    throw err;
  }
  const to = String(toAddress || settings.smtpFrom || settings.smtpUser || "").trim();
  if (!to.includes("@")) {
    const err = new Error("Indica un correo de destino válido para la prueba.");
    err.status = 400;
    throw err;
  }
  const password = await decryptSmtpPassword(settings);
  if (!password) {
    const err = new Error("Contraseña SMTP vacía.");
    err.status = 400;
    throw err;
  }

  const { app, logoPath } = await resolveAppLogoPath();
  const from = String(settings.smtpFrom || settings.smtpUser).trim();
  const transport = buildTransport(settings, password);

  let samplePdf = null;
  let samplePdfPath = null;
  let sampleXmlPath = null;
  try {
    samplePdf = await generateSampleInvoicePdf(settings, logoPath);
    samplePdfPath = samplePdf.absolutePath;
  } catch (e) {
    console.warn("PDF de prueba no generado:", e?.message || e);
  }

  const sampleInvoice = {
    establishmentCode: settings.establishmentCode || "001",
    emissionPointCode: settings.emissionPointCode || "001",
    sequential: 1,
    accessKey: "0".repeat(49),
    customerName: "CLIENTE DE PRUEBA",
    total: 115,
    subtotal: 100,
    taxTotal: 15,
    authorizedAt: new Date(),
    environment: settings.environment || "pruebas",
  };

  try {
    const invoicesDir = path.join(SRI_PRIVATE_DIR, "invoices");
    fs.mkdirSync(invoicesDir, { recursive: true });
    sampleXmlPath = path.join(invoicesDir, `factura-prueba-${Date.now()}.xml`);
    const num = invoiceNumberLabel(sampleInvoice);
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>${String(settings.environment || "").toLowerCase() === "produccion" ? "2" : "1"}</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>${String(settings.legalName || "EMISOR DE PRUEBA")}</razonSocial>
    <ruc>${String(settings.ruc || "0000000000000")}</ruc>
    <claveAcceso>${sampleInvoice.accessKey}</claveAcceso>
    <codDoc>01</codDoc>
    <estab>${sampleInvoice.establishmentCode}</estab>
    <ptoEmi>${sampleInvoice.emissionPointCode}</ptoEmi>
    <secuencial>000000001</secuencial>
  </infoTributaria>
  <infoFactura>
    <razonSocialComprador>${sampleInvoice.customerName}</razonSocialComprador>
    <importeTotal>115.00</importeTotal>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>P001</codigoPrincipal>
      <descripcion>Pan de sal (demo)</descripcion>
      <cantidad>10.0000</cantidad>
      <precioUnitario>0.5000</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>5.00</precioTotalSinImpuesto>
    </detalle>
    <detalle>
      <codigoPrincipal>P002</codigoPrincipal>
      <descripcion>Cafe americano (demo)</descripcion>
      <cantidad>2.0000</cantidad>
      <precioUnitario>1.3043</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>2.61</precioTotalSinImpuesto>
    </detalle>
    <detalle>
      <codigoPrincipal>P003</codigoPrincipal>
      <descripcion>Torta porcion (demo)</descripcion>
      <cantidad>1.0000</cantidad>
      <precioUnitario>91.3900</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>91.39</precioTotalSinImpuesto>
    </detalle>
  </detalles>
  <!-- XML de demostración para correo de prueba. Nº ${num} -->
</factura>
`;
    await fsp.writeFile(sampleXmlPath, sampleXml, "utf8");
  } catch (e) {
    console.warn("XML de prueba no generado:", e?.message || e);
    sampleXmlPath = null;
  }

  const logoAtt = logoCidAttachment(logoPath);
  const attachments = [];
  if (logoAtt) attachments.push(logoAtt);
  if (samplePdfPath && fs.existsSync(samplePdfPath)) {
    attachments.push({
      filename: "factura-prueba.pdf",
      path: samplePdfPath,
      contentType: "application/pdf",
    });
  }
  if (sampleXmlPath && fs.existsSync(sampleXmlPath)) {
    attachments.push({
      filename: "factura-prueba.xml",
      path: sampleXmlPath,
      contentType: "application/xml",
    });
  }

  try {
    await transport.sendMail({
      from: `"${String(settings.legalName || app.alias || "Factura").slice(0, 80)}" <${from}>`,
      to,
      subject: "Prueba de correo — facturas SRI",
      text: "Correo de prueba de facturas. Si ves el logo y los adjuntos PDF y XML, la configuración está correcta.",
      html: buildInvoiceEmailHtml({
        invoice: sampleInvoice,
        settings,
        app,
        hasLogoCid: Boolean(logoAtt),
        hasPdf: Boolean(samplePdfPath),
        hasXml: Boolean(sampleXmlPath),
        isTest: true,
        demoItems: [
          { name: "Pan de sal (demo)", qty: 10, total: 5 },
          { name: "Café americano (demo)", qty: 2, total: 3 },
          { name: "Torta porción (demo)", qty: 1, total: 107 },
        ],
      }),
      attachments,
    });
  } finally {
    if (samplePdfPath) await unlinkQuiet(samplePdfPath);
    if (sampleXmlPath) await unlinkQuiet(sampleXmlPath);
  }

  await bumpEmailSentCount(settings);
  const after = getInvoiceEmailQuotaPublic(await settings.reload());
  return {
    ok: true,
    to,
    warning: after.invoiceEmailWarning,
    usage: {
      sentToday: after.invoiceEmailsSentToday,
      limit: after.invoiceEmailDailyLimit,
      remaining: after.invoiceEmailsRemainingToday,
    },
  };
}
