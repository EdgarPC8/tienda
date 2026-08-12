import { ivaCodigo, computeInvoiceTotals } from "./sriInvoiceXml.js";
import { padDigits } from "./sriAccessKey.js";
import {
  esc,
  money,
  money4,
  formatIssueDate,
  formatPeriodoFiscal,
  dirEstablecimiento,
  obligadoContabilidad,
  buildInfoTributariaXml,
  optionalEmailAdicional,
  normalizeDocNumber,
} from "./sriXmlCommon.js";

export { computeInvoiceTotals };

function detalleFacturaStyle(totals) {
  return totals.lines
    .map(
      (line) => `    <detalle>
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
    </detalle>`,
    )
    .join("\n");
}

function totalImpuestosXml(totals) {
  return totals.taxBuckets
    .map(
      (b) => `      <totalImpuesto>
        <codigo>${b.codigo}</codigo>
        <codigoPorcentaje>${b.codigoPorcentaje}</codigoPorcentaje>
        <baseImponible>${money(b.baseImponible)}</baseImponible>
        <valor>${money(b.valor)}</valor>
      </totalImpuesto>`,
    )
    .join("\n");
}

/** Nota de crédito (04) */
export function buildNotaCreditoXml({
  settings,
  accessKey,
  sequential,
  issueDate,
  buyer,
  totals,
  modifiedDoc = {},
  motivo = "DEVOLUCION",
}) {
  const tipId = padDigits(buyer.identType, 2);
  const numMod = normalizeDocNumber(modifiedDoc.number);
  const codMod = padDigits(modifiedDoc.codDoc || "01", 2);
  const fechaMod = modifiedDoc.issueDate
    ? formatIssueDate(new Date(modifiedDoc.issueDate))
    : formatIssueDate(issueDate);
  const contrib = String(settings.specialTaxpayerResolution || "").trim();

  const infoParts = [
    `    <fechaEmision>${formatIssueDate(issueDate)}</fechaEmision>`,
    `    <dirEstablecimiento>${dirEstablecimiento(settings)}</dirEstablecimiento>`,
  ];
  if (contrib) infoParts.push(`    <contribuyenteEspecial>${esc(contrib)}</contribuyenteEspecial>`);
  infoParts.push(
    `    <tipoIdentificacionComprador>${tipId}</tipoIdentificacionComprador>`,
    `    <razonSocialComprador>${esc(buyer.name)}</razonSocialComprador>`,
    `    <identificacionComprador>${esc(buyer.ident)}</identificacionComprador>`,
    `    <obligadoContabilidad>${obligadoContabilidad(settings)}</obligadoContabilidad>`,
    `    <codDocModificado>${codMod}</codDocModificado>`,
    `    <numDocModificado>${numMod}</numDocModificado>`,
    `    <fechaEmisionDocSustento>${fechaMod}</fechaEmisionDocSustento>`,
    `    <totalSinImpuestos>${money(totals.subtotal)}</totalSinImpuestos>`,
    `    <valorModificacion>${money(totals.total)}</valorModificacion>`,
    `    <moneda>DOLAR</moneda>`,
    `    <totalConImpuestos>`,
    totalImpuestosXml(totals),
    `    </totalConImpuestos>`,
    `    <motivo>${esc(motivo || "DEVOLUCION")}</motivo>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<notaCredito id="comprobante" version="1.1.0">
  <infoTributaria>
${buildInfoTributariaXml(settings, { accessKey, sequential, codDoc: "04" })}
  </infoTributaria>
  <infoNotaCredito>
${infoParts.join("\n")}
  </infoNotaCredito>
  <detalles>
${detalleFacturaStyle(totals)}
  </detalles>${optionalEmailAdicional(buyer.email)}
</notaCredito>`;
}

/** Nota de débito (05) */
export function buildNotaDebitoXml({
  settings,
  accessKey,
  sequential,
  issueDate,
  buyer,
  totals,
  modifiedDoc = {},
  motivo = "INTERESES",
  paymentMethod = "01",
}) {
  const tipId = padDigits(buyer.identType, 2);
  const numMod = normalizeDocNumber(modifiedDoc.number);
  const codMod = padDigits(modifiedDoc.codDoc || "01", 2);
  const fechaMod = modifiedDoc.issueDate
    ? formatIssueDate(new Date(modifiedDoc.issueDate))
    : formatIssueDate(issueDate);
  const contrib = String(settings.specialTaxpayerResolution || "").trim();

  const impuestos = totals.taxBuckets
    .map(
      (b) => `      <impuesto>
        <codigo>${b.codigo}</codigo>
        <codigoPorcentaje>${b.codigoPorcentaje}</codigoPorcentaje>
        <tarifa>${b.tarifa}</tarifa>
        <baseImponible>${money(b.baseImponible)}</baseImponible>
        <valor>${money(b.valor)}</valor>
      </impuesto>`,
    )
    .join("\n");

  const infoParts = [
    `    <fechaEmision>${formatIssueDate(issueDate)}</fechaEmision>`,
    `    <dirEstablecimiento>${dirEstablecimiento(settings)}</dirEstablecimiento>`,
  ];
  if (contrib) infoParts.push(`    <contribuyenteEspecial>${esc(contrib)}</contribuyenteEspecial>`);
  infoParts.push(
    `    <tipoIdentificacionComprador>${tipId}</tipoIdentificacionComprador>`,
    `    <razonSocialComprador>${esc(buyer.name)}</razonSocialComprador>`,
    `    <identificacionComprador>${esc(buyer.ident)}</identificacionComprador>`,
    `    <obligadoContabilidad>${obligadoContabilidad(settings)}</obligadoContabilidad>`,
    `    <codDocModificado>${codMod}</codDocModificado>`,
    `    <numDocModificado>${numMod}</numDocModificado>`,
    `    <fechaEmisionDocSustento>${fechaMod}</fechaEmisionDocSustento>`,
    `    <totalSinImpuestos>${money(totals.subtotal)}</totalSinImpuestos>`,
    `    <impuestos>`,
    impuestos,
    `    </impuestos>`,
    `    <valorTotal>${money(totals.total)}</valorTotal>`,
    `    <pagos>`,
    `      <pago>`,
    `        <formaPago>${padDigits(paymentMethod, 2)}</formaPago>`,
    `        <total>${money(totals.total)}</total>`,
    `      </pago>`,
    `    </pagos>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<notaDebito id="comprobante" version="1.0.0">
  <infoTributaria>
${buildInfoTributariaXml(settings, { accessKey, sequential, codDoc: "05" })}
  </infoTributaria>
  <infoNotaDebito>
${infoParts.join("\n")}
  </infoNotaDebito>
  <motivos>
    <motivo>
      <razon>${esc(motivo || "AJUSTE")}</razon>
      <valor>${money(totals.subtotal)}</valor>
    </motivo>
  </motivos>${optionalEmailAdicional(buyer.email)}
</notaDebito>`;
}

/** Guía de remisión (06) */
export function buildGuiaRemisionXml({
  settings,
  accessKey,
  sequential,
  issueDate,
  transport = {},
  destinatario = {},
  items = [],
}) {
  const tipTrans = padDigits(transport.identType || "04", 2);
  const fechaIni = transport.startDate
    ? formatIssueDate(new Date(transport.startDate))
    : formatIssueDate(issueDate);
  const fechaFin = transport.endDate
    ? formatIssueDate(new Date(transport.endDate))
    : fechaIni;
  const contrib = String(settings.specialTaxpayerResolution || "").trim();

  if (!items.length) {
    throw Object.assign(new Error("La guía necesita al menos un ítem"), { status: 400 });
  }

  const detalles = items
    .map((it, idx) => {
      const qty = Number(it.qty);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw Object.assign(new Error(`Ítem ${idx + 1}: cantidad inválida`), { status: 400 });
      }
      const desc = String(it.description || "").trim();
      if (!desc) throw Object.assign(new Error(`Ítem ${idx + 1}: falta descripción`), { status: 400 });
      return `        <detalle>
          <codigoInterno>${esc(it.code || `ITEM${idx + 1}`)}</codigoInterno>
          <descripcion>${esc(desc)}</descripcion>
          <cantidad>${money4(qty)}</cantidad>
        </detalle>`;
    })
    .join("\n");

  const infoParts = [
    `    <dirEstablecimiento>${dirEstablecimiento(settings)}</dirEstablecimiento>`,
    `    <dirPartida>${esc(transport.dirPartida || settings.establishmentAddress || "S/N")}</dirPartida>`,
    `    <razonSocialTransportista>${esc(transport.name || settings.legalName)}</razonSocialTransportista>`,
    `    <tipoIdentificacionTransportista>${tipTrans}</tipoIdentificacionTransportista>`,
    `    <rucTransportista>${esc(String(transport.ident || settings.ruc).replace(/\s/g, ""))}</rucTransportista>`,
  ];
  if (contrib) infoParts.push(`    <contribuyenteEspecial>${esc(contrib)}</contribuyenteEspecial>`);
  infoParts.push(
    `    <obligadoContabilidad>${obligadoContabilidad(settings)}</obligadoContabilidad>`,
    `    <fechaIniTransporte>${fechaIni}</fechaIniTransporte>`,
    `    <fechaFinTransporte>${fechaFin}</fechaFinTransporte>`,
    `    <placa>${esc(transport.placa || "AAA0000")}</placa>`,
  );

  let docSustento = "";
  if (destinatario.docNumber) {
    const num = normalizeDocNumber(destinatario.docNumber);
    docSustento = `
          <codDocSustento>${padDigits(destinatario.codDoc || "01", 2)}</codDocSustento>
          <numDocSustento>${num.replace(/-/g, "")}</numDocSustento>
          <numAutDocSustento>${esc(destinatario.authNumber || "")}</numAutDocSustento>
          <fechaEmisionDocSustento>${
            destinatario.docDate
              ? formatIssueDate(new Date(destinatario.docDate))
              : formatIssueDate(issueDate)
          }</fechaEmisionDocSustento>`;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<guiaRemision id="comprobante" version="1.1.0">
  <infoTributaria>
${buildInfoTributariaXml(settings, { accessKey, sequential, codDoc: "06" })}
  </infoTributaria>
  <infoGuiaRemision>
${infoParts.join("\n")}
  </infoGuiaRemision>
  <destinatarios>
    <destinatario>
      <identificacionDestinatario>${esc(String(destinatario.ident || "").replace(/\s/g, ""))}</identificacionDestinatario>
      <razonSocialDestinatario>${esc(destinatario.name)}</razonSocialDestinatario>
      <dirDestinatario>${esc(destinatario.address || "S/N")}</dirDestinatario>
      <motivoTraslado>${esc(destinatario.motivo || "TRASLADO DE MERCADERIA")}</motivoTraslado>
      <ruta>${esc(destinatario.ruta || "LOCAL")}</ruta>${docSustento}
      <detalles>
${detalles}
      </detalles>
    </destinatario>
  </destinatarios>${optionalEmailAdicional(destinatario.email)}
</guiaRemision>`;
}

/** Comprobante de retención 2.0.0 (07) */
export function buildRetencionXml({
  settings,
  accessKey,
  sequential,
  issueDate,
  subject = {},
  sustento = {},
  retention = {},
}) {
  const tipId = padDigits(subject.identType || "04", 2);
  const numDoc = normalizeDocNumber(sustento.number).replace(/-/g, "");
  const base = Number(retention.baseImponible);
  const pct = Number(retention.porcentaje);
  if (!Number.isFinite(base) || base <= 0) {
    throw Object.assign(new Error("Base imponible de retención inválida"), { status: 400 });
  }
  if (!Number.isFinite(pct) || pct < 0) {
    throw Object.assign(new Error("Porcentaje de retención inválido"), { status: 400 });
  }
  const valorRet = (base * pct) / 100;
  const taxRate = Number(sustento.taxRate);
  const rate = Number.isFinite(taxRate) ? taxRate : 15;
  const iva = ivaCodigo(rate);
  const totalSin = Number(sustento.subtotal);
  const sub = Number.isFinite(totalSin) && totalSin > 0 ? totalSin : base;
  const ivaValor = (sub * rate) / 100;
  const importeTotal = sub + ivaValor;
  const contrib = String(settings.specialTaxpayerResolution || "").trim();
  const fechaDoc = sustento.issueDate
    ? formatIssueDate(new Date(sustento.issueDate))
    : formatIssueDate(issueDate);

  const infoParts = [
    `    <fechaEmision>${formatIssueDate(issueDate)}</fechaEmision>`,
    `    <dirEstablecimiento>${dirEstablecimiento(settings)}</dirEstablecimiento>`,
  ];
  if (contrib) infoParts.push(`    <contribuyenteEspecial>${esc(contrib)}</contribuyenteEspecial>`);
  infoParts.push(
    `    <obligadoContabilidad>${obligadoContabilidad(settings)}</obligadoContabilidad>`,
    `    <tipoIdentificacionSujetoRetenido>${tipId}</tipoIdentificacionSujetoRetenido>`,
    `    <parteRel>NO</parteRel>`,
    `    <razonSocialSujetoRetenido>${esc(subject.name)}</razonSocialSujetoRetenido>`,
    `    <identificacionSujetoRetenido>${esc(String(subject.ident || "").replace(/\s/g, ""))}</identificacionSujetoRetenido>`,
    `    <periodoFiscal>${esc(retention.periodoFiscal || formatPeriodoFiscal(issueDate))}</periodoFiscal>`,
  );

  return `<?xml version="1.0" encoding="UTF-8"?>
<comprobanteRetencion id="comprobante" version="2.0.0">
  <infoTributaria>
${buildInfoTributariaXml(settings, { accessKey, sequential, codDoc: "07" })}
  </infoTributaria>
  <infoCompRetencion>
${infoParts.join("\n")}
  </infoCompRetencion>
  <docsSustento>
    <docSustento>
      <codSustento>${padDigits(sustento.codSustento || "01", 2)}</codSustento>
      <codDocSustento>${padDigits(sustento.codDoc || "01", 2)}</codDocSustento>
      <numDocSustento>${numDoc}</numDocSustento>
      <fechaEmisionDocSustento>${fechaDoc}</fechaEmisionDocSustento>
      <pagoLocExt>01</pagoLocExt>
      <totalSinImpuestos>${money(sub)}</totalSinImpuestos>
      <importeTotal>${money(importeTotal)}</importeTotal>
      <impuestos>
        <impuesto>
          <codImpuesto>2</codImpuesto>
          <codigoPorcentaje>${iva.codigoPorcentaje}</codigoPorcentaje>
          <baseImponible>${money(sub)}</baseImponible>
          <tarifa>${money(rate)}</tarifa>
          <valorImpuesto>${money(ivaValor)}</valorImpuesto>
        </impuesto>
      </impuestos>
      <retenciones>
        <retencion>
          <codigo>${padDigits(retention.codigo || "2", 1)}</codigo>
          <codigoRetencion>${esc(retention.codigoRetencion || "9")}</codigoRetencion>
          <baseImponible>${money(base)}</baseImponible>
          <porcentajeRetener>${money(pct)}</porcentajeRetener>
          <valorRetenido>${money(valorRet)}</valorRetenido>
        </retencion>
      </retenciones>
      <pagos>
        <pago>
          <formaPago>${padDigits(sustento.paymentMethod || "01", 2)}</formaPago>
          <total>${money(importeTotal)}</total>
        </pago>
      </pagos>
    </docSustento>
  </docsSustento>${optionalEmailAdicional(subject.email)}
</comprobanteRetencion>`;
}

/** Liquidación de compra (03) */
export function buildLiquidacionCompraXml({
  settings,
  accessKey,
  sequential,
  issueDate,
  supplier,
  totals,
  paymentMethod = "01",
}) {
  const tipId = padDigits(supplier.identType, 2);
  const contrib = String(settings.specialTaxpayerResolution || "").trim();

  const infoParts = [
    `    <fechaEmision>${formatIssueDate(issueDate)}</fechaEmision>`,
    `    <dirEstablecimiento>${dirEstablecimiento(settings)}</dirEstablecimiento>`,
  ];
  if (contrib) infoParts.push(`    <contribuyenteEspecial>${esc(contrib)}</contribuyenteEspecial>`);
  infoParts.push(
    `    <obligadoContabilidad>${obligadoContabilidad(settings)}</obligadoContabilidad>`,
    `    <tipoIdentificacionProveedor>${tipId}</tipoIdentificacionProveedor>`,
    `    <razonSocialProveedor>${esc(supplier.name)}</razonSocialProveedor>`,
    `    <identificacionProveedor>${esc(supplier.ident)}</identificacionProveedor>`,
    `    <direccionProveedor>${esc(supplier.address || "S/N")}</direccionProveedor>`,
    `    <totalSinImpuestos>${money(totals.subtotal)}</totalSinImpuestos>`,
    `    <totalDescuento>0.00</totalDescuento>`,
    `    <totalConImpuestos>`,
    totalImpuestosXml(totals),
    `    </totalConImpuestos>`,
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
<liquidacionCompra id="comprobante" version="1.1.0">
  <infoTributaria>
${buildInfoTributariaXml(settings, { accessKey, sequential, codDoc: "03" })}
  </infoTributaria>
  <infoLiquidacionCompra>
${infoParts.join("\n")}
  </infoLiquidacionCompra>
  <detalles>
${detalleFacturaStyle(totals)}
  </detalles>${optionalEmailAdicional(supplier.email)}
</liquidacionCompra>`;
}
