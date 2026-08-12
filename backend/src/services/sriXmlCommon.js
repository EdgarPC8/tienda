import { padDigits, sriAmbienteCode } from "./sriAccessKey.js";

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

export function money4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.0000";
  return x.toFixed(4);
}

export function formatIssueDate(d) {
  const dd = padDigits(d.getDate(), 2);
  const mm = padDigits(d.getMonth() + 1, 2);
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function formatPeriodoFiscal(d) {
  const mm = padDigits(d.getMonth() + 1, 2);
  const yyyy = d.getFullYear();
  return `${mm}/${yyyy}`;
}

export function dirEstablecimiento(settings) {
  return esc(settings.establishmentAddress || settings.matrixAddress || "S/N");
}

export function dirMatriz(settings) {
  return esc(settings.matrixAddress || settings.establishmentAddress || "S/N");
}

export function obligadoContabilidad(settings) {
  return settings.accountingRequired ? "SI" : "NO";
}

/** infoTributaria común para cualquier comprobante. */
export function buildInfoTributariaXml(settings, { accessKey, sequential, codDoc }) {
  const est = padDigits(settings.establishmentCode, 3);
  const emi = padDigits(settings.emissionPointCode, 3);
  const sec = padDigits(sequential, 9);
  const ambiente = sriAmbienteCode(settings.environment);
  const razonComercial = String(settings.tradeName || "").trim();
  const parts = [
    `    <ambiente>${ambiente}</ambiente>`,
    `    <tipoEmision>1</tipoEmision>`,
    `    <razonSocial>${esc(settings.legalName)}</razonSocial>`,
  ];
  if (razonComercial) {
    parts.push(`    <nombreComercial>${esc(razonComercial)}</nombreComercial>`);
  }
  parts.push(
    `    <ruc>${padDigits(settings.ruc, 13)}</ruc>`,
    `    <claveAcceso>${accessKey}</claveAcceso>`,
    `    <codDoc>${padDigits(codDoc, 2)}</codDoc>`,
    `    <estab>${est}</estab>`,
    `    <ptoEmi>${emi}</ptoEmi>`,
    `    <secuencial>${sec}</secuencial>`,
    `    <dirMatriz>${dirMatriz(settings)}</dirMatriz>`,
  );
  return parts.join("\n");
}

export function optionalEmailAdicional(email) {
  const e = String(email || "").trim();
  if (!e) return "";
  return `
  <infoAdicional>
    <campoAdicional nombre="Email">${esc(e)}</campoAdicional>
  </infoAdicional>`;
}

/** Normaliza número de documento sustentado: 001-001-000000001 */
export function normalizeDocNumber(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (digits.length === 15) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  const s = String(raw || "").trim();
  if (/^\d{3}-\d{3}-\d{9}$/.test(s)) return s;
  throw Object.assign(
    new Error("Número de documento modificado inválido (usa 001-001-000000001)"),
    { status: 400 },
  );
}
