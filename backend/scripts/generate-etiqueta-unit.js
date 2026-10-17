/**
 * Genera plantilla de UNA etiqueta (formato personalizado).
 * Imagen 1:1 (azul) + franja código barras (naranja).
 *
 * node scripts/generate-etiqueta-unit.js [--width 496] [--height 701]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { width: 496, height: 701 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--width" && argv[i + 1]) out.width = Number(argv[++i]);
    if (argv[i] === "--height" && argv[i + 1]) out.height = Number(argv[++i]);
  }
  return out;
}

const { width: LABEL_W, height: LABEL_H } = parseArgs(process.argv.slice(2));

const IMAGE_SIZE = Math.min(LABEL_W - 32, LABEL_W - 32);
const IMAGE_X = Math.round((LABEL_W - IMAGE_SIZE) / 2);
const HEADER_H = 36;
const NAME_H = 30;
const GAP = 4;
const IMAGE_Y = HEADER_H;
const NAME_Y = IMAGE_Y + IMAGE_SIZE + GAP;
const BARCODE_Y = NAME_Y + NAME_H + GAP;
const BARCODE_H = Math.max(80, LABEL_H - BARCODE_Y);

const COLORS = {
  labelBg: "#FAF6EE",
  logo: "#E8DCC8",
  zoneProduct: "#7EC8E3",
  zoneBarcode: "#FFB74D",
  text: "#1A1A1A",
};

const layers = [
  {
    id: "label_bg",
    groupId: "group_etiqueta",
    type: "shape",
    x: 0,
    y: 0,
    w: LABEL_W,
    h: LABEL_H,
    zIndex: 1,
    props: { fill: COLORS.labelBg, borderRadius: 0 },
    name: "Fondo etiqueta",
    visible: true,
    locked: false,
  },
  {
    id: "logo",
    groupId: "group_etiqueta",
    type: "shape",
    x: Math.round(LABEL_W / 2 - 18),
    y: 6,
    w: 36,
    h: 36,
    zIndex: 5,
    props: { fill: COLORS.logo, borderRadius: 999 },
    name: "Logo (fijo)",
    visible: true,
    locked: false,
  },
  {
    id: "logo_text",
    groupId: "group_etiqueta",
    type: "text",
    x: Math.round(LABEL_W / 2 - 40),
    y: 8,
    w: 80,
    h: 32,
    zIndex: 6,
    props: {
      text: "ED Deli",
      fontFamily: "Inter, system-ui, Arial",
      fontSize: 11,
      fontWeight: 900,
      color: "#5D4037",
      align: "center",
      verticalAlign: "center",
    },
    name: "Texto logo",
    visible: true,
    locked: false,
  },
  {
    id: "zone_producto",
    groupId: "group_etiqueta",
    type: "shape",
    x: IMAGE_X,
    y: IMAGE_Y,
    w: IMAGE_SIZE,
    h: IMAGE_SIZE,
    zIndex: 10,
    props: { fill: COLORS.zoneProduct, borderRadius: 6 },
    name: "Zona imagen 1:1 (azul)",
    visible: true,
    locked: false,
  },
  {
    id: "product_image",
    groupId: "group_etiqueta",
    type: "image",
    x: IMAGE_X,
    y: IMAGE_Y,
    w: IMAGE_SIZE,
    h: IMAGE_SIZE,
    zIndex: 11,
    props: { src: "", fit: "contain", borderRadius: 6 },
    bind: { srcFrom: "imageUrl", fallbackSrc: "" },
    name: "Imagen producto 1:1",
    visible: true,
    locked: false,
  },
  {
    id: "product_name",
    groupId: "group_etiqueta",
    type: "text",
    x: 6,
    y: NAME_Y,
    w: LABEL_W - 12,
    h: NAME_H,
    zIndex: 20,
    props: {
      text: "NOMBRE PRODUCTO",
      fontFamily: "Inter, system-ui, Arial",
      fontSize: 20,
      fontWeight: 900,
      color: COLORS.text,
      align: "center",
      maxLines: 2,
      lineHeight: 1.05,
    },
    bind: { textFrom: "displayName", maxLen: 36 },
    name: "Nombre producto",
    visible: true,
    locked: false,
  },
  {
    id: "zone_barcode",
    groupId: "group_etiqueta",
    type: "shape",
    x: 0,
    y: BARCODE_Y,
    w: LABEL_W,
    h: BARCODE_H,
    zIndex: 15,
    props: { fill: COLORS.zoneBarcode, borderRadius: 0 },
    name: "Zona código barras (naranja)",
    visible: true,
    locked: false,
  },
  {
    id: "barcode_image",
    groupId: "group_etiqueta",
    type: "image",
    x: 10,
    y: BARCODE_Y + 8,
    w: LABEL_W - 20,
    h: Math.max(40, BARCODE_H - 36),
    zIndex: 16,
    props: { src: "", fit: "contain", borderRadius: 0 },
    bind: { srcFrom: "computed.barcodeImageUrl", fallbackSrc: "" },
    name: "Código de barras",
    visible: true,
    locked: false,
  },
  {
    id: "barcode_text",
    groupId: "group_etiqueta",
    type: "text",
    x: 6,
    y: BARCODE_Y + BARCODE_H - 24,
    w: LABEL_W - 12,
    h: 20,
    zIndex: 17,
    props: {
      text: "0000000000000",
      fontFamily: "Inter, system-ui, Arial",
      fontSize: 13,
      fontWeight: 600,
      color: COLORS.text,
      align: "center",
    },
    bind: { textFrom: "product.barcode" },
    name: "Número barras",
    visible: true,
    locked: false,
  },
];

const template = {
  canvas: { width: LABEL_W, height: LABEL_H },
  format: "custom",
  meta: {
    name: `Etiqueta unitaria EdDeli (${LABEL_W}×${LABEL_H})`,
    templateKind: "mixto",
    requiresProduct: true,
    backgroundMode: "color",
  },
  groups: [{ id: "group_etiqueta", x: 0, y: 0, visible: true, locked: false }],
  layers,
  data: {},
};

const outPath = path.resolve(
  __dirname,
  "../../../raptor/frontend/src/pages/eddeli/photoshop/templates/etiqueta-unitaria-eddeli.json"
);

fs.writeFileSync(outPath, JSON.stringify(template, null, 2), "utf8");
console.log(`✅ Etiqueta unitaria ${LABEL_W}×${LABEL_H}px → ${outPath}`);
