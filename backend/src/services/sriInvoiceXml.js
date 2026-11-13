import { padDigits, sriAmbienteCode } from "./sriAccessKey.js";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function money(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.00";
  return x.toFixed(2);
}

function money4(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0.0000";
  return x.toFixed(4);
}

/** Redondeo a 2 decimales (nearest), igual que Number(n.toFixed(2)). */
export function round2(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Number(x.toFixed(2));
}

/**
 * Tarifas IVA parametrizadas SRI (codigoPorcentaje → %).
 * La <tarifa> del XML debe salir SIEMPRE de aquí, nunca de un cálculo libre.
 */
export const SRI_IVA_TARIFA_BY_CODIGO = Object.freeze({
  0: 0,
  2: 12,
  3: 14,
  4: 15,
  5: 5,
  6: 0,
  7: 0,
  8: 8,
  10: 13,
});

export const SRI_IVA_VALID_RATES = Object.freeze([0, 5, 8, 12, 13, 14, 15]);

/** Si guardaron 0.15 en vez de 15, normaliza a porcentaje. */
export function normalizeTaxRatePercent(raw) {
  let r = Number(raw);
  if (!Number.isFinite(r) || r < 0) return 0;
  if (r > 0 && r < 1) r = round2(r * 100);
  return r;
}

export function isValidSriIvaRate(raw) {
  const r = normalizeTaxRatePercent(raw);
  return SRI_IVA_VALID_RATES.some((v) => Math.abs(r - v) < 0.001);
}

export function tarifaFromCodigoPorcentaje(codigoPorcentaje) {
  const key = String(Number(codigoPorcentaje));
  if (Object.prototype.hasOwnProperty.call(SRI_IVA_TARIFA_BY_CODIGO, key)) {
    return SRI_IVA_TARIFA_BY_CODIGO[key];
  }
  return SRI_IVA_TARIFA_BY_CODIGO[4];
}

/**
 * Mapea tasa IVA (%) → códigos SRI.
 * <tarifa> siempre desde el mapa fijo por codigoPorcentaje.
 */
export function ivaCodigo(rate) {
  const r = normalizeTaxRatePercent(rate);
  let codigoPorcentaje = "4";
  if (!Number.isFinite(r) || r <= 0) codigoPorcentaje = "0";
  else if (Math.abs(r - 12) < 0.01) codigoPorcentaje = "2";
  else if (Math.abs(r - 14) < 0.01) codigoPorcentaje = "3";
  else if (Math.abs(r - 15) < 0.01) codigoPorcentaje = "4";
  else if (Math.abs(r - 5) < 0.01) codigoPorcentaje = "5";
  else if (Math.abs(r - 8) < 0.01) codigoPorcentaje = "8";
  else if (Math.abs(r - 13) < 0.01) codigoPorcentaje = "10";
  else codigoPorcentaje = "4"; // tasa desconocida → 15% parametrizada

  const tarifaNum = tarifaFromCodigoPorcentaje(codigoPorcentaje);
  return {
    codigo: "2",
    codigoPorcentaje,
    tarifa: money(tarifaNum),
    tarifaNum,
  };
}

/**
 * unitPrice se interpreta SIN IVA (base imponible unitaria),
 * salvo que el ítem traiga lineBase ya calculado (p. ej. precios con IVA).
 * <valor> IVA = round(baseImponible * tarifaMapa / 100, 2).
 */
export function computeInvoiceTotals(items) {
  const lines = [];
  const taxBuckets = new Map();
  let subtotal = 0;
  let taxTotal = 0;
  let discountTotal = 0;

  items.forEach((raw, idx) => {
    const qty = Number(raw.qty);
    const unitPrice = Number(raw.unitPrice);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw Object.assign(new Error(`Ítem ${idx + 1}: cantidad inválida`), { status: 400 });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw Object.assign(new Error(`Ítem ${idx + 1}: precio inválido`), { status: 400 });
    }
    const rate = normalizeTaxRatePercent(
      Number.isFinite(Number(raw.taxRate)) ? Number(raw.taxRate) : 15,
    );
    const desc = String(raw.description || "").trim();
    if (!desc) {
      throw Object.assign(new Error(`Ítem ${idx + 1}: falta descripción`), { status: 400 });
    }

    const discount = round2(Math.max(0, Number(raw.discount) || 0));
    discountTotal = round2(discountTotal + discount);

    let lineBase;
    if (raw.lineBase != null) {
      lineBase = round2(raw.lineBase);
    } else {
      lineBase = round2(Math.max(0, qty * unitPrice - discount));
    }

    const iva = ivaCodigo(rate);
    // Valor SIEMPRE desde tarifa parametrizada (evita 0.75 con codigo 4).
    const lineTax =
      iva.tarifaNum > 0 ? round2((lineBase * iva.tarifaNum) / 100) : 0;

    subtotal = round2(subtotal + lineBase);
    taxTotal = round2(taxTotal + lineTax);

    const bucketKey = `${iva.codigoPorcentaje}`;
    const prev = taxBuckets.get(bucketKey) || {
      codigo: iva.codigo,
      codigoPorcentaje: iva.codigoPorcentaje,
      baseImponible: 0,
      valor: 0,
      tarifa: iva.tarifa,
      tarifaNum: iva.tarifaNum,
    };
    prev.baseImponible = round2(prev.baseImponible + lineBase);
    prev.valor = round2(prev.valor + lineTax);
    prev.tarifa = iva.tarifa;
    prev.tarifaNum = iva.tarifaNum;
    taxBuckets.set(bucketKey, prev);

    const unitForXml =
      Number.isFinite(Number(raw.unitPriceXml)) && Number(raw.unitPriceXml) >= 0
        ? Number(raw.unitPriceXml)
        : qty > 0
          ? lineBase / qty
          : unitPrice;

    lines.push({
      description: desc,
      qty,
      unitPrice: unitForXml,
      taxRate: iva.tarifaNum,
      lineBase,
      lineTax,
      discount,
      iva,
      codigoPrincipal: String(raw.code || `ITEM${idx + 1}`).slice(0, 25),
    });
  });

  // Recalcular valor de bucket desde tarifa del mapa (coherencia totalConImpuestos).
  for (const b of taxBuckets.values()) {
    const tarifaNum = tarifaFromCodigoPorcentaje(b.codigoPorcentaje);
    b.tarifaNum = tarifaNum;
    b.tarifa = money(tarifaNum);
    b.valor = tarifaNum > 0 ? round2((b.baseImponible * tarifaNum) / 100) : 0;
  }

  const buckets = [...taxBuckets.values()];
  const taxFromBuckets = round2(buckets.reduce((acc, b) => acc + Number(b.valor || 0), 0));
  taxTotal = taxFromBuckets;
  const total = round2(subtotal + taxTotal - discountTotal);

  return {
    lines,
    taxBuckets: buckets,
    subtotal,
    taxTotal,
    discountTotal,
    total,
  };
}

function formatIssueDate(d) {
  const dd = padDigits(d.getDate(), 2);
  const mm = padDigits(d.getMonth() + 1, 2);
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Genera XML factura 1.1.0 (sin firma).
 * El XSD del SRI exige el atributo `id` en minúsculas (no `Id`).
 */
export function buildFacturaXml({
  settings,
  accessKey,
  sequential,
  issueDate,
  buyer,
  totals,
  paymentMethod = "01",
}) {
  const est = padDigits(settings.establishmentCode, 3);
  const emi = padDigits(settings.emissionPointCode, 3);
  const sec = padDigits(sequential, 9);
  const ambiente = sriAmbienteCode(settings.environment);
  const dirEstablecimiento = esc(
    settings.establishmentAddress || settings.matrixAddress || "S/N",
  );
  const dirMatriz = esc(settings.matrixAddress || settings.establishmentAddress || "S/N");
  const contribuyenteEspecial = String(settings.specialTaxpayerResolution || "").trim();
  const obligado = settings.accountingRequired ? "SI" : "NO";
  const discountTotal = round2(totals.discountTotal || 0);

  const totalConImpuestos = totals.taxBuckets
    .map(
      (b) => `      <totalImpuesto>
        <codigo>${b.codigo}</codigo>
        <codigoPorcentaje>${b.codigoPorcentaje}</codigoPorcentaje>
        <baseImponible>${money(b.baseImponible)}</baseImponible>
        <valor>${money(b.valor)}</valor>
      </totalImpuesto>`,
    )
    .join("\n");

  const detalles = totals.lines
    .map((line) => {
      return `    <detalle>
      <codigoPrincipal>${esc(line.codigoPrincipal)}</codigoPrincipal>
      <descripcion>${esc(line.description)}</descripcion>
      <cantidad>${money4(line.qty)}</cantidad>
      <precioUnitario>${money4(line.unitPrice)}</precioUnitario>
      <descuento>${money(line.discount || 0)}</descuento>
      <precioTotalSinImpuesto>${money(line.lineBase)}</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>${line.iva.codigo}</codigo>
          <codigoPorcentaje>${line.iva.codigoPorcentaje}</codigoPorcentaje>
          <tarifa>${line.iva.tarifa}</tarifa>
          <baseImponible>${money(line.lineBase)}</baseImponible>
          <valor>${money(line.lineTax)}</valor>
        </impuesto>
      </impuestos>
    </detalle>`;
    })
    .join("\n");

  const tipId = padDigits(buyer.identType, 2);
  const ident = esc(String(buyer.ident || "").trim());
  const nombre = esc(String(buyer.name || "").trim());
  const direccion = esc(String(buyer.address || "S/N").trim() || "S/N");
  const email = String(buyer.email || "").trim();

  let infoAdicional = "";
  if (email) {
    infoAdicional = `
  <infoAdicional>
    <campoAdicional nombre="Email">${esc(email)}</campoAdicional>
  </infoAdicional>`;
  }

  const razonComercial = String(settings.tradeName || "").trim();

  const infoTributariaParts = [
    `    <ambiente>${ambiente}</ambiente>`,
    `    <tipoEmision>1</tipoEmision>`,
    `    <razonSocial>${esc(settings.legalName)}</razonSocial>`,
  ];
  if (razonComercial) {
    infoTributariaParts.push(`    <nombreComercial>${esc(razonComercial)}</nombreComercial>`);
  }
  infoTributariaParts.push(
    `    <ruc>${padDigits(settings.ruc, 13)}</ruc>`,
    `    <claveAcceso>${accessKey}</claveAcceso>`,
    `    <codDoc>01</codDoc>`,
    `    <estab>${est}</estab>`,
    `    <ptoEmi>${emi}</ptoEmi>`,
    `    <secuencial>${sec}</secuencial>`,
    `    <dirMatriz>${dirMatriz}</dirMatriz>`,
  );

  const infoFacturaParts = [
    `    <fechaEmision>${formatIssueDate(issueDate)}</fechaEmision>`,
    `    <dirEstablecimiento>${dirEstablecimiento}</dirEstablecimiento>`,
  ];
  if (contribuyenteEspecial) {
    infoFacturaParts.push(
      `    <contribuyenteEspecial>${esc(contribuyenteEspecial)}</contribuyenteEspecial>`,
    );
  }
  infoFacturaParts.push(
    `    <obligadoContabilidad>${obligado}</obligadoContabilidad>`,
    `    <tipoIdentificacionComprador>${tipId}</tipoIdentificacionComprador>`,
    `    <razonSocialComprador>${nombre}</razonSocialComprador>`,
    `    <identificacionComprador>${ident}</identificacionComprador>`,
    `    <direccionComprador>${direccion}</direccionComprador>`,
    `    <totalSinImpuestos>${money(totals.subtotal)}</totalSinImpuestos>`,
    `    <totalDescuento>${money(discountTotal)}</totalDescuento>`,
    `    <totalConImpuestos>`,
    totalConImpuestos,
    `    </totalConImpuestos>`,
    `    <propina>0.00</propina>`,
    `    <importeTotal>${money(totals.total)}</importeTotal>`,
    `    <moneda>DOLAR</moneda>`,
    `    <pagos>`,
    `      <pago>`,
    `        <formaPago>${padDigits(paymentMethod, 2)}</formaPago>`,
    `        <total>${money(totals.total)}</total>`,
    `      </pago>`,
    `    </pagos>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
${infoTributariaParts.join("\n")}
  </infoTributaria>
  <infoFactura>
${infoFacturaParts.join("\n")}
  </infoFactura>
  <detalles>
${detalles}
  </detalles>${infoAdicional}
</factura>`;
}
