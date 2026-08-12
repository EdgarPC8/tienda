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

/** Mapea tasa IVA → código porcentaje SRI. */
export function ivaCodigo(rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return { codigo: "2", codigoPorcentaje: "0", tarifa: "0" };
  if (Math.abs(r - 12) < 0.01) return { codigo: "2", codigoPorcentaje: "2", tarifa: "12.00" };
  if (Math.abs(r - 15) < 0.01) return { codigo: "2", codigoPorcentaje: "4", tarifa: "15.00" };
  if (Math.abs(r - 5) < 0.01) return { codigo: "2", codigoPorcentaje: "5", tarifa: "5.00" };
  if (Math.abs(r - 8) < 0.01) return { codigo: "2", codigoPorcentaje: "8", tarifa: "8.00" };
  // Fallback: tratar como 15% (tarifa actual)
  return { codigo: "2", codigoPorcentaje: "4", tarifa: money(r) };
}

/**
 * unitPrice se interpreta SIN IVA (base imponible unitaria),
 * salvo que el ítem traiga lineBase/lineTax ya calculados (p. ej. precios con IVA).
 * Cada línea se redondea a 2 decimales; base + IVA = total de línea.
 */
export function computeInvoiceTotals(items) {
  const lines = [];
  const taxBuckets = new Map();
  let subtotal = 0;
  let taxTotal = 0;

  items.forEach((raw, idx) => {
    const qty = Number(raw.qty);
    const unitPrice = Number(raw.unitPrice);
    const taxRate = Number(raw.taxRate);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw Object.assign(new Error(`Ítem ${idx + 1}: cantidad inválida`), { status: 400 });
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw Object.assign(new Error(`Ítem ${idx + 1}: precio inválido`), { status: 400 });
    }
    const rate = Number.isFinite(taxRate) ? taxRate : 15;
    const desc = String(raw.description || "").trim();
    if (!desc) {
      throw Object.assign(new Error(`Ítem ${idx + 1}: falta descripción`), { status: 400 });
    }

    let lineBase;
    let lineTax;
    if (raw.lineBase != null && raw.lineTax != null) {
      lineBase = round2(raw.lineBase);
      lineTax = round2(raw.lineTax);
    } else if (rate > 0) {
      lineBase = round2(qty * unitPrice);
      const lineTotal = round2(lineBase * (1 + rate / 100));
      lineTax = round2(lineTotal - lineBase);
    } else {
      lineBase = round2(qty * unitPrice);
      lineTax = 0;
    }

    const iva = ivaCodigo(rate);
    subtotal = round2(subtotal + lineBase);
    taxTotal = round2(taxTotal + lineTax);

    const bucketKey = `${iva.codigoPorcentaje}`;
    const prev = taxBuckets.get(bucketKey) || {
      codigo: iva.codigo,
      codigoPorcentaje: iva.codigoPorcentaje,
      baseImponible: 0,
      valor: 0,
      tarifa: iva.tarifa,
    };
    prev.baseImponible = round2(prev.baseImponible + lineBase);
    prev.valor = round2(prev.valor + lineTax);
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
      taxRate: rate,
      lineBase,
      lineTax,
      iva,
      codigoPrincipal: String(raw.code || `ITEM${idx + 1}`).slice(0, 25),
    });
  });

  return {
    lines,
    taxBuckets: [...taxBuckets.values()],
    subtotal,
    taxTotal,
    total: round2(subtotal + taxTotal),
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
      <descuento>0.00</descuento>
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
    `    <totalDescuento>0.00</totalDescuento>`,
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
