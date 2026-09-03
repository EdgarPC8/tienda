/**
 * Reporte: productos con/sin barcode e imagen (archivo real en src/img).
 *
 * Uso (desde AppsWeb/eddeli/backend):
 *   node scripts/report-product-barcodes-images.js
 *   node scripts/report-product-barcodes-images.js --list
 *   node scripts/report-product-barcodes-images.js --list=barcode-no-img
 *   node scripts/report-product-barcodes-images.js --list=with-barcode
 *   node scripts/report-product-barcodes-images.js --list=sold-barcode-no-img
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { sequelize } from "../src/database/connection.js";
import { InventoryProduct } from "../src/models/Inventory.js";
import { OrderItem } from "../src/models/Orders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IMG_BASE = path.resolve(__dirname, "../src/img");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
};

const listArg = process.argv.find((a) => a === "--list" || a.startsWith("--list="));
const LIST_MODE = !listArg
  ? null
  : listArg === "--list"
    ? "barcode-no-img"
    : listArg.split("=")[1] || "barcode-no-img";

function normalizeRel(p = "") {
  return String(p || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

function normalizeBarcode(raw) {
  return String(raw ?? "").replace(/\D/g, "").trim() || null;
}

function hasUsableImage(rel) {
  const n = normalizeRel(rel);
  if (!n) return false;
  return fs.existsSync(path.join(IMG_BASE, n));
}

function pct(n, total) {
  if (!total) return "0%";
  return `${((n / total) * 100).toFixed(1)}%`;
}

function line(label, value, color = c.white) {
  console.log(`  ${c.dim}${label.padEnd(36)}${c.reset}${color}${c.bold}${value}${c.reset}`);
}

function printList(title, rows, color = c.cyan) {
  console.log(`\n${color}${c.bold}${title}${c.reset} ${c.dim}(${rows.length})${c.reset}`);
  if (!rows.length) {
    console.log(`  ${c.dim}(vacío)${c.reset}`);
    return;
  }
  for (const r of rows) {
    const img = r.hasImg ? `${c.green}img✓${c.reset}` : `${c.red}img✗${c.reset}`;
    const sold = r.soldTimes != null ? `  ${c.magenta}×${r.soldTimes}${c.reset}` : "";
    const code = r.barcode ? `${c.yellow}${r.barcode}${c.reset}` : `${c.dim}sin barcode${c.reset}`;
    console.log(
      `  ${c.dim}#${String(r.id).padStart(4)}${c.reset}  ${img}  ${code}  ${r.name}${sold}`,
    );
  }
}

async function main() {
  await sequelize.authenticate();

  const products = await InventoryProduct.findAll({
    attributes: ["id", "name", "barcode", "primaryImageUrl", "isActive"],
    order: [["id", "ASC"]],
    raw: true,
  });

  const soldRows = await OrderItem.findAll({
    attributes: ["productId"],
    raw: true,
  });
  const soldCount = new Map();
  for (const s of soldRows) {
    if (s.productId == null) continue;
    soldCount.set(s.productId, (soldCount.get(s.productId) || 0) + 1);
  }

  const enriched = products.map((p) => {
    const barcode = normalizeBarcode(p.barcode);
    const hasImg = hasUsableImage(p.primaryImageUrl);
    const hasUrl = Boolean(normalizeRel(p.primaryImageUrl));
    const soldTimes = soldCount.get(p.id) || 0;
    return {
      id: p.id,
      name: p.name,
      barcode,
      hasBarcode: Boolean(barcode),
      hasImg,
      hasUrl,
      brokenUrl: hasUrl && !hasImg,
      soldTimes,
      isActive: p.isActive !== false,
    };
  });

  const total = enriched.length;
  const withBarcode = enriched.filter((p) => p.hasBarcode);
  const withoutBarcode = enriched.filter((p) => !p.hasBarcode);
  const withImg = enriched.filter((p) => p.hasImg);
  const withoutImg = enriched.filter((p) => !p.hasImg);
  const barcodeNoImg = enriched.filter((p) => p.hasBarcode && !p.hasImg);
  const barcodeWithImg = enriched.filter((p) => p.hasBarcode && p.hasImg);
  const broken = enriched.filter((p) => p.brokenUrl);
  const sold = enriched.filter((p) => p.soldTimes > 0);
  const soldBarcodeNoImg = enriched.filter(
    (p) => p.soldTimes > 0 && p.hasBarcode && !p.hasImg,
  );
  const soldNoBarcode = enriched.filter((p) => p.soldTimes > 0 && !p.hasBarcode);

  console.log(`\n${c.magenta}${c.bold}═══ Barcodes e imágenes ═══${c.reset}\n`);
  console.log(`${c.cyan}${c.bold}Resumen${c.reset}`);
  line("Productos totales", total, c.white);
  line(`Con barcode (${pct(withBarcode.length, total)})`, withBarcode.length, c.yellow);
  line(`Sin barcode (${pct(withoutBarcode.length, total)})`, withoutBarcode.length, c.dim);
  line(`Con imagen usable (${pct(withImg.length, total)})`, withImg.length, c.green);
  line(`Sin imagen usable (${pct(withoutImg.length, total)})`, withoutImg.length, c.red);
  line("Ruta en BD pero archivo faltante", broken.length, c.red);
  line("Con barcode + imagen", barcodeWithImg.length, c.green);
  line("Con barcode SIN imagen", barcodeNoImg.length, c.yellow);
  line("Vendidos (únicos)", sold.length, c.magenta);
  line("Vendidos + barcode SIN imagen", soldBarcodeNoImg.length, c.yellow);
  line("Vendidos SIN barcode", soldNoBarcode.length, c.dim);

  console.log(
    `\n${c.dim}Candidatos Go-UPC (barcode sin imagen): ${c.reset}${c.bold}${c.yellow}${barcodeNoImg.length}${c.reset}`,
  );
  console.log(
    `${c.dim}De esos, ya vendidos: ${c.reset}${c.bold}${c.magenta}${soldBarcodeNoImg.length}${c.reset}`,
  );

  if (!LIST_MODE) {
    console.log(
      `\n${c.dim}Tip: --list=with-barcode | barcode-no-img | sold-barcode-no-img | broken | no-barcode${c.reset}`,
    );
    return;
  }

  const lists = {
    "with-barcode": {
      title: "Productos CON código de barras",
      rows: withBarcode,
      color: c.yellow,
    },
    "barcode-no-img": {
      title: "Con barcode SIN imagen (candidatos Go-UPC)",
      rows: barcodeNoImg,
      color: c.yellow,
    },
    "sold-barcode-no-img": {
      title: "Vendidos con barcode SIN imagen",
      rows: soldBarcodeNoImg.sort((a, b) => b.soldTimes - a.soldTimes),
      color: c.magenta,
    },
    broken: {
      title: "Ruta en BD pero archivo inexistente",
      rows: broken,
      color: c.red,
    },
    "no-barcode": {
      title: "Sin código de barras",
      rows: withoutBarcode,
      color: c.dim,
    },
  };

  const pick = lists[LIST_MODE];
  if (!pick) {
    console.log(`${c.red}Lista desconocida:${c.reset} ${LIST_MODE}`);
    console.log(`Opciones: ${Object.keys(lists).join(", ")}`);
    process.exitCode = 1;
    return;
  }
  printList(pick.title, pick.rows, pick.color);
}

main()
  .catch((err) => {
    console.error(`${c.red}Error:${c.reset}`, err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch {
      /* ignore */
    }
  });
