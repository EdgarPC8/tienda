/**
 * Genera plantilla A4 — 5×5 etiquetas EdDeli.
 * Imagen producto 1:1 (cuadrado azul) + franja código barras (naranja) abajo en capas.
 *
 * node scripts/generate-etiqueta-a4-grid.js
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CANVAS = { width: 2480, height: 3508 };
const COLS = 5;
const ROWS = 5;
const LABEL_W = Math.floor(CANVAS.width / COLS);
const LABEL_H = Math.floor(CANVAS.height / ROWS);

/** Cuadrado 1:1 para la foto del producto (capa azul) */
const IMAGE_SIZE = Math.min(LABEL_W - 32, LABEL_W - 32);
const IMAGE_X = Math.round((LABEL_W - IMAGE_SIZE) / 2);

const HEADER_H = 36;
const NAME_H = 30;
const GAP = 4;

const IMAGE_Y = HEADER_H;
const NAME_Y = IMAGE_Y + IMAGE_SIZE + GAP;
const BARCODE_Y = NAME_Y + NAME_H + GAP;
const BARCODE_H = LABEL_H - BARCODE_Y;

const COLORS = {
  page: "#FFFFFF",
  labelBg: "#FAF6EE",
  logo: "#E8DCC8",
  zoneProduct: "#7EC8E3",
  zoneBarcode: "#FFB74D",
  text: "#1A1A1A",
};

function makeLabelLayers(groupId, prefix) {
  return [
    {
      id: `${prefix}_bg`,
      groupId,
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
      id: `${prefix}_logo`,
      groupId,
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
      id: `${prefix}_logo_text`,
      groupId,
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
      id: `${prefix}_zone_producto`,
      groupId,
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
      id: `${prefix}_product_image`,
      groupId,
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
      id: `${prefix}_product_name`,
      groupId,
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
      id: `${prefix}_zone_barcode`,
      groupId,
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
      id: `${prefix}_barcode_image`,
      groupId,
      type: "image",
      x: 10,
      y: BARCODE_Y + 8,
      w: LABEL_W - 20,
      h: BARCODE_H - 36,
      zIndex: 16,
      props: { src: "", fit: "contain", borderRadius: 0 },
      bind: { srcFrom: "computed.barcodeImageUrl", fallbackSrc: "" },
      name: "Código de barras",
      visible: true,
      locked: false,
    },
    {
      id: `${prefix}_barcode_text`,
      groupId,
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
}

const groups = [{ id: "group_page", x: 0, y: 0, visible: true, locked: true }];
const layers = [
  {
    id: "page_bg",
    groupId: "group_page",
    type: "shape",
    x: 0,
    y: 0,
    w: CANVAS.width,
    h: CANVAS.height,
    zIndex: 0,
    props: { fill: COLORS.page, borderRadius: 0 },
    name: "Hoja A4",
    visible: true,
    locked: true,
  },
];

for (let row = 0; row < ROWS; row += 1) {
  for (let col = 0; col < COLS; col += 1) {
    const gid = `group_label_r${row}c${col}`;
    const prefix = `r${row}c${col}`;
    groups.push({
      id: gid,
      x: col * LABEL_W,
      y: row * LABEL_H,
      visible: true,
      locked: false,
    });
    layers.push(...makeLabelLayers(gid, prefix));
  }
}

const template = {
  canvas: CANVAS,
  meta: {
    name: "Etiquetas A4 EdDeli — 5×5 (1:1 + barras)",
    templateKind: "mixto",
    requiresProduct: true,
    backgroundMode: "color",
  },
  groups,
  layers,
  data: {},
};

const outPath = path.resolve(
  __dirname,
  "../../../raptor/frontend/src/pages/eddeli/photoshop/templates/etiqueta-a4-producto-barcode.json"
);

fs.writeFileSync(outPath, JSON.stringify(template, null, 2), "utf8");
console.log(`✅ Plantilla generada: ${outPath}`);
console.log(
  `   ${COLS}×${ROWS} etiquetas · celda ${LABEL_W}×${LABEL_H}px · imagen 1:1 ${IMAGE_SIZE}px · barras ${BARCODE_H}px · capas: ${layers.length}`
);
