/**
 * Menú interactivo de scripts del backend (EdDeli / Store / Tienda).
 *
 * Uso (desde el backend de la app):
 *   npm run scripts
 *
 * Controles: ↑↓ mover · Enter elegir · Esc / q salir
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, "..");

function detectAppLabel() {
  try {
    const pkg = JSON.parse(
      readFileSync(path.join(BACKEND_ROOT, "package.json"), "utf8"),
    );
    const name = String(pkg.name || "").toLowerCase();
    if (name.includes("store")) return "Store";
    if (name.includes("tienda")) return "Tienda";
    if (name.includes("eddeli")) return "EdDeli";
    return pkg.name || "Backend";
  } catch {
    return "Backend";
  }
}

const APP_LABEL = detectAppLabel();

/** @typedef {{ id: string, title: string, desc: string, file: string, args?: string[], env?: Record<string,string>, danger?: 'low'|'med'|'high', write?: boolean }} ScriptItem */

/** @type {{ name: string, items: ScriptItem[] }[]} */
const CATALOG = [
  {
    name: "Imágenes / barcodes",
    color: "magenta",
    items: [
      {
        id: "report-barcodes",
        title: "Reporte barcodes e imágenes",
        desc: "Totales: con/sin barcode, con/sin imagen, vendidos, candidatos Go-UPC.",
        file: "report-product-barcodes-images.js",
        danger: "low",
      },
      {
        id: "report-list-barcode",
        title: "Listar productos CON barcode",
        desc: "Lista id, barcode, si tiene imagen usable.",
        file: "report-product-barcodes-images.js",
        args: ["--list=with-barcode"],
        danger: "low",
      },
      {
        id: "report-list-candidates",
        title: "Listar candidatos Go-UPC (barcode sin img)",
        desc: "Productos con código de barras pero sin imagen en disco.",
        file: "report-product-barcodes-images.js",
        args: ["--list=barcode-no-img"],
        danger: "low",
      },
      {
        id: "report-list-sold",
        title: "Listar vendidos con barcode sin img",
        desc: "Prioridad: ya se vendieron y les falta foto.",
        file: "report-product-barcodes-images.js",
        args: ["--list=sold-barcode-no-img"],
        danger: "low",
      },
      {
        id: "img-clear-dry",
        title: "Limpiar imágenes rotas (simular)",
        desc: "Lista primaryImageUrl cuyo archivo ya no existe. No escribe.",
        file: "clear-missing-product-images.js",
        args: ["--dry-run"],
        danger: "low",
      },
      {
        id: "img-clear",
        title: "Limpiar imágenes rotas (aplicar)",
        desc: "Deja primaryImageUrl en NULL cuando el archivo no existe en disco.",
        file: "clear-missing-product-images.js",
        write: true,
        danger: "med",
      },
      {
        id: "img-sync-server-dry",
        title: "Subir imágenes al servidor (dry-run)",
        desc: "Simula rsync por SSH/WireGuard + SQL de primaryImageUrl. No escribe en el server.",
        file: "sync-product-images-to-server.js",
        args: ["--dry-run"],
        danger: "low",
      },
      {
        id: "img-sync-server",
        title: "Subir imágenes al servidor (SSH)",
        desc: "Copia sistema/products por SSH y aplica primaryImageUrl en la BD remota. WireGuard debe estar ON.",
        file: "sync-product-images-to-server.js",
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-list-skip",
        title: "Ver omitidos Go-UPC (sin foto)",
        desc: "Lista productos ya consultados sin imagen, guardados en goupc-skip.json.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--list-skip"],
        danger: "low",
      },
      {
        id: "img-goupc-reset-skip",
        title: "Limpiar omitidos Go-UPC",
        desc: "Borra goupc-skip.json para volver a consultar también los sin foto.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--reset-skip"],
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-sim5",
        title: "Simular Go-UPC · lote de 5",
        desc: "Consulta 5 candidatos, ~5s entre cada uno. No escribe.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--dry-run", "--limit=5", "--delay=5000"],
        danger: "low",
      },
      {
        id: "img-goupc-sim10",
        title: "Simular Go-UPC · lote de 10",
        desc: "Consulta 10 con ~5s entre cada uno. No escribe.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--dry-run", "--limit=10", "--delay=5000"],
        danger: "low",
      },
      {
        id: "img-goupc-5",
        title: "Aplicar Go-UPC · lote de 5",
        desc: "Descarga hasta 5 imágenes, ~5s entre cada una.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--limit=5", "--delay=5000"],
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-5-off5",
        title: "Aplicar Go-UPC · lote 5 (offset 5)",
        desc: "Segundo lote: offset=5, ~5s entre cada uno.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--limit=5", "--offset=5", "--delay=5000"],
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-5-off10",
        title: "Aplicar Go-UPC · lote 5 (offset 10)",
        desc: "Tercer lote: offset=10, ~5s entre cada uno.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--limit=5", "--offset=10", "--delay=5000"],
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-5-off15",
        title: "Aplicar Go-UPC · lote 5 (offset 15)",
        desc: "Cuarto lote: offset=15, ~5s entre cada uno.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--limit=5", "--offset=15", "--delay=5000"],
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-10",
        title: "Aplicar Go-UPC · lote de 10",
        desc: "Hasta 10 con ~5s entre cada uno.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--limit=10", "--delay=5000"],
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-all-human",
        title: "Aplicar Go-UPC · todos (humano variable)",
        desc: "Uno por uno ~5s; cada 2–10 productos (al azar) pausa 5–10 min (al azar). Sin patrón fijo.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--human", "--delay=5000"],
        write: true,
        danger: "med",
      },
      {
        id: "img-goupc-all-human-dry",
        title: "Simular Go-UPC · todos (humano variable)",
        desc: "Igual ritmo variable, pero no descarga ni escribe.",
        file: "enrich-product-images-from-goupc.js",
        args: ["--human", "--dry-run", "--delay=5000"],
        danger: "low",
      },
    ],
  },
  {
    name: "Productos / categorías",
    color: "cyan",
    items: [
      {
        id: "raw-final-dry",
        title: "Raw → final (dry-run)",
        desc: "Lista insumos (type=raw) que pasarían a final. No escribe.",
        file: "set-raw-products-to-final.js",
        args: ["--dry-run"],
        danger: "low",
      },
      {
        id: "raw-final",
        title: "Raw → final (aplicar)",
        desc: "Cambia type raw→final e isGenericIngredient=false.",
        file: "set-raw-products-to-final.js",
        write: true,
        danger: "med",
      },
      {
        id: "merge-yema-dry",
        title: "Fusionar Pan de Yema → Pan de Sal (dry-run)",
        desc: "Simula mover ventas/FKs de Pan de Yema a Pan de Sal.",
        file: "merge-pan-de-yema-into-pan-de-sal.mjs",
        danger: "low",
      },
      {
        id: "merge-yema",
        title: "Fusionar Pan de Yema → Pan de Sal (aplicar)",
        desc: "Aplica la fusión de productos. Irreversible sin backup.",
        file: "merge-pan-de-yema-into-pan-de-sal.mjs",
        args: ["--apply"],
        write: true,
        danger: "high",
      },
      {
        id: "assign-cats-dry",
        title: "Asignar categorías faltantes (dry-run)",
        desc: "Muestra mapeo productId→categoryId sin escribir.",
        file: "assign-missing-product-categories.mjs",
        danger: "low",
      },
      {
        id: "assign-cats",
        title: "Asignar categorías faltantes (aplicar)",
        desc: "Escribe categoryId en productos sin categoría.",
        file: "assign-missing-product-categories.mjs",
        args: ["--apply"],
        write: true,
        danger: "med",
      },
      {
        id: "audit-prod-cats",
        title: "Auditar productos / categorías",
        desc: "Reporte de categorías y productos en BD.",
        file: "audit-products-categories.js",
        danger: "low",
      },
      {
        id: "seed-panes",
        title: "Seed grupo de precios Panes",
        desc: "Crea/actualiza grupo mix de precios bajo subcategoría Panes.",
        file: "seed-panes-pricing-group.js",
        write: true,
        danger: "med",
      },
      {
        id: "reorg-cats",
        title: "Reorganizar categorías y productos",
        desc: "Reasigna categorías/subcategorías según tipo y nombre.",
        file: "reorganize-categories-products.js",
        write: true,
        danger: "high",
      },
      {
        id: "migrate-cats",
        title: "Migrar jerarquía de categorías",
        desc: "Arma principales + subcategorías (Panes bajo Panadería, etc.).",
        file: "migrate-category-hierarchy.js",
        write: true,
        danger: "high",
      },
      {
        id: "migrate-tramos",
        title: "Migrar tramos a pricing groups",
        desc: "Pasa packageTiers/mixMatch de categorías a ERP_pricing_tier_groups.",
        file: "migrate-tramos-from-categories.js",
        write: true,
        danger: "high",
      },
    ],
  },
  {
    name: "Pedidos / stock / finanzas",
    color: "yellow",
    items: [
      {
        id: "analyze-paid",
        title: "Analizar pagados sin entregar",
        desc: "Reporte de ítems con paidAt y sin deliveredAt.",
        file: "analyze-paid-not-delivered.mjs",
        danger: "low",
      },
      {
        id: "analyze-pending",
        title: "Analizar pendientes de entrega",
        desc: "Reporte de pendientes (patrones liv/liw/etc.).",
        file: "analyze-pending-delivery.mjs",
        danger: "low",
      },
      {
        id: "seed-paid-del-dry",
        title: "Marcar pagados como entregados (dry-run)",
        desc: "Lista ítems paidAt sin deliveredAt. No escribe.",
        file: "seed-mark-paid-delivered.mjs",
        danger: "low",
      },
      {
        id: "seed-paid-del",
        title: "Marcar pagados como entregados (aplicar)",
        desc: "Setea deliveredAt = Order.date. No mueve stock.",
        file: "seed-mark-paid-delivered.mjs",
        args: ["--apply"],
        write: true,
        danger: "med",
      },
      {
        id: "seed-unpaid-del-dry",
        title: "Marcar no pagados como entregados (dry-run)",
        desc: "Lista ítems sin paidAt ni deliveredAt. No escribe.",
        file: "seed-mark-unpaid-delivered.mjs",
        danger: "low",
      },
      {
        id: "seed-unpaid-del",
        title: "Marcar no pagados como entregados (aplicar)",
        desc: "Setea deliveredAt sin marcar paidAt. No mueve stock.",
        file: "seed-mark-unpaid-delivered.mjs",
        args: ["--apply"],
        write: true,
        danger: "med",
      },
      {
        id: "zero-stock-dry",
        title: "Poner TODO el stock en 0 (dry-run)",
        desc: "Simula stock=0 en productos y locales. No escribe.",
        file: "seed-zero-all-stock.mjs",
        danger: "low",
      },
      {
        id: "zero-stock",
        title: "Poner TODO el stock en 0 (aplicar)",
        desc: "Pone stock global y por local en 0. No crea movimientos.",
        file: "seed-zero-all-stock.mjs",
        args: ["--apply"],
        write: true,
        danger: "high",
      },
      {
        id: "diag-supplier",
        title: "Diagnosticar pagos a proveedor",
        desc: "Revisa abonos/expenses/cuentas (orderId por defecto 15).",
        file: "diagnose-supplier-pay.js",
        danger: "low",
      },
      {
        id: "fix-expense-fk",
        title: "Fix FK expense referenceId",
        desc: "Quita FK incorrecta de referenceId → productos (rompe abonos).",
        file: "fix-expense-reference-fk.js",
        write: true,
        danger: "med",
      },
      {
        id: "fix-pos-cf",
        title: "Fix POS → Consumidor Final",
        desc: "Crea/reasigna ventas POS de mostrador al cliente Consumidor Final.",
        file: "fix-pos-consumidor-final.js",
        write: true,
        danger: "med",
      },
      {
        id: "ensure-seller",
        title: "Asegurar columna sellerAccountId",
        desc: "ADD COLUMN sellerAccountId en ERP_orders si falta.",
        file: "ensure_seller_account_id.mjs",
        write: true,
        danger: "low",
      },
    ],
  },
  {
    name: "Backup / BD / esquema",
    color: "blue",
    items: [
      {
        id: "check-backup",
        title: "Ver resumen de backup.json",
        desc: "Muestra si existe y cuántas filas tiene.",
        file: "check-backup.js",
        danger: "low",
      },
      {
        id: "verify-backup",
        title: "Verificar integridad backup.json",
        desc: "Detecta JSON corrupto (////) en backup y flujo de restore.",
        file: "verify-backup-json.js",
        danger: "low",
      },
      {
        id: "save-backup",
        title: "Guardar backup ahora",
        desc: "Exporta BD viva a backup.json (actualiza principal).",
        file: "save-backup-now.js",
        write: true,
        danger: "med",
      },
      {
        id: "audit-backup-tables",
        title: "Auditar tablas de backup",
        desc: "Compara modelos Sequelize vs entradas de backup vs archivo.",
        file: "audit-backup-tables.js",
        danger: "low",
      },
      {
        id: "audit-json",
        title: "Auditar campos JSON (BD + backup)",
        desc: "Busca JSON mal guardado. Incluye --backup.",
        file: "audit-json-fields.js",
        args: ["--backup"],
        danger: "low",
      },
      {
        id: "repair-json",
        title: "Reparar campos JSON",
        desc: "Normaliza packageTiers/wholesaleRules/etc. mal escapados.",
        file: "repair-json-fields.js",
        write: true,
        danger: "med",
      },
      {
        id: "patch-backup",
        title: "Parchear esquema de backup.json",
        desc: "Normaliza backup.json al esquema actual (AppSettings, etc.).",
        file: "patch-backup-schema.js",
        write: true,
        danger: "med",
      },
      {
        id: "merge-servidor-dry",
        title: "Fusionar backup servidor → local (dry-run)",
        desc: "Simula insertar delta del servidor sin tocar filas locales.",
        file: "merge-servidor-backup-into-live.mjs",
        danger: "low",
      },
      {
        id: "merge-servidor",
        title: "Fusionar backup servidor → local (aplicar)",
        desc: "Escribe el delta del servidor en la BD local.",
        file: "merge-servidor-backup-into-live.mjs",
        args: ["--apply"],
        write: true,
        danger: "high",
      },
      {
        id: "migrate-paths",
        title: "Migrar rutas EdDeli/ → sistema/",
        desc: "Mueve medios legacy y actualiza rutas en BD/backup.",
        file: "migrate-eddeli-paths-to-sistema.js",
        write: true,
        danger: "high",
      },
      {
        id: "sync-schema",
        title: "Sync esquema completo (ALTER)",
        desc: "Sincroniza modelos Sequelize con la BD (DB_SYNC_ALTER=1).",
        file: "sync-schema.js",
        env: { DB_SYNC_ALTER: "1" },
        write: true,
        danger: "high",
      },
      {
        id: "sync-cats",
        title: "Sync esquema categorías",
        desc: "ALTER solo en ERP_inventory_categories.",
        file: "sync-category-schema.js",
        write: true,
        danger: "med",
      },
      {
        id: "sync-editor",
        title: "Sync esquema editor",
        desc: "ALTER solo en editor_templates.",
        file: "sync-editor-schema.js",
        write: true,
        danger: "med",
      },
      {
        id: "reset-db",
        title: "RESET BD desde backup.json",
        desc: "BORRA todas las tablas, recrea y carga backup. Destructivo.",
        file: "reset-database.js",
        write: true,
        danger: "high",
      },
    ],
  },
  {
    name: "Roles / editor / demo",
    color: "green",
    items: [
      {
        id: "fix-role",
        title: "Renombrar rol Estudiante → Empleado",
        desc: "Actualiza el nombre del rol en BD.",
        file: "fix-estudiante-to-empleado-role.js",
        write: true,
        danger: "med",
      },
      {
        id: "gen-etiq-a4",
        title: "Generar plantilla etiqueta A4 5×5",
        desc: "Genera JSON/assets de plantilla A4 (no toca BD sola).",
        file: "generate-etiqueta-a4-grid.js",
        danger: "low",
      },
      {
        id: "gen-etiq-unit",
        title: "Generar plantilla etiqueta unitaria",
        desc: "Genera plantilla de una etiqueta.",
        file: "generate-etiqueta-unit.js",
        danger: "low",
      },
      {
        id: "apply-etiq",
        title: "Aplicar plantilla etiqueta unitaria a BD",
        desc: "Aplica doc de etiqueta unitaria a plantilla #6 (o id).",
        file: "apply-etiqueta-unitaria-template.js",
        write: true,
        danger: "med",
      },
      {
        id: "demo-toasts",
        title: "Demo toasts de notificaciones",
        desc: "Dispara toasts de prueba (backend y app deben estar abiertos).",
        file: "demo-notification-toasts.js",
        danger: "low",
      },
      {
        id: "fix-shifts-backup",
        title: "Fix turnos vie/sáb en backup.json",
        desc: "Corrige turnos 19-20 en backup (almuerzos/cuadre).",
        file: "fix-backup-shifts-viernes-sabado.js",
        write: true,
        danger: "med",
      },
      {
        id: "apply-insumos-backup",
        title: "Aplicar insumos a un backup JSON",
        desc: "Transforma un backup externo (pide rutas). Mejor correrlo a mano si no conoces paths.",
        file: "apply-insumos-to-backup.js",
        write: true,
        danger: "med",
      },
    ],
  },
];

const EXIT_ID = "__exit__";
const BACK_ID = "__back__";

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  white: "\x1b[37m",
  brightCyan: "\x1b[96m",
  brightMagenta: "\x1b[95m",
  brightYellow: "\x1b[93m",
  brightGreen: "\x1b[92m",
  brightBlue: "\x1b[94m",
  bg: "\x1b[45m\x1b[97m\x1b[1m",
  bgCyan: "\x1b[46m\x1b[30m\x1b[1m",
  bgBlue: "\x1b[44m\x1b[97m\x1b[1m",
  clear: "\x1b[2J\x1b[H",
  hide: "\x1b[?25l",
  show: "\x1b[?25h",
};

const GROUP_COLOR = {
  magenta: c.brightMagenta,
  cyan: c.brightCyan,
  yellow: c.brightYellow,
  blue: c.brightBlue,
  green: c.brightGreen,
};

function dangerBadge(level) {
  if (level === "high") return `${c.red}${c.bold}✖ PELIGRO${c.reset}`;
  if (level === "med") return `${c.yellow}${c.bold}◆ escribe${c.reset}`;
  return `${c.green}○ seguro${c.reset}`;
}

function paintGroupTitle(name, colorKey) {
  const col = GROUP_COLOR[colorKey] || c.brightCyan;
  return `${col}${c.bold}▸ ${name}${c.reset}`;
}

function assertTty() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      "Este menú necesita una terminal interactiva (TTY).\n" +
        `Abrí una terminal en el backend de ${APP_LABEL} y corré: npm run scripts`,
    );
    process.exit(1);
  }
}

function flattenForGroup(group) {
  return [
    ...group.items.map((item) => ({ kind: "script", item })),
    { kind: "back", id: BACK_ID, title: "← Volver" },
  ];
}

function groupMenuRows() {
  return [
    ...CATALOG.map((g, i) => ({
      kind: "group",
      index: i,
      title: g.name,
      color: g.color,
      count: g.items.length,
    })),
    { kind: "exit", id: EXIT_ID, title: "Salir" },
  ];
}

/**
 * @param {string} title
 * @param {{kind:string,title?:string,item?:ScriptItem,count?:number,id?:string,color?:string}[]} rows
 * @param {(row:any)=>string} detailFn
 */
async function selectList(title, rows, detailFn) {
  let index = 0;
  const render = () => {
    const lines = [];
    lines.push(
      `${c.brightMagenta}${c.bold}╔══════════════════════════════════════════╗${c.reset}`,
    );
    lines.push(
      `${c.brightMagenta}${c.bold}║${c.reset}  ${c.brightCyan}${c.bold}${APP_LABEL}${c.reset} ${c.white}·${c.reset} ${c.brightYellow}${c.bold}Scripts Launcher${c.reset}          ${c.brightMagenta}${c.bold}║${c.reset}`,
    );
    lines.push(
      `${c.brightMagenta}${c.bold}╚══════════════════════════════════════════╝${c.reset}`,
    );
    lines.push(`${c.cyan}${title}${c.reset}`);
    lines.push(`${c.dim}↑↓ mover  ·  Enter elegir  ·  Esc / q salir${c.reset}`);
    lines.push("");
    rows.forEach((row, i) => {
      const selected = i === index;
      const pointer = selected ? `${c.bg} ❯ ${c.reset}` : "   ";
      let label = row.title || row.item?.title || "";
      if (row.kind === "group") {
        const painted = paintGroupTitle(row.title, row.color);
        label = `${painted}  ${c.dim}(${row.count})${c.reset}`;
      } else if (row.kind === "script" && row.item) {
        const tone =
          row.item.danger === "high"
            ? c.red
            : row.item.danger === "med"
              ? c.yellow
              : c.brightCyan;
        label = `${tone}${row.item.title}${c.reset}  ${dangerBadge(row.item.danger || "low")}`;
      } else if (row.kind === "back") {
        label = `${c.brightBlue}← Volver${c.reset}`;
      } else if (row.kind === "exit") {
        label = `${c.red}Salir${c.reset}`;
      }
      const rowLine = selected
        ? `${pointer}${c.bold}${label}${c.reset}`
        : `${pointer}${label}`;
      lines.push(rowLine);
    });
    lines.push("");
    const detail = detailFn(rows[index]);
    if (detail) {
      lines.push(`${c.magenta}${c.dim}────────────────────────────────────────────${c.reset}`);
      lines.push(detail);
    }
    process.stdout.write(c.clear + c.hide + lines.join("\n") + "\n");
  };

  render();

  return new Promise((resolve) => {
    const onKey = (buf) => {
      const s = buf.toString("utf8");
      if (s === "\u0003" || s === "\u001b" || s === "q" || s === "Q") {
        cleanup();
        resolve(null);
        return;
      }
      if (s === "\u001b[A" || s === "k") {
        index = (index - 1 + rows.length) % rows.length;
        render();
        return;
      }
      if (s === "\u001b[B" || s === "j") {
        index = (index + 1) % rows.length;
        render();
        return;
      }
      if (s === "\r" || s === "\n") {
        cleanup();
        resolve(rows[index]);
      }
    };

    const cleanup = () => {
      process.stdin.off("data", onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write(c.show);
    };

    process.stdin.resume();
    process.stdin.setRawMode(true);
    process.stdin.on("data", onKey);
  });
}

function askConfirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${question} ${c.dim}[s/N]${c.reset} `, (answer) => {
      rl.close();
      const a = String(answer || "")
        .trim()
        .toLowerCase();
      resolve(a === "s" || a === "si" || a === "sí" || a === "y" || a === "yes");
    });
  });
}

function waitEnter(msg = "Enter para volver al menú…") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`\n${c.dim}${msg}${c.reset} `, () => {
      rl.close();
      resolve();
    });
  });
}

function runScript(item) {
  const scriptPath = path.join(__dirname, item.file);
  const args = [scriptPath, ...(item.args || [])];
  const env = { ...process.env, ...(item.env || {}) };

  console.log("");
  console.log(`${c.bold}Ejecutando:${c.reset} node ${path.relative(BACKEND_ROOT, scriptPath)}${(item.args || []).length ? " " + item.args.join(" ") : ""}`);
  console.log(`${c.dim}cwd: ${BACKEND_ROOT}${c.reset}`);
  console.log(`${c.dim}────────────────────────────────────────${c.reset}\n`);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: BACKEND_ROOT,
      env,
      stdio: "inherit",
    });
    child.on("exit", (code, signal) => {
      console.log("");
      if (signal) {
        console.log(`${c.yellow}Terminó por señal ${signal}${c.reset}`);
      } else if (code === 0) {
        console.log(`${c.green}OK (exit ${code})${c.reset}`);
      } else {
        console.log(`${c.red}Falló (exit ${code})${c.reset}`);
      }
      resolve(code ?? 1);
    });
  });
}

async function confirmAndRun(item) {
  process.stdout.write(c.clear + c.show);
  console.log(`${c.brightMagenta}${c.bold}╭──────────────────────────────────────╮${c.reset}`);
  console.log(`${c.brightMagenta}${c.bold}│${c.reset} ${c.brightCyan}${c.bold}${item.title}${c.reset}`);
  console.log(`${c.brightMagenta}${c.bold}╰──────────────────────────────────────╯${c.reset}`);
  console.log(dangerBadge(item.danger || "low"));
  console.log("");
  console.log(`${c.white}${item.desc}${c.reset}`);
  console.log("");
  console.log(`${c.dim}Archivo:${c.reset} ${c.cyan}scripts/${item.file}${c.reset}`);
  if (item.args?.length) {
    console.log(`${c.dim}Args:${c.reset} ${c.yellow}${item.args.join(" ")}${c.reset}`);
  }
  if (item.write) {
    console.log(`${c.yellow}${c.bold}Esta acción puede escribir en BD y/o disco.${c.reset}`);
  }
  if (item.danger === "high") {
    console.log(`${c.red}${c.bold}ATENCIÓN: operación sensible / potencialmente destructiva.${c.reset}`);
  }
  console.log("");

  const ok = await askConfirm(`${c.brightGreen}¿Ejecutar ahora?${c.reset}`);
  if (!ok) {
    console.log(`${c.dim}Cancelado.${c.reset}`);
    await waitEnter();
    return;
  }

  await runScript(item);
  await waitEnter();
}

async function openGroup(group) {
  while (true) {
    const row = await selectList(
      `Categoría: ${group.name}`,
      flattenForGroup(group),
      (r) => {
        if (r?.kind === "script" && r.item) {
          return `${c.dim}${r.item.desc}${c.reset}\n${c.dim}→ scripts/${r.item.file}${(r.item.args || []).length ? " " + r.item.args.join(" ") : ""}${c.reset}`;
        }
        if (r?.kind === "back") return `${c.dim}Regresa al listado de categorías.${c.reset}`;
        return "";
      },
    );

    if (!row || row.kind === "back") return;
    if (row.kind === "script") {
      await confirmAndRun(row.item);
    }
  }
}

async function main() {
  assertTty();

  while (true) {
    const row = await selectList(
      "Elegí una categoría",
      groupMenuRows(),
      (r) => {
        if (r?.kind === "group") {
          const g = CATALOG[r.index];
          const names = g.items
            .slice(0, 4)
            .map((i) => i.title)
            .join(" · ");
          const more = g.items.length > 4 ? "…" : "";
          return `${c.dim}${names}${more}${c.reset}`;
        }
        if (r?.kind === "exit") return `${c.dim}Cierra el menú.${c.reset}`;
        return "";
      },
    );

    if (!row || row.kind === "exit") {
      process.stdout.write(c.clear + c.show);
      console.log("Listo.");
      return;
    }

    if (row.kind === "group") {
      await openGroup(CATALOG[row.index]);
    }
  }
}

main().catch((err) => {
  process.stdout.write(c.show);
  console.error("Error en el menú:", err?.message || err);
  process.exitCode = 1;
});
