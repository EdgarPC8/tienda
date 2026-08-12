import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { createRequire } from "module";
import {
  signInvoiceXml,
  signCreditNoteXml,
  signDebitNoteXml,
  signDeliveryGuideXml,
  signWithholdingCertificateXml,
} from "ec-sri-invoice-signer";
import { ElectronicInvoice } from "../models/SriBilling.js";
import { sequelize } from "../database/connection.js";
import {
  loadSriBillingSettings,
  toPublicSriSettings,
  getSriCertificateSecrets,
  SRI_PRIVATE_DIR,
  ensureSriPrivateDir,
} from "./sriBillingService.js";
import { buildAccessKey } from "./sriAccessKey.js";
import { buildFacturaXml, computeInvoiceTotals } from "./sriInvoiceXml.js";
import {
  buildNotaCreditoXml,
  buildNotaDebitoXml,
  buildGuiaRemisionXml,
  buildRetencionXml,
  buildLiquidacionCompraXml,
} from "./sriOtherDocsXml.js";
import { sendReception, consultAuthorizationWithRetry, consultAuthorization } from "./sriSoapClient.js";

const require = createRequire(import.meta.url);
const { signDocumentXml } = require("ec-sri-invoice-signer/dist/src/signature/signature.js");

const INVOICES_DIR = path.join(SRI_PRIVATE_DIR, "invoices");

export const SRI_DOC_TYPES = {
  "01": { label: "Factura", root: "factura" },
  "03": { label: "Liquidación de compra", root: "liquidacionCompra" },
  "04": { label: "Nota de crédito", root: "notaCredito" },
  "05": { label: "Nota de débito", root: "notaDebito" },
  "06": { label: "Guía de remisión", root: "guiaRemision" },
  "07": { label: "Retención", root: "comprobanteRetencion" },
};

function ensureInvoicesDir() {
  ensureSriPrivateDir();
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
}

async function ensureInvoiceTable() {
  await ElectronicInvoice.sync();
  const cols = [
    ["iceTotal", "DECIMAL(14,4) NOT NULL DEFAULT 0"],
    ["ridePdfRelativePath", "VARCHAR(255) NULL"],
    ["invoiceEmailSentAt", "DATETIME NULL"],
  ];
  for (const [name, ddl] of cols) {
    try {
      const [found] = await sequelize.query(
        `SHOW COLUMNS FROM \`electronic_invoices\` LIKE '${name}'`,
      );
      if (!Array.isArray(found) || found.length === 0) {
        await sequelize.query(
          `ALTER TABLE \`electronic_invoices\` ADD COLUMN \`${name}\` ${ddl}`,
        );
      }
    } catch (e) {
      console.warn(`ensureInvoiceTable ${name}:`, e?.message || e);
    }
  }
}

function validateParty(party = {}, { role = "comprador", allowConsumidorFinal = true } = {}) {
  const identType = String(party.identType || "").trim();
  const ident = String(party.ident || "").replace(/\s/g, "").trim();
  const name = String(party.name || "").trim();
  const allowed = allowConsumidorFinal
    ? ["04", "05", "06", "07", "08"]
    : ["04", "05", "06", "08"];
  if (!allowed.includes(identType)) {
    throw Object.assign(
      new Error(`Tipo de identificación inválido para ${role}`),
      { status: 400 },
    );
  }
  if (!ident) {
    throw Object.assign(new Error(`Falta identificación del ${role}`), { status: 400 });
  }
  if (identType === "04" && ident.length !== 13) {
    throw Object.assign(new Error(`RUC del ${role} debe tener 13 dígitos`), { status: 400 });
  }
  if (identType === "05" && ident.length !== 10) {
    throw Object.assign(new Error(`Cédula del ${role} debe tener 10 dígitos`), { status: 400 });
  }
  if (!name) {
    throw Object.assign(new Error(`Falta nombre / razón social del ${role}`), { status: 400 });
  }
  return {
    identType,
    ident,
    name,
    address: String(party.address || "S/N").trim() || "S/N",
    email: String(party.email || "").trim(),
  };
}

function normalizeItems(rawItems, pricesIncludeTax) {
  return rawItems.map((it) => {
    const taxRate = Number(it.taxRate);
    const rate = Number.isFinite(taxRate) ? taxRate : 15;
    const qty = Number(it.qty);
    let unitPrice = Number(it.unitPrice);
    const row = {
      description: it.description,
      qty,
      unitPrice,
      taxRate: rate,
      code: it.code,
    };
    // Precio CON IVA (Caja): redondear bruto a 2, base/IVA a 2 (IVA absorbe residual).
    if (pricesIncludeTax && Number.isFinite(unitPrice) && Number.isFinite(qty) && qty > 0) {
      if (rate > 0) {
        const gross = Number((qty * unitPrice).toFixed(2));
        const lineBase = Number((gross / (1 + rate / 100)).toFixed(2));
        const lineTax = Number((gross - lineBase).toFixed(2));
        row.lineBase = lineBase;
        row.lineTax = lineTax;
        row.unitPrice = lineBase / qty;
        row.unitPriceXml = lineBase / qty;
      } else {
        const gross = Number((qty * unitPrice).toFixed(2));
        row.lineBase = gross;
        row.lineTax = 0;
        row.unitPrice = qty > 0 ? gross / qty : unitPrice;
        row.unitPriceXml = row.unitPrice;
      }
    }
    return row;
  });
}

function toPublicInvoice(row) {
  if (!row) return null;
  const j = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
  return {
    id: j.id,
    environment: j.environment,
    documentType: j.documentType,
    documentLabel: SRI_DOC_TYPES[j.documentType]?.label || j.documentType,
    establishmentCode: j.establishmentCode,
    emissionPointCode: j.emissionPointCode,
    sequential: j.sequential,
    accessKey: j.accessKey,
    authorizationNumber: j.authorizationNumber,
    authorizedAt: j.authorizedAt,
    status: j.status,
    customerIdentType: j.customerIdentType,
    customerIdent: j.customerIdent,
    customerName: j.customerName,
    customerEmail: j.customerEmail,
    subtotal: j.subtotal != null ? Number(j.subtotal) : null,
    iceTotal: j.iceTotal != null ? Number(j.iceTotal) : 0,
    taxTotal: j.taxTotal != null ? Number(j.taxTotal) : null,
    total: j.total != null ? Number(j.total) : null,
    currency: j.currency,
    sriMessage: j.sriMessage,
    payloadJson: j.payloadJson,
    orderId: j.orderId != null ? Number(j.orderId) : null,
    customerId: j.customerId != null ? Number(j.customerId) : null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
  };
}

async function applyAuthorizationResult(invoice, auth) {
  const st = String(auth?.estado || "").toUpperCase();
  const msgParts = [st, ...(auth?.messages || [])].filter(Boolean);
  const sriMessage = msgParts.join(" | ").slice(0, 4000);

  if (st === "AUTORIZADO") {
    let authorizedAt = new Date();
    if (auth.fechaAutorizacion) {
      const parsed = new Date(auth.fechaAutorizacion);
      if (!Number.isNaN(parsed.getTime())) authorizedAt = parsed;
    }
    await invoice.update({
      status: "authorized",
      authorizationNumber: (() => {
        const raw = auth.numeroAutorizacion == null ? "" : String(auth.numeroAutorizacion).trim();
        if (/^\d{40,}$/.test(raw)) return raw;
        const key = invoice.accessKey == null ? "" : String(invoice.accessKey).trim();
        if (/^\d{40,}$/.test(key)) return key;
        return raw || key || null;
      })(),
      authorizedAt,
      sriMessage,
    });
    // El correo con PDF RIDE (mismo de “Descargar”) lo dispara el frontend tras autorizar.
  } else if (st === "NO AUTORIZADO" || st === "RECHAZADO") {
    await invoice.update({ status: "rejected", sriMessage });
  } else if (st && st !== "SIN_AUTORIZACION") {
    await invoice.update({ sriMessage });
  }
  return invoice.reload();
}

async function nextSequentialFor(documentType, establishmentCode, emissionPointCode) {
  const max = await ElectronicInvoice.max("sequential", {
    where: { documentType, establishmentCode, emissionPointCode },
  });
  const n = Number(max);
  return Number.isFinite(n) && n > 0 ? n + 1 : 1;
}

function signXml(documentType, unsignedXml, buffer, password) {
  const opts = { pkcs12Password: String(password ?? "") };
  switch (documentType) {
    case "01":
      return signInvoiceXml(unsignedXml, buffer, opts);
    case "03":
      return signDocumentXml(unsignedXml, buffer, "liquidacionCompra", opts);
    case "04":
      return signCreditNoteXml(unsignedXml, buffer, opts);
    case "05":
      return signDebitNoteXml(unsignedXml, buffer, opts);
    case "06":
      return signDeliveryGuideXml(unsignedXml, buffer, opts);
    case "07":
      return signWithholdingCertificateXml(unsignedXml, buffer, opts);
    default:
      throw Object.assign(new Error("Tipo de documento no soportado"), { status: 400 });
  }
}

function buildXmlForType(documentType, ctx) {
  switch (documentType) {
    case "01":
      return buildFacturaXml(ctx);
    case "03":
      return buildLiquidacionCompraXml({ ...ctx, supplier: ctx.buyer });
    case "04":
      return buildNotaCreditoXml(ctx);
    case "05":
      return buildNotaDebitoXml(ctx);
    case "06":
      return buildGuiaRemisionXml(ctx);
    case "07":
      return buildRetencionXml(ctx);
    default:
      throw Object.assign(new Error("Tipo de documento no soportado"), { status: 400 });
  }
}

/**
 * Emisión genérica al SRI.
 * @param {string} documentType 01|03|04|05|06|07
 * @param {object} payload
 */
export async function emitSriDocument(documentType, payload = {}) {
  const docType = String(documentType || "01").padStart(2, "0");
  if (!SRI_DOC_TYPES[docType]) {
    throw Object.assign(new Error("Tipo de comprobante inválido"), { status: 400 });
  }

  await ensureInvoiceTable();
  ensureInvoicesDir();

  const settingsRow = await loadSriBillingSettings();
  const publicSettings = toPublicSriSettings(settingsRow);
  if (!publicSettings.readyForInvoicing) {
    throw Object.assign(
      new Error("Configuración SRI incompleta. Revisa RUC, datos, certificado y contraseña (y activa el módulo)."),
      { status: 400 },
    );
  }

  const secrets = await getSriCertificateSecrets();
  if (!secrets?.buffer || secrets.password == null) {
    throw Object.assign(new Error("No se pudo leer el certificado o la contraseña"), { status: 400 });
  }

  const issueDate = new Date();
  const est = settingsRow.establishmentCode;
  const emi = settingsRow.emissionPointCode;
  let sequential = await nextSequentialFor(docType, est, emi);
  // Mantener coherencia con nextInvoiceSequential para facturas
  if (docType === "01") {
    const fromSettings = Number(settingsRow.nextInvoiceSequential) || 1;
    sequential = Math.max(sequential, fromSettings);
  }

  const accessKey = buildAccessKey({
    issueDate,
    documentType: docType,
    ruc: settingsRow.ruc,
    environment: settingsRow.environment,
    establishmentCode: est,
    emissionPointCode: emi,
    sequential,
  });

  let buyer = null;
  let totals = { subtotal: 0, taxTotal: 0, total: 0, lines: [], taxBuckets: [] };
  let unsignedXml;
  let partyForDb = { identType: null, ident: null, name: null, email: null };
  const paymentMethod = String(payload.paymentMethod || "01").replace(/\D/g, "").padStart(2, "0").slice(-2);

  if (docType === "06") {
    const transport = {
      identType: payload.transport?.identType || "04",
      ident: payload.transport?.ident || settingsRow.ruc,
      name: payload.transport?.name || settingsRow.legalName,
      placa: payload.transport?.placa || "AAA0000",
      dirPartida: payload.transport?.dirPartida || "",
      startDate: payload.transport?.startDate,
      endDate: payload.transport?.endDate,
    };
    const destinatario = validateParty(payload.destinatario || payload.buyer || {}, {
      role: "destinatario",
      allowConsumidorFinal: true,
    });
    Object.assign(destinatario, {
      motivo: payload.destinatario?.motivo || payload.motivo || "TRASLADO DE MERCADERIA",
      ruta: payload.destinatario?.ruta || "LOCAL",
      docNumber: payload.destinatario?.docNumber,
      codDoc: payload.destinatario?.codDoc,
      authNumber: payload.destinatario?.authNumber,
      docDate: payload.destinatario?.docDate,
    });
    const items = Array.isArray(payload.items) ? payload.items : [];
    unsignedXml = buildGuiaRemisionXml({
      settings: settingsRow,
      accessKey,
      sequential,
      issueDate,
      transport,
      destinatario,
      items,
    });
    partyForDb = destinatario;
    totals.total = 0;
  } else if (docType === "07") {
    const subject = validateParty(payload.subject || payload.buyer || {}, {
      role: "sujeto retenido",
      allowConsumidorFinal: false,
    });
    unsignedXml = buildRetencionXml({
      settings: settingsRow,
      accessKey,
      sequential,
      issueDate,
      subject,
      sustento: payload.sustento || {},
      retention: payload.retention || {},
    });
    partyForDb = subject;
    const base = Number(payload.retention?.baseImponible) || 0;
    const pct = Number(payload.retention?.porcentaje) || 0;
    totals = { subtotal: base, taxTotal: 0, total: (base * pct) / 100, lines: [], taxBuckets: [] };
  } else {
    buyer = validateParty(payload.buyer || payload.supplier || {}, {
      role: docType === "03" ? "proveedor" : "comprador",
      allowConsumidorFinal: docType !== "03",
    });
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    if (!rawItems.length) {
      throw Object.assign(new Error("Agrega al menos un ítem"), { status: 400 });
    }
    const normalizedItems = normalizeItems(rawItems, Boolean(payload.pricesIncludeTax));
    totals = computeInvoiceTotals(normalizedItems);

    if ((docType === "04" || docType === "05") && !payload.modifiedDoc?.number) {
      throw Object.assign(
        new Error("Indica el número de documento modificado (ej. 001-001-000000001)"),
        { status: 400 },
      );
    }

    unsignedXml = buildXmlForType(docType, {
      settings: settingsRow,
      accessKey,
      sequential,
      issueDate,
      buyer,
      totals,
      paymentMethod,
      modifiedDoc: payload.modifiedDoc || {},
      motivo: payload.motivo || (docType === "04" ? "DEVOLUCION" : "AJUSTE"),
      supplier: buyer,
    });
    partyForDb = buyer;
  }

  let signedXml;
  try {
    signedXml = signXml(docType, unsignedXml, secrets.buffer, secrets.password);
  } catch (err) {
    throw Object.assign(
      new Error(`Error al firmar el XML: ${err.message || "certificado o XML inválido"}`),
      { status: 400 },
    );
  }

  const fileName = `${accessKey}.xml`;
  await fsp.writeFile(path.join(INVOICES_DIR, fileName), signedXml, "utf8");

  let invoice = await ElectronicInvoice.create({
    environment: settingsRow.environment,
    documentType: docType,
    establishmentCode: est,
    emissionPointCode: emi,
    sequential,
    accessKey,
    status: "signed",
    customerId: payload.customerId != null ? Number(payload.customerId) : null,
    orderId: payload.orderId != null ? Number(payload.orderId) : null,
    customerIdentType: partyForDb.identType,
    customerIdent: partyForDb.ident,
    customerName: partyForDb.name,
    customerEmail: partyForDb.email || null,
    subtotal: totals.subtotal.toFixed(4),
    taxTotal: totals.taxTotal.toFixed(4),
    total: totals.total.toFixed(4),
    currency: "USD",
    xmlRelativePath: `invoices/${fileName}`,
    sriMessage: "Firmado, pendiente de envío",
    payloadJson: { documentType: docType, ...payload },
  });

  if (docType === "01") {
    await settingsRow.update({ nextInvoiceSequential: sequential + 1 });
  }

  let reception;
  try {
    reception = await sendReception(settingsRow.environment, signedXml);
  } catch (err) {
    await invoice.update({
      status: "signed",
      sriMessage: `Firma OK, error de red al enviar: ${err.message}`.slice(0, 4000),
    });
    throw Object.assign(
      new Error(`No se pudo conectar al SRI (recepción): ${err.message}`),
      { status: 502, invoice: toPublicInvoice(await invoice.reload()) },
    );
  }

  const recEstado = String(reception.estado || "").toUpperCase();
  const recMsg = [recEstado, ...(reception.messages || [])].filter(Boolean).join(" | ").slice(0, 4000);

  if (recEstado !== "RECIBIDA") {
    await invoice.update({ status: "rejected", sriMessage: recMsg || "Rechazado en recepción" });
    return {
      invoice: toPublicInvoice(await invoice.reload()),
      reception,
      authorization: null,
    };
  }

  await invoice.update({ status: "sent", sriMessage: recMsg });

  let authorization = null;
  try {
    authorization = await consultAuthorizationWithRetry(settingsRow.environment, accessKey, {
      attempts: 5,
      delayMs: 2000,
    });
    invoice = await applyAuthorizationResult(await invoice.reload(), authorization);
  } catch (err) {
    await invoice.update({
      sriMessage: `${recMsg} | Autorización pendiente: ${err.message}`.slice(0, 4000),
    });
    invoice = await invoice.reload();
  }

  return {
    invoice: toPublicInvoice(invoice),
    reception,
    authorization,
  };
}

/** Compat: factura (01). */
export async function emitManualInvoice(payload = {}) {
  return emitSriDocument("01", payload);
}

export async function listElectronicInvoices({ limit = 50, documentType } = {}) {
  await ensureInvoiceTable();
  const where = {};
  if (documentType) where.documentType = String(documentType).padStart(2, "0");
  const rows = await ElectronicInvoice.findAll({
    where,
    order: [["id", "DESC"]],
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
  });
  return rows.map(toPublicInvoice);
}

export async function getElectronicInvoiceById(id) {
  await ensureInvoiceTable();
  const row = await ElectronicInvoice.findByPk(id);
  if (!row) {
    throw Object.assign(new Error("Comprobante no encontrado"), { status: 404 });
  }
  return toPublicInvoice(row);
}

export async function refreshInvoiceAuthorization(id) {
  await ensureInvoiceTable();
  const row = await ElectronicInvoice.findByPk(id);
  if (!row) {
    throw Object.assign(new Error("Comprobante no encontrado"), { status: 404 });
  }
  if (!row.accessKey) {
    throw Object.assign(new Error("El comprobante no tiene clave de acceso"), { status: 400 });
  }

  let auth;
  try {
    auth = await consultAuthorization(row.environment, row.accessKey);
  } catch (err) {
    throw Object.assign(new Error(`No se pudo consultar al SRI: ${err.message}`), { status: 502 });
  }

  const updated = await applyAuthorizationResult(row, auth);
  return {
    invoice: toPublicInvoice(updated),
    authorization: auth,
  };
}

export { toPublicInvoice };
