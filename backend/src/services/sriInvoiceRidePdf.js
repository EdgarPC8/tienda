/**
 * Genera PDF RIDE simplificado (A4) para adjuntar al correo de factura.
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import { SRI_PRIVATE_DIR, ensureSriPrivateDir } from "./sriBillingService.js";

function money(n) {
  return `$${Number(Number(n || 0).toFixed(2)).toFixed(2)}`;
}

function invoiceNumberLabel(inv) {
  const a = String(inv.establishmentCode || "001").padStart(3, "0");
  const b = String(inv.emissionPointCode || "001").padStart(3, "0");
  const c = String(Number(inv.sequential) || 0).padStart(9, "0");
  return `${a}-${b}-${c}`;
}

function formatDateEc(d) {
  const dt = d ? new Date(d) : new Date();
  if (Number.isNaN(dt.getTime())) return "—";
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function tagText(xml, tag) {
  const m = String(xml || "").match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? String(m[1]).replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function parseItemsFromXml(xml) {
  const block = String(xml || "").match(/<detalles>([\s\S]*?)<\/detalles>/i);
  if (!block) return [];
  const chunks = block[1].match(/<detalle>[\s\S]*?<\/detalle>/gi) || [];
  return chunks.map((chunk, idx) => {
    const qty = Number(tagText(chunk, "cantidad")) || 0;
    const unit = Number(tagText(chunk, "precioUnitario")) || 0;
    const lineBase = Number(tagText(chunk, "precioTotalSinImpuesto")) || Number((qty * unit).toFixed(2));
    const taxRate = Number(tagText(chunk, "tarifa")) || 0;
    return {
      code: String(tagText(chunk, "codigoPrincipal") || `ITEM${idx + 1}`).slice(0, 20),
      description: String(tagText(chunk, "descripcion") || "Ítem").slice(0, 80),
      qty,
      unit,
      lineBase,
      taxRate,
    };
  });
}

async function readInvoiceXmlText(invoice) {
  const rel = invoice?.xmlRelativePath;
  if (!rel) return "";
  const base = path.basename(String(rel));
  const candidates = [
    path.resolve(SRI_PRIVATE_DIR, "invoices", base),
    path.resolve(SRI_PRIVATE_DIR, base),
  ];
  for (const full of candidates) {
    try {
      return await fsp.readFile(full, "utf8");
    } catch {
      /* next */
    }
  }
  return "";
}

function normalizePayload(invoice) {
  const j =
    invoice && typeof invoice.toJSON === "function" ? invoice.toJSON() : { ...(invoice || {}) };
  let payload = j.payloadJson ?? j.payload ?? null;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = {};
    }
  }
  if (!payload || typeof payload !== "object") payload = {};
  return { plain: j, payload };
}

function mapRawItems(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((it, idx) => {
      if (!it || typeof it !== "object") return null;
      const qty = Number(it.qty ?? it.quantity ?? it.cantidad) || 0;
      if (!(qty > 0) && !it.description && !it.descripcion && !it.name) return null;
      const unit = Number(it.unitPriceXml ?? it.unitPrice ?? it.precioUnitario ?? it.price) || 0;
      const lineBase =
        it.lineBase != null
          ? Number(it.lineBase)
          : it.precioTotalSinImpuesto != null
            ? Number(it.precioTotalSinImpuesto)
            : Number((qty * unit).toFixed(2));
      return {
        code: String(it.code || it.codigoPrincipal || it.productId || `ITEM${idx + 1}`).slice(
          0,
          20,
        ),
        description: String(
          it.description || it.descripcion || it.name || it.productName || "Ítem",
        ).slice(0, 80),
        qty: qty || 1,
        unit,
        lineBase,
        taxRate: Number(it.taxRate ?? it.tarifa ?? it.ivaRate) || 0,
      };
    })
    .filter(Boolean);
}

async function extractItems(invoice) {
  const { payload } = normalizePayload(invoice);
  const fromPayload = mapRawItems(
    payload.items || payload.lines || payload.detalles || payload.products,
  );
  if (fromPayload.length) return fromPayload;

  const xml = await readInvoiceXmlText(invoice);
  const fromXml = parseItemsFromXml(xml);
  if (fromXml.length) return fromXml;

  return [];
}

/**
 * @returns {Promise<{ absolutePath: string, relativePath: string, filename: string }|null>}
 */
export async function generateAndStoreInvoicePdf(invoice, settings, logoAbsolutePath) {
  ensureSriPrivateDir();
  const invoicesDir = path.join(SRI_PRIVATE_DIR, "invoices");
  fs.mkdirSync(invoicesDir, { recursive: true });

  const num = invoiceNumberLabel(invoice);
  const key = String(invoice.accessKey || invoice.id || Date.now()).replace(/\W/g, "");
  const filename = `${key || `factura-${num}`}.pdf`;
  const absolutePath = path.join(invoicesDir, filename);
  const relativePath = `invoices/${filename}`;

  const legal = settings.legalName || settings.tradeName || "Emisor";
  const trade = settings.tradeName || legal;
  const items = await extractItems(invoice);
  const issueDate = formatDateEc(invoice.authorizedAt || invoice.createdAt);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 40 });
    const stream = fs.createWriteStream(absolutePath);
    doc.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
    doc.on("error", reject);

    let y = 40;
    const left = 40;
    const right = 555;

    // Logo
    if (logoAbsolutePath && fs.existsSync(logoAbsolutePath)) {
      try {
        doc.image(logoAbsolutePath, left, y, { fit: [110, 55] });
      } catch {
        /* logo inválido */
      }
    }

    doc
      .fontSize(11)
      .font("Helvetica-Bold")
      .fillColor("#111")
      .text(String(legal).toUpperCase(), left + 120, y, { width: 250 });
    doc
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#333")
      .text(trade, left + 120, y + 16, { width: 250 });
    doc.text(`RUC: ${settings.ruc || "—"}`, left + 120, y + 30);
    if (settings.matrixAddress) {
      doc.text(String(settings.matrixAddress).slice(0, 90), left + 120, y + 42, {
        width: 250,
      });
    }

    // Caja RIDE derecha
    doc.rect(380, y, 175, 72).stroke("#111");
    doc
      .fontSize(10)
      .font("Helvetica-Bold")
      .fillColor("#111")
      .text("FACTURA", 388, y + 8, { width: 160, align: "center" });
    doc
      .fontSize(8)
      .font("Helvetica")
      .text(`Nº ${num}`, 388, y + 24, { width: 160, align: "center" });
    doc.text(
      `Ambiente: ${String(invoice.environment || "").toLowerCase() === "produccion" ? "PRODUCCIÓN" : "PRUEBAS"}`,
      388,
      y + 38,
      { width: 160, align: "center" },
    );
    doc.text(`Emisión: ${issueDate}`, 388, y + 52, { width: 160, align: "center" });

    y = 130;
    doc
      .fontSize(8)
      .font("Helvetica-Bold")
      .text("CLAVE DE ACCESO", left, y);
    doc
      .font("Helvetica")
      .fontSize(8)
      .text(String(invoice.accessKey || "—"), left, y + 12, { width: right - left });
    y += 32;
    doc.font("Helvetica-Bold").text("Nº AUTORIZACIÓN", left, y);
    doc
      .font("Helvetica")
      .text(String(invoice.authorizationNumber || invoice.accessKey || "—"), left, y + 12, {
        width: right - left,
      });

    y += 40;
    doc.rect(left, y, right - left, 54).stroke("#111");
    doc.font("Helvetica-Bold").fontSize(8).text("CLIENTE", left + 6, y + 6);
    doc
      .font("Helvetica")
      .text(`Razón social: ${invoice.customerName || "—"}`, left + 6, y + 18, {
        width: right - left - 12,
      });
    doc.text(
      `Identificación: ${invoice.customerIdent || "—"}  ·  Email: ${invoice.customerEmail || "—"}`,
      left + 6,
      y + 32,
      { width: right - left - 12 },
    );

    y += 70;
    // Tabla encabezado
    const cols = [
      { x: left, w: 50, label: "Código" },
      { x: left + 50, w: 220, label: "Descripción" },
      { x: left + 270, w: 40, label: "Cant." },
      { x: left + 310, w: 70, label: "P. Unit." },
      { x: left + 380, w: 50, label: "IVA %" },
      { x: left + 430, w: 85, label: "Total" },
    ];
    doc.rect(left, y, right - left, 18).fillAndStroke("#F5F5F5", "#111");
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(8);
    cols.forEach((c) => doc.text(c.label, c.x + 2, y + 5, { width: c.w - 4 }));
    y += 18;

    doc.font("Helvetica").fontSize(8);
    if (!items.length) {
      doc.text("Sin detalle de ítems en el comprobante.", left + 4, y + 6);
      y += 22;
    } else {
      for (const it of items) {
        if (y > 720) {
          doc.addPage();
          y = 40;
        }
        const rowH = 16;
        doc.rect(left, y, right - left, rowH).stroke("#ccc");
        doc.text(it.code, cols[0].x + 2, y + 4, { width: cols[0].w - 4 });
        doc.text(it.description, cols[1].x + 2, y + 4, { width: cols[1].w - 4 });
        doc.text(String(it.qty), cols[2].x + 2, y + 4, {
          width: cols[2].w - 4,
          align: "right",
        });
        doc.text(money(it.unit), cols[3].x + 2, y + 4, {
          width: cols[3].w - 4,
          align: "right",
        });
        doc.text(String(it.taxRate), cols[4].x + 2, y + 4, {
          width: cols[4].w - 4,
          align: "right",
        });
        doc.text(money(it.lineBase), cols[5].x + 2, y + 4, {
          width: cols[5].w - 4,
          align: "right",
        });
        y += rowH;
      }
    }

    y += 12;
    const totalsX = 380;
    const lines = [
      ["Subtotal", money(invoice.subtotal)],
      ["IVA", money(invoice.taxTotal)],
      ["TOTAL", money(invoice.total)],
    ];
    lines.forEach(([label, val], i) => {
      const bold = i === lines.length - 1;
      doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9);
      doc.text(label, totalsX, y, { width: 70 });
      doc.text(val, totalsX + 70, y, { width: 65, align: "right" });
      y += 14;
    });

    y += 16;
    doc
      .fontSize(7)
      .font("Helvetica")
      .fillColor("#555")
      .text(
        "Documento generado electrónicamente. Conserve el XML autorizado y este PDF como respaldo.",
        left,
        y,
        { width: right - left },
      );

    doc.end();
  });

  return { absolutePath, relativePath, filename };
}

/** PDF de muestra para correo de prueba. */
export async function generateSampleInvoicePdf(settings, logoAbsolutePath) {
  const sample = {
    establishmentCode: settings.establishmentCode || "001",
    emissionPointCode: settings.emissionPointCode || "001",
    sequential: 1,
    accessKey: "0".repeat(49),
    authorizationNumber: "0".repeat(49),
    environment: settings.environment || "pruebas",
    customerName: "CLIENTE DE PRUEBA",
    customerIdent: "9999999999999",
    customerEmail: settings.smtpFrom || settings.email || "prueba@example.com",
    subtotal: 100,
    taxTotal: 15,
    total: 115,
    authorizedAt: new Date(),
    payloadJson: {
      items: [
        {
          code: "P001",
          description: "Pan de sal (demo)",
          qty: 10,
          unitPrice: 0.5,
          taxRate: 0,
          lineBase: 5,
          lineTax: 0,
        },
        {
          code: "P002",
          description: "Café americano (demo)",
          qty: 2,
          unitPrice: 1.5,
          taxRate: 15,
          lineBase: 2.61,
          lineTax: 0.39,
        },
        {
          code: "P003",
          description: "Torta porción (demo)",
          qty: 1,
          unitPrice: 100,
          taxRate: 15,
          lineBase: 91.39,
          lineTax: 13.71,
        },
      ],
    },
  };
  // Ajustar totales a la suma demo clara
  sample.subtotal = 100;
  sample.taxTotal = 15;
  sample.total = 115;
  const out = await generateAndStoreInvoicePdf(sample, settings, logoAbsolutePath);
  return out;
}

export async function unlinkQuiet(filePath) {
  try {
    await fsp.unlink(filePath);
  } catch {
    /* ok */
  }
}
