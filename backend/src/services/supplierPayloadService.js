import { SRI_IDENT_TYPES } from "./customerNameService.js";

const SUPPLIER_FIELDS = [
  "name",
  "tradeName",
  "identType",
  "identNumber",
  "category",
  "contactName",
  "contactRole",
  "phone",
  "whatsapp",
  "email",
  "invoiceEmail",
  "website",
  "address",
  "city",
  "province",
  "bankName",
  "bankAccountType",
  "bankAccountNumber",
  "paymentTermDays",
  "preferredPaymentMethod",
  "notes",
  "isActive",
];

function trimOrNull(value) {
  const v = String(value ?? "").trim();
  return v || null;
}

export function normalizeSupplierPayload(body = {}) {
  const payload = {};

  for (const key of SUPPLIER_FIELDS) {
    if (!(key in body)) continue;

    if (key === "isActive") {
      payload.isActive = body.isActive !== false && body.isActive !== "false" && body.isActive !== 0;
      continue;
    }

    if (key === "paymentTermDays") {
      const raw = body.paymentTermDays;
      if (raw == null || raw === "") {
        payload.paymentTermDays = null;
      } else {
        const n = Number(raw);
        payload.paymentTermDays = Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
      }
      continue;
    }

    if (key === "identType") {
      const t = String(body.identType || "").padStart(2, "0").slice(-2);
      payload.identType = SRI_IDENT_TYPES.has(t) ? t : "04";
      continue;
    }

    if (key === "identNumber") {
      const raw = String(body.identNumber ?? "").trim();
      const ident = payload.identType || body.identType || "04";
      if (ident === "04" || ident === "05" || ident === "07") {
        payload.identNumber = raw.replace(/\D/g, "") || null;
      } else {
        payload.identNumber = raw || null;
      }
      continue;
    }

    if (key === "name") {
      payload.name = String(body.name ?? "").trim();
      continue;
    }

    payload[key] = trimOrNull(body[key]);
  }

  return payload;
}
