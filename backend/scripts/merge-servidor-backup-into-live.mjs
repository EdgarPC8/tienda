/**
 * Fusiona el delta de backup-eddeli-servidor.json en la BD local (softed).
 * - Inserta filas del servidor que faltan.
 * - Si el id ya existe con otro contenido, asigna id nuevo y remapea FKs.
 * - No borra ni sobrescribe filas locales (p. ej. notificaciones extras).
 *
 * Uso:
 *   node scripts/merge-servidor-backup-into-live.mjs           # dry-run
 *   node scripts/merge-servidor-backup-into-live.mjs --apply   # escribe
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SERVER_BACKUP = path.join(ROOT, "backup-eddeli-servidor.json");
const APPLY = process.argv.includes("--apply");

function sqlDate(v) {
  if (v == null || v === "") return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
}

function jsonField(v) {
  if (v == null) return null;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function pick(row, fields) {
  const out = {};
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(row, f)) out[f] = row[f];
  }
  return out;
}

async function maxId(conn, table, col = "id") {
  const [rows] = await conn.query(`SELECT COALESCE(MAX(\`${col}\`), 0) AS m FROM \`${table}\``);
  return Number(rows[0]?.m || 0);
}

async function existsId(conn, table, id) {
  const [rows] = await conn.query(`SELECT 1 AS ok FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
  return rows.length > 0;
}

/**
 * Planifica ids: si preferred está libre en BD y no lo reclamó otra fila del lote → se conserva.
 * Si choca → id nuevo por encima de max(live, preferreds del lote).
 * Reintentos: si la fila del backup ya está fusionada (p. ej. apply parcial), reutiliza ese id.
 */
function sameInstant(a, b) {
  if (a == null || b == null) return false;
  const ta = new Date(a).getTime();
  const tb = new Date(b).getTime();
  return Number.isFinite(ta) && ta === tb;
}

async function findExistingMergeId(conn, table, raw) {
  if (!raw || typeof raw !== "object") return null;
  if (table === "ERP_orders") {
    const preferred = Number(raw.id);
    const paidAt = sqlDate(raw.paidAt);
    if (!Number.isFinite(preferred) || !paidAt) return null;
    const [atPreferred] = await conn.query(
      "SELECT id FROM `ERP_orders` WHERE id = ? AND paidAt = ? LIMIT 1",
      [preferred, paidAt],
    );
    if (atPreferred.length) return preferred;
    const [remapped] = await conn.query(
      "SELECT id FROM `ERP_orders` WHERE id > ? AND customerId <=> ? AND paidAt = ? ORDER BY id ASC LIMIT 1",
      [preferred, raw.customerId ?? null, paidAt],
    );
    if (remapped.length) return Number(remapped[0].id);
    return null;
  }
  if (table === "ERP_order_items") {
    const preferred = Number(raw.id);
    const backupOrderId = Number(raw.orderId);
    const productId = raw.productId ?? raw.inventoryProductId;
    if (!Number.isFinite(preferred) || !Number.isFinite(backupOrderId)) return null;
    const [rows] = await conn.query(
      "SELECT id FROM `ERP_order_items` WHERE id = ? AND orderId = ? AND productId <=> ? LIMIT 1",
      [preferred, backupOrderId, productId ?? null],
    );
    if (rows.length) return preferred;
    return null;
  }

    if (table === "ERP_cash_shifts") {
    const openedAt = sqlDate(raw.openedAt || raw.createdAt);
    if (!openedAt) return null;
    const [rows] = await conn.query(
      "SELECT id FROM `ERP_cash_shifts` WHERE userId <=> ? AND storeId <=> ? AND openedAt = ? ORDER BY id ASC LIMIT 1",
      [raw.userId ?? null, raw.storeId ?? null, openedAt],
    );
    if (rows.length) return Number(rows[0].id);
    return null;
  }
  const preferred = Number(raw.id);
  if (!Number.isFinite(preferred)) return null;
  if (!(await existsId(conn, table, preferred))) return null;
  const colMeta = await getTableColMeta(conn, table);
  const fields = new Set(colMeta.map((c) => c.Field));
  const checks = [];
  const params = [preferred];
  if (fields.has("createdAt") && raw.createdAt) {
    checks.push("createdAt = ?");
    params.push(sqlDate(raw.createdAt));
  }
  if (fields.has("openDate") && raw.openDate) {
    checks.push("openDate = ?");
    params.push(sqlDate(raw.openDate));
  }
  if (fields.has("date") && raw.date) {
    checks.push("date = ?");
    params.push(sqlDate(raw.date));
  }
  if (!checks.length) return null;
  const [rows] = await conn.query(
    `SELECT id FROM \`${table}\` WHERE id = ? AND (${checks.join(" OR ")}) LIMIT 1`,
    params,
  );
  if (rows.length) return Number(rows[0].id);
  return null;
}

async function planIds(conn, table, preferredIds, rawByPreferred = null) {
  const map = new Map();
  const claimed = new Set();
  let high = await maxId(conn, table);
  for (const id of preferredIds) high = Math.max(high, Number(id));
  let next = high + 1;

  for (const preferredRaw of preferredIds) {
    const preferred = Number(preferredRaw);
    if (map.has(preferred)) continue;
    const raw = rawByPreferred?.get(preferred);
    const freeInDb = !(await existsId(conn, table, preferred));
    if (freeInDb && !claimed.has(preferred)) {
      map.set(preferred, preferred);
      claimed.add(preferred);
      continue;
    }
    const existingId = raw ? await findExistingMergeId(conn, table, raw) : null;
    if (existingId != null && !claimed.has(existingId)) {
      map.set(preferred, existingId);
      claimed.add(existingId);
      continue;
    }
    while (claimed.has(next) || (await existsId(conn, table, next))) next += 1;
    map.set(preferred, next);
    claimed.add(next);
    next += 1;
  }
  return map;
}

const tableColMeta = new Map();

async function getTableColMeta(conn, table) {
  if (!tableColMeta.has(table)) {
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    tableColMeta.set(table, cols);
  }
  return tableColMeta.get(table);
}

function normalizeRowForMysql(row, colMeta) {
  const out = { ...row };
  for (const c of colMeta) {
    if (!Object.prototype.hasOwnProperty.call(out, c.Field)) continue;
    const t = String(c.Type || "").toLowerCase();
    if (t.includes("datetime") || t.includes("timestamp")) {
      out[c.Field] = sqlDate(out[c.Field]);
    } else if (
      (t.includes("longtext") || t.includes("json") || t.includes("text")) &&
      out[c.Field] != null &&
      typeof out[c.Field] === "object"
    ) {
      out[c.Field] = JSON.stringify(out[c.Field]);
    }
  }
  return out;
}

async function insertRow(conn, table, row) {
  const colMeta = await getTableColMeta(conn, table);
  const normalized = normalizeRowForMysql(row, colMeta);
  const cols = Object.keys(normalized);
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT INTO \`${table}\` (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (${placeholders})`;
  await conn.query(sql, cols.map((c) => normalized[c]));
}

async function setAutoInc(conn, table, atLeast) {
  const next = Math.max(1, Number(atLeast) + 1);
  await conn.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = ?`, [next]);
}

async function main() {
  if (!fs.existsSync(SERVER_BACKUP)) {
    throw new Error(`No existe ${SERVER_BACKUP}`);
  }

  console.log(APPLY ? ">>> MODO APPLY (escribe en BD)" : ">>> DRY-RUN (no escribe)");
  console.log("Backup servidor:", SERVER_BACKUP);

  const data = JSON.parse(fs.readFileSync(SERVER_BACKUP, "utf8"));
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASS || "",
    database: process.env.DB_NAME || "softed",
    multipleStatements: false,
  });

  const report = {
    inserted: {},
    remapped: {},
    skipped: {},
  };

  const orderMap = new Map();
  const itemMap = new Map();
  const movMap = new Map();
  const incomeMap = new Map();
  const expenseMap = new Map();
  const obligationMap = new Map();
  const shiftMap = new Map();
  const stockMap = new Map();
  const logMap = new Map();

  function track(reportKey, oldId, newId) {
    const bucket = oldId === newId ? "inserted" : "remapped";
    if (!report[bucket][reportKey]) report[bucket][reportKey] = [];
    report[bucket][reportKey].push(oldId === newId ? newId : `${oldId}→${newId}`);
  }

  // ---------- CashShift 55 ----------
  {
    const table = "ERP_cash_shifts";
    const rows = (data.CashShift || []).filter((r) => Number(r.id) === 55);
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) shiftMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = shiftMap.get(oldId);
      const row = pick(
        {
          ...raw,
          id: newId,
          openedAt: sqlDate(raw.openedAt || raw.createdAt),
          closedAt: sqlDate(raw.closedAt),
          openingCashCounts: jsonField(raw.openingCashCounts),
          closingCashCounts: jsonField(raw.closingCashCounts),
          createdAt: sqlDate(raw.createdAt) || sqlDate(raw.openedAt),
          updatedAt: sqlDate(raw.updatedAt) || sqlDate(raw.createdAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("CashShift", oldId, newId);
      console.log(`CashShift ${oldId} → ${newId}`);
    }
  }

  // ---------- FinancialObligation 5 ----------
  {
    const table = "ERP_finance_obligations";
    const rows = (data.FinancialObligation || []).filter((r) => Number(r.id) === 5);
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) obligationMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = obligationMap.get(oldId);
      const row = pick(
        {
          ...raw,
          id: newId,
          openDate: sqlDate(raw.openDate),
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
          dueDate: sqlDate(raw.dueDate),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("FinancialObligation", oldId, newId);
      console.log(`FinancialObligation ${oldId} → ${newId}`);
    }
  }

  // ---------- Expense 747 ----------
  {
    const table = "ERP_finance_expenses";
    const rows = (data.Expense || []).filter((r) => Number(r.id) === 747);
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) expenseMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = expenseMap.get(oldId);
      let referenceId = raw.referenceId;
      if (raw.referenceType === "obligation_open" && obligationMap.has(Number(raw.referenceId))) {
        referenceId = obligationMap.get(Number(raw.referenceId));
      }
      const row = pick(
        {
          ...raw,
          id: newId,
          referenceId,
          date: sqlDate(raw.date) || sqlDate(raw.createdAt),
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("Expense", oldId, newId);
      console.log(`Expense ${oldId} → ${newId}`);

      if (APPLY && obligationMap.size) {
        for (const [oldOb, newOb] of obligationMap) {
          const ob = (data.FinancialObligation || []).find((r) => Number(r.id) === oldOb);
          if (ob && Number(ob.initialFinanceId) === oldId) {
            await conn.query(
              `UPDATE \`ERP_finance_obligations\` SET initialFinanceId = ? WHERE id = ?`,
              [newId, newOb],
            );
          }
        }
      }
    }
  }

  // ---------- Orders 2075-2084 ----------
  {
    const table = "ERP_orders";
    const rows = (data.Order || []).filter((r) => Number(r.id) >= 2075 && Number(r.id) <= 2084);
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) orderMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = orderMap.get(oldId);
      let shiftId = raw.shiftId;
      if (shiftId != null && shiftMap.has(Number(shiftId))) {
        shiftId = shiftMap.get(Number(shiftId));
      }
      const row = pick(
        {
          ...raw,
          id: newId,
          shiftId,
          date: sqlDate(raw.date) || sqlDate(raw.createdAt),
          paidAt: sqlDate(raw.paidAt),
          deliveredAt: sqlDate(raw.deliveredAt),
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("Order", oldId, newId);
      console.log(`Order ${oldId} → ${newId}`);
    }
  }

  // ---------- OrderItems ----------
  {
    const table = "ERP_order_items";
    const orderIds = new Set([2075, 2076, 2077, 2078, 2079, 2080, 2081, 2082, 2083, 2084]);
    const rows = (data.OrderItem || []).filter((r) => orderIds.has(Number(r.orderId)));
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) itemMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = itemMap.get(oldId);
      const oldOrderId = Number(raw.orderId);
      const newOrderId = orderMap.get(oldOrderId) ?? oldOrderId;
      const row = pick(
        {
          ...raw,
          id: newId,
          orderId: newOrderId,
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("OrderItem", oldId, newId);
    }
    console.log(
      `OrderItem: ${(report.inserted.OrderItem || []).length} insert, ${(report.remapped.OrderItem || []).length} remap`,
    );
  }

  // ---------- Income ----------
  {
    const table = "ERP_finance_incomes";
    const itemIds = new Set([...itemMap.keys()]);
    const rows = (data.Income || []).filter(
      (r) => r.referenceType === "order_item" && itemIds.has(Number(r.referenceId)),
    );
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) incomeMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = incomeMap.get(oldId);
      const ref = itemMap.get(Number(raw.referenceId)) ?? raw.referenceId;
      let concept = raw.concept || "";
      for (const [oldO, newO] of orderMap) {
        if (oldO !== newO) {
          concept = concept.replaceAll(`Ord #${oldO}`, `Ord #${newO}`);
          concept = concept.replaceAll(`pedido #${oldO}`, `pedido #${newO}`);
        }
      }
      const row = pick(
        {
          ...raw,
          id: newId,
          referenceId: ref,
          concept,
          date: sqlDate(raw.date) || sqlDate(raw.createdAt),
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("Income", oldId, newId);
    }
    console.log(
      `Income: ${(report.inserted.Income || []).length} insert, ${(report.remapped.Income || []).length} remap`,
    );
  }

  // ---------- Inventory movements 9029-9098 ----------
  {
    const table = "ERP_inventory_movements";
    const rows = (data.InventoryMovement || []).filter(
      (r) => Number(r.id) >= 9029 && Number(r.id) <= 9098,
    );
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) movMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = movMap.get(oldId);
      let referenceId = raw.referenceId;
      let description = raw.description || "";
      if (raw.referenceType === "order" && referenceId != null) {
        referenceId = orderMap.get(Number(referenceId)) ?? referenceId;
      } else if (raw.referenceType === "order_item" && referenceId != null) {
        referenceId = itemMap.get(Number(referenceId)) ?? referenceId;
      }
      for (const [oldO, newO] of orderMap) {
        if (oldO !== newO) {
          description = description.replaceAll(`pedido #${oldO}`, `pedido #${newO}`);
        }
      }
      const row = pick(
        {
          ...raw,
          id: newId,
          referenceId,
          description,
          date: sqlDate(raw.date) || sqlDate(raw.createdAt),
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("InventoryMovement", oldId, newId);
    }
    console.log(
      `InventoryMovement: ${(report.inserted.InventoryMovement || []).length} insert, ${(report.remapped.InventoryMovement || []).length} remap`,
    );
  }

  // ---------- StoreStock 219, 220 ----------
  {
    const table = "ERP_store_stocks";
    const rows = (data.StoreStock || []).filter((r) => [219, 220].includes(Number(r.id)));
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) stockMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const [exist] = await conn.query(
        `SELECT id FROM \`${table}\` WHERE storeId = ? AND productId = ? LIMIT 1`,
        [raw.storeId, raw.productId],
      );
      if (exist.length) {
        report.skipped.StoreStock = report.skipped.StoreStock || [];
        report.skipped.StoreStock.push(
          `store ${raw.storeId} product ${raw.productId} already id ${exist[0].id}`,
        );
        continue;
      }
      const oldId = Number(raw.id);
      const newId = stockMap.get(oldId);
      const row = pick(
        {
          ...raw,
          id: newId,
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("StoreStock", oldId, newId);
      console.log(`StoreStock ${oldId} → ${newId}`);
    }
  }

  // ---------- Logs 3906-3918 ----------
  {
    const table = "logs";
    const rows = (data.Logs || []).filter((r) => Number(r.id) >= 3906 && Number(r.id) <= 3918);
    const rawByPreferred = new Map(rows.map((r) => [Number(r.id), r]));
    const planned = await planIds(
      conn,
      table,
      rows.map((r) => Number(r.id)),
      rawByPreferred,
    );
    for (const [k, v] of planned) logMap.set(k, v);
    const [cols] = await conn.query(`SHOW COLUMNS FROM \`${table}\``);
    const allowed = new Set(cols.map((c) => c.Field));
    for (const raw of rows) {
      const oldId = Number(raw.id);
      const newId = logMap.get(oldId);
      const row = pick(
        {
          ...raw,
          id: newId,
          date: sqlDate(raw.date) || sqlDate(raw.createdAt),
          createdAt: sqlDate(raw.createdAt),
          updatedAt: sqlDate(raw.updatedAt),
        },
        [...allowed],
      );
      if (APPLY && !(await existsId(conn, table, newId))) await insertRow(conn, table, row);
      track("Logs", oldId, newId);
    }
    console.log(
      `Logs: ${(report.inserted.Logs || []).length} insert, ${(report.remapped.Logs || []).length} remap`,
    );
  }

  // Notifications: skip (live ahead)
  report.skipped.Notifications = "live ya tiene 1–1066; no se tocan";

  if (APPLY) {
    await setAutoInc(conn, "ERP_cash_shifts", await maxId(conn, "ERP_cash_shifts"));
    await setAutoInc(conn, "ERP_orders", await maxId(conn, "ERP_orders"));
    await setAutoInc(conn, "ERP_order_items", await maxId(conn, "ERP_order_items"));
    await setAutoInc(conn, "ERP_inventory_movements", await maxId(conn, "ERP_inventory_movements"));
    await setAutoInc(conn, "ERP_finance_incomes", await maxId(conn, "ERP_finance_incomes"));
    await setAutoInc(conn, "ERP_finance_expenses", await maxId(conn, "ERP_finance_expenses"));
    await setAutoInc(conn, "ERP_finance_obligations", await maxId(conn, "ERP_finance_obligations"));
    await setAutoInc(conn, "ERP_store_stocks", await maxId(conn, "ERP_store_stocks"));
    await setAutoInc(conn, "logs", await maxId(conn, "logs"));
  }

  console.log("\n=== RESUMEN ===");
  console.log(JSON.stringify(report, null, 2));
  console.log("\nMapas clave:");
  console.log("orderMap", Object.fromEntries(orderMap));
  console.log(
    "itemMap (solo remaps)",
    Object.fromEntries([...itemMap].filter(([a, b]) => a !== b)),
  );

  await conn.end();

  if (!APPLY) {
    console.log("\nDry-run OK. Para aplicar: node scripts/merge-servidor-backup-into-live.mjs --apply");
  } else {
    console.log("\n✅ Merge aplicado en BD local.");
  }
}

main().catch((err) => {
  console.error("❌", err?.message || err);
  process.exit(1);
});
