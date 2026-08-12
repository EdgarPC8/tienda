import { Op } from "sequelize";
import { Customer } from "../models/Orders.js";

export const SRI_IDENT_TYPES = new Set(["04", "05", "06", "07", "08"]);

/** Une los 4 campos de nombre; si no hay partes, usa `name` legado. */
export function composeCustomerFullName(row = {}) {
  const parts = [row.firstName, row.secondName, row.firstLastName, row.secondLastName]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
  if (parts.length) return parts.join(" ");
  return String(row.name ?? "").trim();
}

/**
 * Sync columnas + migración única:
 * clientes viejos → name completo va a firstName.
 */
export async function ensureCustomerNameSchema() {
  await Customer.sync({ alter: true });

  const rows = await Customer.findAll({
    where: {
      [Op.or]: [{ firstName: null }, { firstName: "" }],
    },
  });

  for (const row of rows) {
    const legacy = String(row.name || "").trim();
    if (!legacy) continue;
    await row.update({
      firstName: legacy,
      identType: row.identType || guessIdentType(row.cedula),
    });
  }
}

export function guessIdentType(cedula) {
  const digits = String(cedula || "").replace(/\D/g, "");
  if (digits.length === 13) return "04";
  if (digits.length === 10) return "05";
  if (String(cedula || "").trim()) return "06";
  return "05";
}

export function normalizeCustomerPayload(body = {}) {
  const payload = { ...body };

  const pick = (key) => {
    if (!(key in payload)) return undefined;
    const v = String(payload[key] ?? "").trim();
    return v || null;
  };

  if ("firstName" in payload) payload.firstName = pick("firstName");
  if ("secondName" in payload) payload.secondName = pick("secondName");
  if ("firstLastName" in payload) payload.firstLastName = pick("firstLastName");
  if ("secondLastName" in payload) payload.secondLastName = pick("secondLastName");

  if ("identType" in payload) {
    const t = String(payload.identType || "").padStart(2, "0").slice(-2);
    payload.identType = SRI_IDENT_TYPES.has(t) ? t : "05";
  }

  if ("cedula" in payload) {
    const raw = String(payload.cedula ?? "").trim();
    // RUC/cédula: solo dígitos; pasaporte/exterior: alfanumérico
    const ident = payload.identType || "05";
    if (ident === "04" || ident === "05" || ident === "07") {
      payload.cedula = raw.replace(/\D/g, "") || null;
    } else {
      payload.cedula = raw || null;
    }
  }

  // Armar nombre completo si vienen partes
  const hasParts =
    "firstName" in payload ||
    "secondName" in payload ||
    "firstLastName" in payload ||
    "secondLastName" in payload;

  if (hasParts) {
    const merged = {
      firstName: payload.firstName,
      secondName: payload.secondName,
      firstLastName: payload.firstLastName,
      secondLastName: payload.secondLastName,
      name: payload.name,
    };
    const full = composeCustomerFullName(merged);
    if (full) payload.name = full;
  }

  if ("name" in payload) {
    payload.name = String(payload.name ?? "").trim();
  }

  // Compat: solo viene `name` sin firstName → primer nombre
  if (payload.name && !payload.firstName && !("firstName" in body && body.firstName === "")) {
    if (!("firstName" in body)) {
      payload.firstName = payload.name;
    }
  }

  if (!payload.name && payload.firstName) {
    payload.name = composeCustomerFullName(payload);
  }

  if ("isActive" in body) {
    payload.isActive =
      body.isActive !== false && body.isActive !== "false" && body.isActive !== 0;
  }

  return payload;
}
