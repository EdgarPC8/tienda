import { consultAuthorization } from "./sriSoapClient.js";

/** Normaliza clave de acceso / código de barras RIDE (49 dígitos). */
export function normalizeSriAccessKey(raw) {
  const digits = String(raw || "")
    .replace(/[\uFF10-\uFF19]/g, (ch) => String(ch.charCodeAt(0) - 0xff10))
    .replace(/\D/g, "");
  if (digits.length === 49) return digits;
  return "";
}

/**
 * Consulta en el SRI una factura (propia o de tercero) por clave de acceso
 * y devuelve el XML del comprobante para importar compra.
 */
export async function lookupPurchaseInvoiceByAccessKey(accessKeyInput, environmentHint) {
  const accessKey = normalizeSriAccessKey(accessKeyInput);
  if (!accessKey) {
    const err = new Error(
      "La clave de acceso debe tener 49 dígitos (código de barras / autorización del RIDE).",
    );
    err.status = 400;
    throw err;
  }

  let preferred = String(environmentHint || "").toLowerCase();
  if (preferred !== "pruebas" && preferred !== "produccion") {
    // Facturas de proveedor casi siempre son de producción.
    preferred = "produccion";
  }

  const order =
    preferred === "pruebas" ? ["pruebas", "produccion"] : ["produccion", "pruebas"];

  let last = null;
  for (const env of order) {
    try {
      last = await consultAuthorization(env, accessKey);
    } catch (err) {
      last = {
        estado: "ERROR",
        messages: [err?.message || "Error de red al consultar el SRI"],
        authorizedXml: null,
      };
      continue;
    }
    const st = String(last?.estado || "").toUpperCase();
    if (st === "AUTORIZADO" && last.authorizedXml) {
      return {
        accessKey,
        environment: env,
        estado: last.estado,
        numeroAutorizacion: last.numeroAutorizacion || accessKey,
        fechaAutorizacion: last.fechaAutorizacion || null,
        messages: last.messages || [],
        xml: last.authorizedXml,
      };
    }
    if (st === "AUTORIZADO" && !last.authorizedXml) {
      // Probar el otro ambiente por si el XML vino vacío por parsing.
      continue;
    }
    // NO AUTORIZADO / RECHAZADO / SIN_AUTORIZACION → probar el otro ambiente
  }

  const st = String(last?.estado || "").toUpperCase();
  if (st === "AUTORIZADO" && !last?.authorizedXml) {
    const err = new Error(
      "El SRI autorizó el comprobante pero no devolvió el XML. Probá subiendo el archivo .xml.",
    );
    err.status = 502;
    throw err;
  }
  if (
    st === "NO AUTORIZADO" ||
    st === "RECHAZADO" ||
    st === "RECHAZADA" ||
    st === "ERROR"
  ) {
    const err = new Error(
      last.messages?.join(" · ") || `Comprobante ${st.toLowerCase()} en el SRI.`,
    );
    err.status = 404;
    err.extra = { estado: st, accessKey };
    throw err;
  }

  const err = new Error(
    last?.messages?.join(" · ") ||
      "No se encontró el comprobante autorizado en el SRI con esa clave. Verificá que sean los 49 dígitos del RIDE (producción).",
  );
  err.status = 404;
  err.extra = {
    estado: last?.estado || "SIN_AUTORIZACION",
    accessKey,
  };
  throw err;
}
