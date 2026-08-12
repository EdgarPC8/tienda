import multer from "multer";
import {
  loadSriBillingSettings,
  updateSriBillingSettings,
  toPublicSriSettings,
  saveSriCertificate,
  clearSriCertificate,
} from "../services/sriBillingService.js";
import {
  emitManualInvoice,
  emitSriDocument,
  listElectronicInvoices,
  getElectronicInvoiceById,
  refreshInvoiceAuthorization,
} from "../services/sriInvoiceEmitService.js";
import { sendSriTestEmail, sendCustomerInvoiceEmailById } from "../services/sriInvoiceEmailService.js";
import { lookupPurchaseInvoiceByAccessKey } from "../services/sriPurchaseInvoiceLookup.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    if (name.endsWith(".p12") || name.endsWith(".pfx")) cb(null, true);
    else cb(new Error("Solo se permiten archivos .p12 o .pfx"));
  },
});

const uploadRidePdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "");
    if (name.endsWith(".pdf") || mime === "application/pdf") cb(null, true);
    else cb(new Error("Solo se permite PDF"));
  },
});

export const sriCertificateUploadMiddleware = (req, res, next) => {
  upload.single("certificate")(req, res, (err) => {
    if (err) {
      notifyFail("sri.certificate_upload_failed", err.message || "Error al subir el certificado", {
        error: err,
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: err.message || "Error al subir el certificado" });
    }
    next();
  });
};

export const sriRidePdfUploadMiddleware = (req, res, next) => {
  uploadRidePdf.single("pdf")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || "Error al subir el PDF" });
    }
    next();
  });
};

export async function getSriBillingSettings(req, res) {
  try {
    const row = await loadSriBillingSettings();
    res.json(toPublicSriSettings(row));
  } catch (err) {
    console.error("getSriBillingSettings", err);
    res.status(500).json({ message: "No se pudo cargar la configuración SRI" });
  }
}

/** Busca factura de compra en el SRI por clave de acceso (código de barras RIDE). */
export async function postLookupPurchaseInvoice(req, res) {
  try {
    const result = await lookupPurchaseInvoiceByAccessKey(
      req.body?.accessKey || req.body?.claveAcceso,
      req.body?.environment,
    );
    res.json({
      message: "Comprobante encontrado en el SRI",
      ...result,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("postLookupPurchaseInvoice", err);
    notifyFail(
      "sri.purchase_invoice.lookup_failed",
      err.message || "No se pudo consultar la factura en el SRI",
      {
        error: err,
        req,
        httpStatus: status,
        extra: err.extra || {},
      },
    );
    res.status(status).json({
      message: err.message || "No se pudo consultar la factura en el SRI",
      ...(err.extra || {}),
    });
  }
}

export async function putSriBillingSettings(req, res) {
  try {
    const row = await updateSriBillingSettings(req.body || {});
    notifyOk("sri.settings_updated", "Configuración SRI actualizada", {
      settings: toPublicSriSettings(row),
    });
    res.json({
      message: "Configuración SRI guardada",
      settings: toPublicSriSettings(row),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("putSriBillingSettings", err);
    notifyFail("sri.settings_update_failed", err.message || "No se pudo guardar", {
      error: err,
      req,
      httpStatus: status,
    });
    res.status(status).json({ message: err.message || "No se pudo guardar" });
  }
}

export async function uploadSriCertificate(req, res) {
  try {
    if (!req.file) {
      notifyFail("sri.certificate_upload_failed", "Falta el archivo certificate (.p12 / .pfx)", {
        req,
        httpStatus: 400,
      });
      return res.status(400).json({ message: "Falta el archivo certificate (.p12 / .pfx)" });
    }
    const row = await saveSriCertificate({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
    });

    const password = req.body?.certificatePassword;
    if (password != null && String(password).length > 0) {
      await updateSriBillingSettings({ certificatePassword: String(password) });
    }

    const fresh = await loadSriBillingSettings();
    notifyOk("sri.certificate_uploaded", "Certificado SRI subido", {
      settings: toPublicSriSettings(fresh),
    });
    res.json({
      message: "Certificado guardado",
      settings: toPublicSriSettings(fresh),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("uploadSriCertificate", err);
    notifyFail("sri.certificate_upload_failed", err.message || "No se pudo guardar el certificado", {
      error: err,
      req,
      httpStatus: status,
    });
    res.status(status).json({ message: err.message || "No se pudo guardar el certificado" });
  }
}

export async function deleteSriCertificate(req, res) {
  try {
    const row = await clearSriCertificate();
    notifyOk("sri.certificate_deleted", "Certificado SRI eliminado", {
      settings: toPublicSriSettings(row),
    });
    res.json({
      message: "Certificado eliminado",
      settings: toPublicSriSettings(row),
    });
  } catch (err) {
    console.error("deleteSriCertificate", err);
    notifyFail("sri.certificate_delete_failed", "No se pudo eliminar el certificado", {
      error: err,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: "No se pudo eliminar el certificado" });
  }
}

export async function postEmitSriInvoice(req, res) {
  try {
    const documentType = req.body?.documentType || "01";
    const result =
      String(documentType).padStart(2, "0") === "01"
        ? await emitManualInvoice(req.body || {})
        : await emitSriDocument(documentType, req.body || {});
    const status = result.invoice?.status;
    const message =
      status === "authorized"
        ? "Comprobante autorizado por el SRI"
        : status === "rejected"
          ? "El SRI rechazó el comprobante"
          : status === "sent"
            ? "Enviado al SRI; autorización pendiente (usa Consultar)"
            : "Comprobante procesado";
    notifyOk("sri.invoice.emitted", "Factura SRI emitida", {
      invoiceId: result.invoice?.id,
      status: result.invoice?.status,
    });
    res.json({ message, ...result });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("postEmitSriInvoice", err);
    notifyFail("sri.invoice.emit_failed", err.message || "No se pudo emitir el comprobante", {
      error: err,
      req,
      httpStatus: status,
    });
    res.status(status).json({
      message: err.message || "No se pudo emitir el comprobante",
      invoice: err.invoice || null,
    });
  }
}

export async function getSriInvoices(req, res) {
  try {
    const invoices = await listElectronicInvoices({
      limit: req.query?.limit,
      documentType: req.query?.documentType,
    });
    res.json({ invoices });
  } catch (err) {
    console.error("getSriInvoices", err);
    res.status(500).json({ message: "No se pudo listar los comprobantes" });
  }
}

export async function getSriInvoiceById(req, res) {
  try {
    const invoice = await getElectronicInvoiceById(req.params.id);
    res.json({ invoice });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("getSriInvoiceById", err);
    res.status(status).json({ message: err.message || "No se pudo obtener el comprobante" });
  }
}

export async function postRefreshSriInvoice(req, res) {
  try {
    const result = await refreshInvoiceAuthorization(req.params.id);
    notifyOk("sri.invoice.refreshed", `Factura SRI consultada #${req.params.id}`, {
      invoiceId: req.params.id,
      status: result.invoice?.status,
    });
    res.json({
      message:
        result.invoice?.status === "authorized"
          ? "Autorizada"
          : result.invoice?.status === "rejected"
            ? "No autorizada / rechazada"
            : "Consulta actualizada",
      ...result,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("postRefreshSriInvoice", err);
    notifyFail("sri.invoice.refresh_failed", err.message || "No se pudo consultar la autorización", {
      error: err,
      req,
      httpStatus: status,
      extra: { invoiceId: req.params.id },
    });
    res.status(status).json({ message: err.message || "No se pudo consultar la autorización" });
  }
}

export async function postTestSriInvoiceEmail(req, res) {
  try {
    const result = await sendSriTestEmail(req.body?.to);
    notifyOk("sri.email.test_sent", "Correo de prueba SRI enviado", {
      to: result.to,
      usage: result.usage,
    });
    res.json({
      message: `Correo de prueba enviado a ${result.to}`,
      ...result,
      settings: toPublicSriSettings(await loadSriBillingSettings()),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("postTestSriInvoiceEmail", err);
    notifyFail("sri.email.test_failed", err.message || "No se pudo enviar el correo de prueba", {
      error: err,
      req,
      httpStatus: status,
    });
    res.status(status).json({
      message: err.message || "No se pudo enviar el correo de prueba",
      warning: err.warning || null,
    });
  }
}

export async function postSendSriInvoiceEmail(req, res) {
  try {
    const result = await sendCustomerInvoiceEmailById(req.params.id, req.file || null, {
      force: String(req.query?.force || req.body?.force || "") === "1",
    });
    if (result.ok) {
      notifyOk("sri.email.invoice_sent", `Factura #${req.params.id} enviada por correo`, {
        invoiceId: req.params.id,
        to: result.to,
        pdfSource: result.pdfSource,
      });
    }
    res.json({
      message: result.ok
        ? `Correo enviado a ${result.to}`
        : result.reason || "Envío omitido",
      ...result,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error("postSendSriInvoiceEmail", err);
    notifyFail("sri.email.invoice_failed", err.message || "No se pudo enviar el correo", {
      error: err,
      req,
      httpStatus: status,
      extra: { invoiceId: req.params.id },
    });
    res.status(status).json({
      message: err.message || "No se pudo enviar el correo",
      warning: err.warning || null,
    });
  }
}
