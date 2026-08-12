import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import fileDirName from "../libs/file-dirname.js";
import { sequelize } from "../database/connection.js";
import { SriBillingSettings } from "../models/SriBilling.js";
import { encryptSecret, decryptSecret } from "../utils/secretCrypto.js";

const { __dirname } = fileDirName(import.meta);

/** Carpeta privada (NO montada como static). */
export const SRI_PRIVATE_DIR = path.resolve(__dirname, "../private/sri");

const DEFAULT_EMAIL_DAILY_LIMIT = 80;
let emailSchemaReady = false;

export async function ensureSriEmailSchema() {
  if (emailSchemaReady) return;
  const cols = [
    ["enableSendInvoiceEmail", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["smtpHost", "VARCHAR(200) NULL"],
    ["smtpPort", "INT NULL DEFAULT 587"],
    ["smtpSecure", "TINYINT(1) NOT NULL DEFAULT 0"],
    ["smtpUser", "VARCHAR(200) NULL"],
    ["smtpPassEnc", "TEXT NULL"],
    ["smtpFrom", "VARCHAR(200) NULL"],
    ["invoiceEmailDailyLimit", "INT NOT NULL DEFAULT 80"],
    ["invoiceEmailsSentDate", "DATE NULL"],
    ["invoiceEmailsSentCount", "INT NOT NULL DEFAULT 0"],
  ];
  for (const [name, ddl] of cols) {
    try {
      const [found] = await sequelize.query(
        `SHOW COLUMNS FROM \`sri_billing_settings\` LIKE '${name}'`,
      );
      if (!Array.isArray(found) || found.length === 0) {
        await sequelize.query(
          `ALTER TABLE \`sri_billing_settings\` ADD COLUMN \`${name}\` ${ddl}`,
        );
      }
    } catch (e) {
      console.warn(`ensureSriEmailSchema ${name}:`, e?.message || e);
    }
  }
  emailSchemaReady = true;
}

function todayIsoDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Estado de cuota y config de correo (sin secretos). */
export function getInvoiceEmailQuotaPublic(settingsRow) {
  const j = typeof settingsRow?.toJSON === "function" ? settingsRow.toJSON() : { ...settingsRow };
  const limit = Math.max(1, Number(j.invoiceEmailDailyLimit) || DEFAULT_EMAIL_DAILY_LIMIT);
  const today = todayIsoDate();
  const sentDate = j.invoiceEmailsSentDate
    ? String(j.invoiceEmailsSentDate).slice(0, 10)
    : null;
  const count = sentDate === today ? Number(j.invoiceEmailsSentCount) || 0 : 0;
  const remaining = Math.max(0, limit - count);
  const pct = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 100;
  let warning = null;
  if (remaining <= 0) {
    warning = `Límite diario alcanzado (${count}/${limit}). No se enviarán más facturas por correo hoy.`;
  } else if (pct >= 80) {
    warning = `Cerca del límite diario de correos: ${count}/${limit} usados. Quedan ${remaining}.`;
  }
  const smtpReady = Boolean(
    String(j.smtpHost || "").trim() &&
      String(j.smtpUser || "").trim() &&
      j.smtpPassEnc &&
      String(j.smtpFrom || j.smtpUser || "").trim(),
  );
  return {
    enableSendInvoiceEmail: Boolean(j.enableSendInvoiceEmail),
    smtpHost: j.smtpHost || "",
    smtpPort: Number(j.smtpPort) || 587,
    smtpSecure: Boolean(j.smtpSecure),
    smtpUser: j.smtpUser || "",
    smtpFrom: j.smtpFrom || "",
    hasSmtpPassword: Boolean(j.smtpPassEnc),
    smtpReady,
    invoiceEmailDailyLimit: limit,
    invoiceEmailsSentToday: count,
    invoiceEmailsRemainingToday: remaining,
    invoiceEmailUsagePct: pct,
    invoiceEmailWarning: warning,
    invoiceEmailLimitReached: remaining <= 0,
  };
}

export const DEFAULT_SRI_SETTINGS = {
  id: 1,
  enabled: false,
  environment: "pruebas",
  ruc: null,
  legalName: null,
  tradeName: null,
  matrixAddress: null,
  establishmentAddress: null,
  establishmentCode: "001",
  emissionPointCode: "001",
  phone: null,
  email: null,
  accountingRequired: false,
  specialTaxpayerResolution: null,
  taxRegime: null,
  nextInvoiceSequential: 1,
  certificateRelativePath: null,
  certificatePasswordEnc: null,
  certificateFileName: null,
  certificateUploadedAt: null,
  notes: null,
  enableSendInvoiceEmail: false,
  smtpHost: null,
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: null,
  smtpPassEnc: null,
  smtpFrom: null,
  invoiceEmailDailyLimit: 80,
  invoiceEmailsSentDate: null,
  invoiceEmailsSentCount: 0,
};

export function ensureSriPrivateDir() {
  fs.mkdirSync(SRI_PRIVATE_DIR, { recursive: true });
}

export function resolveSriPrivatePath(relativePath) {
  if (!relativePath) return null;
  const safe = String(relativePath).replace(/\\/g, "/").replace(/^\/+/, "");
  if (safe.includes("..")) throw new Error("Ruta de certificado inválida");
  const full = path.resolve(SRI_PRIVATE_DIR, path.basename(safe.includes("/") ? safe.split("/").pop() : safe));
  if (!full.startsWith(SRI_PRIVATE_DIR)) throw new Error("Ruta de certificado fuera de carpeta privada");
  return full;
}

/** Respuesta segura al frontend (sin contraseña ni path interno completo). */
export function toPublicSriSettings(row) {
  if (!row) return null;
  const j = typeof row.toJSON === "function" ? row.toJSON() : { ...row };
  const hasCertificate = Boolean(j.certificateRelativePath && j.certificateFileName);
  const hasCertificatePassword = Boolean(j.certificatePasswordEnc);
  return {
    id: j.id,
    enabled: Boolean(j.enabled),
    environment: j.environment || "pruebas",
    ruc: j.ruc || "",
    legalName: j.legalName || "",
    tradeName: j.tradeName || "",
    matrixAddress: j.matrixAddress || "",
    establishmentAddress: j.establishmentAddress || "",
    establishmentCode: j.establishmentCode || "001",
    emissionPointCode: j.emissionPointCode || "001",
    phone: j.phone || "",
    email: j.email || "",
    accountingRequired: Boolean(j.accountingRequired),
    specialTaxpayerResolution: j.specialTaxpayerResolution || "",
    taxRegime: j.taxRegime || "",
    nextInvoiceSequential: Number(j.nextInvoiceSequential) || 1,
    notes: j.notes || "",
    hasCertificate,
    hasCertificatePassword,
    certificateFileName: j.certificateFileName || null,
    certificateUploadedAt: j.certificateUploadedAt || null,
    readyForInvoicing: isReadyForInvoicing(j),
    updatedAt: j.updatedAt || null,
    ...getInvoiceEmailQuotaPublic(j),
  };
}

function isReadyForInvoicing(j) {
  const ruc = String(j.ruc || "").trim();
  const legal = String(j.legalName || "").trim();
  const est = String(j.establishmentCode || "").trim();
  const emi = String(j.emissionPointCode || "").trim();
  return Boolean(
    j.enabled &&
      ruc.length === 13 &&
      legal &&
      est.length === 3 &&
      emi.length === 3 &&
      j.certificateRelativePath &&
      j.certificatePasswordEnc,
  );
}

export async function loadSriBillingSettings() {
  ensureSriPrivateDir();
  await ensureSriEmailSchema();
  await SriBillingSettings.sync();
  let row = await SriBillingSettings.findByPk(1);
  if (!row) {
    row = await SriBillingSettings.create({ ...DEFAULT_SRI_SETTINGS });
  }
  return row;
}

export async function updateSriBillingSettings(patch = {}) {
  const row = await loadSriBillingSettings();
  const allowed = [
    "enabled",
    "environment",
    "ruc",
    "legalName",
    "tradeName",
    "matrixAddress",
    "establishmentAddress",
    "establishmentCode",
    "emissionPointCode",
    "phone",
    "email",
    "accountingRequired",
    "specialTaxpayerResolution",
    "taxRegime",
    "nextInvoiceSequential",
    "notes",
    "enableSendInvoiceEmail",
    "smtpHost",
    "smtpPort",
    "smtpSecure",
    "smtpUser",
    "smtpFrom",
    "invoiceEmailDailyLimit",
  ];
  const updates = {};
  for (const key of allowed) {
    if (patch[key] === undefined) continue;
    updates[key] = patch[key];
  }

  if (updates.environment != null) {
    const env = String(updates.environment).trim();
    if (env !== "pruebas" && env !== "produccion") {
      throw Object.assign(new Error("Ambiente inválido (pruebas | produccion)"), { status: 400 });
    }
    updates.environment = env;
  }
  if (updates.ruc != null) {
    const ruc = String(updates.ruc).replace(/\D/g, "").slice(0, 13);
    updates.ruc = ruc || null;
  }
  if (updates.establishmentCode != null) {
    updates.establishmentCode = String(updates.establishmentCode).replace(/\D/g, "").padStart(3, "0").slice(-3);
  }
  if (updates.emissionPointCode != null) {
    updates.emissionPointCode = String(updates.emissionPointCode).replace(/\D/g, "").padStart(3, "0").slice(-3);
  }
  if (updates.nextInvoiceSequential != null) {
    const n = Number(updates.nextInvoiceSequential);
    if (!Number.isFinite(n) || n < 1) {
      throw Object.assign(new Error("Secuencial inválido"), { status: 400 });
    }
    updates.nextInvoiceSequential = Math.floor(n);
  }
  if (updates.accountingRequired != null) {
    updates.accountingRequired = Boolean(updates.accountingRequired);
  }
  if (updates.enabled != null) {
    updates.enabled = Boolean(updates.enabled);
  }
  if (updates.enableSendInvoiceEmail != null) {
    updates.enableSendInvoiceEmail = Boolean(updates.enableSendInvoiceEmail);
  }
  if (updates.smtpSecure != null) {
    updates.smtpSecure = Boolean(updates.smtpSecure);
  }
  if (updates.smtpPort != null) {
    const p = Number(updates.smtpPort);
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      throw Object.assign(new Error("Puerto SMTP inválido"), { status: 400 });
    }
    updates.smtpPort = Math.floor(p);
  }
  if (updates.smtpHost != null) {
    const host = String(updates.smtpHost).trim().slice(0, 200);
    if (host && host.includes("@")) {
      throw Object.assign(
        new Error(
          "El servidor SMTP (host) no es tu correo. Para Gmail usa: smtp.gmail.com. El correo va en Usuario / Remitente.",
        ),
        { status: 400 },
      );
    }
    updates.smtpHost = host || null;
  }
  if (updates.smtpUser != null) {
    updates.smtpUser = String(updates.smtpUser).trim().slice(0, 200) || null;
  }
  if (updates.smtpFrom != null) {
    updates.smtpFrom = String(updates.smtpFrom).trim().slice(0, 200) || null;
  }
  if (updates.invoiceEmailDailyLimit != null) {
    const lim = Number(updates.invoiceEmailDailyLimit);
    if (!Number.isFinite(lim) || lim < 1 || lim > 10000) {
      throw Object.assign(new Error("Límite diario de correos inválido (1–10000)"), {
        status: 400,
      });
    }
    updates.invoiceEmailDailyLimit = Math.floor(lim);
  }

  // Contraseña certificado: solo si viene no vacía
  if (patch.certificatePassword != null && String(patch.certificatePassword).length > 0) {
    updates.certificatePasswordEnc = encryptSecret(String(patch.certificatePassword));
  }
  // Contraseña SMTP: solo si viene no vacía
  if (patch.smtpPassword != null && String(patch.smtpPassword).length > 0) {
    updates.smtpPassEnc = encryptSecret(String(patch.smtpPassword));
  }

  await row.update(updates);
  return row.reload();
}

/**
 * Guarda bytes del .p12/.pfx en carpeta privada y actualiza metadatos.
 * @param {{ buffer: Buffer, originalName: string }} file
 */
export async function saveSriCertificate(file) {
  if (!file?.buffer?.length) {
    throw Object.assign(new Error("Archivo vacío"), { status: 400 });
  }
  const ext = path.extname(file.originalName || "").toLowerCase();
  if (ext !== ".p12" && ext !== ".pfx") {
    throw Object.assign(new Error("Solo se permiten archivos .p12 o .pfx"), { status: 400 });
  }

  ensureSriPrivateDir();
  const row = await loadSriBillingSettings();

  // Eliminar certificado anterior
  if (row.certificateRelativePath) {
    try {
      const oldFull = path.join(SRI_PRIVATE_DIR, path.basename(row.certificateRelativePath));
      await fsp.unlink(oldFull);
    } catch {
      /* ok */
    }
  }

  const stamp = Date.now();
  const fileName = `firma_${stamp}${ext}`;
  const full = path.join(SRI_PRIVATE_DIR, fileName);
  await fsp.writeFile(full, file.buffer);

  await row.update({
    certificateRelativePath: fileName,
    certificateFileName: path.basename(file.originalName || fileName),
    certificateUploadedAt: new Date(),
  });
  return row.reload();
}

export async function clearSriCertificate() {
  const row = await loadSriBillingSettings();
  if (row.certificateRelativePath) {
    try {
      await fsp.unlink(path.join(SRI_PRIVATE_DIR, path.basename(row.certificateRelativePath)));
    } catch {
      /* ok */
    }
  }
  await row.update({
    certificateRelativePath: null,
    certificateFileName: null,
    certificateUploadedAt: null,
    certificatePasswordEnc: null,
  });
  return row.reload();
}

/** Uso interno futuro: leer certificado + contraseña descifrada. */
export async function getSriCertificateSecrets() {
  const row = await loadSriBillingSettings();
  if (!row.certificateRelativePath) return null;
  const full = path.join(SRI_PRIVATE_DIR, path.basename(row.certificateRelativePath));
  const buffer = await fsp.readFile(full);
  const password = decryptSecret(row.certificatePasswordEnc);
  return {
    buffer,
    password,
    fileName: row.certificateFileName,
    environment: row.environment,
  };
}
