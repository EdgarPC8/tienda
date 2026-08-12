import axios from "axios";
import { XMLParser } from "fast-xml-parser";

const RECEPCION = {
  pruebas:
    "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
  produccion:
    "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline",
};

const AUTORIZACION = {
  pruebas:
    "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
  produccion:
    "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
  // Clave acceso / nº autorización SRI (49 dígitos) no caben en Number de JS.
  numberParseOptions: {
    hex: false,
    leadingZeros: true,
    eNotation: false,
    skipLike: /^\d{15,}$/,
  },
});

/** Claves SRI siempre como dígitos (nunca notación científica). */
function asSriDigitKey(value, fallback = null) {
  const raw = value == null ? "" : String(value).trim();
  if (/^\d{40,}$/.test(raw)) return raw;
  const fb = fallback == null ? "" : String(fallback).trim();
  if (/^\d{40,}$/.test(fb)) return fb;
  if (raw && !/e[+-]?\d+$/i.test(raw)) return raw;
  return fb || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findDeep(obj, key) {
  if (obj == null) return undefined;
  if (typeof obj !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const v of Object.values(obj)) {
    const found = findDeep(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

function asArray(val) {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

function soapFaultMessage(parsed) {
  const fault = findDeep(parsed, "Fault") || findDeep(parsed, "faultstring");
  if (!fault) return null;
  if (typeof fault === "string") return fault;
  return fault.faultstring || fault.faultcode || JSON.stringify(fault);
}

/**
 * @param {"pruebas"|"produccion"} environment
 * @param {string} signedXml
 */
export async function sendReception(environment, signedXml) {
  const url = RECEPCION[environment] || RECEPCION.pruebas;
  const b64 = Buffer.from(signedXml, "utf8").toString("base64");
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:validarComprobante>
      <xml>${b64}</xml>
    </ec:validarComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  const { data } = await axios.post(url, envelope, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    timeout: 60000,
    validateStatus: () => true,
  });

  const parsed = parser.parse(String(data || ""));
  const fault = soapFaultMessage(parsed);
  if (fault) {
    return { estado: "ERROR", messages: [fault], raw: data };
  }

  const estado = String(findDeep(parsed, "estado") || "").toUpperCase();
  const comps = asArray(findDeep(parsed, "comprobante") || findDeep(parsed, "comprobantes"));
  const messages = [];
  for (const c of comps) {
    const msgs = asArray(c?.mensajes?.mensaje || c?.mensaje);
    for (const m of msgs) {
      const text = [m?.identificador, m?.mensaje, m?.informacionAdicional, m?.tipo]
        .filter(Boolean)
        .join(" · ");
      if (text) messages.push(text);
    }
  }
  const topMsgs = asArray(findDeep(parsed, "mensaje"));
  for (const m of topMsgs) {
    if (typeof m === "string") messages.push(m);
    else if (m && typeof m === "object") {
      const text = [m.identificador, m.mensaje, m.informacionAdicional].filter(Boolean).join(" · ");
      if (text) messages.push(text);
    }
  }

  return {
    estado: estado || "DESCONOCIDO",
    messages: [...new Set(messages)],
    raw: typeof data === "string" ? data.slice(0, 4000) : data,
  };
}

const COMPROBANTE_ROOT_RE =
  /<(factura|notaCredito|liquidacionCompra|notaDebito)\b/i;

/** Desescapa entidades XML (&lt; → <, &#xD; → CR). Soporta doble escape del SRI. */
export function unescapeXmlEntities(value) {
  let out = String(value || "");
  for (let i = 0; i < 3; i += 1) {
    if (!out.includes("&")) break;
    const next = out
      // Numéricas primero (SRI mete &#xD; fuera del contenido y rompe el parser)
      .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => {
        const cp = parseInt(hex, 16);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
      })
      .replace(/&#([0-9]+);/g, (_, dec) => {
        const cp = Number(dec);
        return Number.isFinite(cp) ? String.fromCodePoint(cp) : _;
      })
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, "&");
    if (next === out) break;
    out = next;
  }
  return out;
}

function isComprobanteXml(text) {
  return COMPROBANTE_ROOT_RE.test(String(text || ""));
}

/**
 * Normaliza el nodo <comprobante> del SRI (string escapado, #text, CDATA o SOAP crudo).
 */
export function coerceAuthorizedComprobanteXml(comprobante, rawSoap) {
  let xml = null;

  if (typeof comprobante === "string") {
    xml = unescapeXmlEntities(comprobante.trim());
  } else if (comprobante && typeof comprobante === "object") {
    if (typeof comprobante["#text"] === "string") {
      xml = unescapeXmlEntities(String(comprobante["#text"]).trim());
    } else if (typeof comprobante.__cdata === "string") {
      xml = String(comprobante.__cdata).trim();
    }
  }

  if (!isComprobanteXml(xml)) {
    const fromRaw = extractComprobanteXmlFromSoap(rawSoap);
    if (fromRaw) xml = fromRaw;
  }

  if (isComprobanteXml(xml)) return String(xml).trim();
  return null;
}

/** Extrae el XML del comprobante desde la respuesta SOAP cruda (CDATA o escapado). */
export function extractComprobanteXmlFromSoap(rawSoap) {
  const raw = String(rawSoap || "");
  if (!raw) return null;

  const cdataTag = raw.match(
    /<(?:\w+:)?comprobante[^>]*>\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*<\/(?:\w+:)?comprobante>/i,
  );
  if (cdataTag?.[1]?.trim()) return cdataTag[1].trim();

  // Cualquier CDATA que contenga factura
  const anyCdata = [...raw.matchAll(/<!\[CDATA\[([\s\S]*?)\]\]>/gi)];
  for (const m of anyCdata) {
    const inner = String(m[1] || "").trim();
    if (isComprobanteXml(inner)) return inner;
  }

  const plain = raw.match(
    /<(?:\w+:)?comprobante[^>]*>([\s\S]*?)<\/(?:\w+:)?comprobante>/i,
  );
  if (!plain?.[1]) return null;
  const inner = unescapeXmlEntities(plain[1].trim());
  if (isComprobanteXml(inner)) return inner.trim();
  return null;
}

/**
 * @param {"pruebas"|"produccion"} environment
 * @param {string} accessKey
 */
export async function consultAuthorization(environment, accessKey) {
  const url = AUTORIZACION[environment] || AUTORIZACION.pruebas;
  const envelope = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
  <soapenv:Header/>
  <soapenv:Body>
    <ec:autorizacionComprobante>
      <claveAccesoComprobante>${accessKey}</claveAccesoComprobante>
    </ec:autorizacionComprobante>
  </soapenv:Body>
</soapenv:Envelope>`;

  const { data } = await axios.post(url, envelope, {
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: "",
    },
    timeout: 60000,
    validateStatus: () => true,
  });

  const rawSoap = String(data || "");
  const parsed = parser.parse(rawSoap);
  const fault = soapFaultMessage(parsed);
  if (fault) {
    return {
      estado: "ERROR",
      numeroAutorizacion: null,
      fechaAutorizacion: null,
      messages: [fault],
      authorizedXml: null,
    };
  }

  const auths = asArray(findDeep(parsed, "autorizacion"));
  // Prefer AUTORIZADO; else first entry
  let chosen =
    auths.find((a) => String(a?.estado || "").toUpperCase() === "AUTORIZADO") || auths[0] || null;

  const estado = String(chosen?.estado || findDeep(parsed, "estado") || "SIN_AUTORIZACION").toUpperCase();
  const messages = [];
  const msgs = asArray(chosen?.mensajes?.mensaje || chosen?.mensaje);
  for (const m of msgs) {
    const text = [m?.identificador, m?.mensaje, m?.informacionAdicional, m?.tipo]
      .filter(Boolean)
      .join(" · ");
    if (text) messages.push(text);
  }

  const authorizedXml = coerceAuthorizedComprobanteXml(chosen?.comprobante, rawSoap);

  return {
    estado,
    numeroAutorizacion: asSriDigitKey(chosen?.numeroAutorizacion, accessKey),
    fechaAutorizacion: chosen?.fechaAutorizacion || null,
    messages: [...new Set(messages)],
    authorizedXml,
  };
}

/**
 * Consulta autorización con reintentos (el SRI a veces demora unos segundos).
 */
export async function consultAuthorizationWithRetry(environment, accessKey, { attempts = 4, delayMs = 2500 } = {}) {
  let last = null;
  for (let i = 0; i < attempts; i += 1) {
    if (i > 0) await sleep(delayMs);
    last = await consultAuthorization(environment, accessKey);
    const st = String(last.estado || "").toUpperCase();
    if (st === "AUTORIZADO" || st === "NO AUTORIZADO" || st === "RECHAZADO") {
      return last;
    }
  }
  return last;
}
