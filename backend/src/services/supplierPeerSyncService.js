import crypto from "crypto";
import { Op } from "sequelize";
import { sequelize } from "../database/connection.js";
import {
  Customer,
  Order,
  OrderItem,
  Supplier,
  SupplierOrder,
  SupplierOrderItem,
  SupplierProductCode,
} from "../models/Orders.js";
import { InventoryProduct } from "../models/Inventory.js";
import { Account } from "../models/Account.js";
import { SupplierAccount } from "../models/SupplierAccount.js";
import {
  LOCAL_APP_KEY,
  PEER_SYNC_SECRET,
  getPeerApp,
  peerAppLabel,
} from "../config/peerAppsConfig.js";
import {
  createAndPushNotification,
  resolveAdminUserIds,
} from "./notificationService.js";
import { sendPeerOrderUpdated } from "../sockets/notificationSocket.js";

const APP_KEY = LOCAL_APP_KEY;

export function newPeerSyncSecret() {
  return PEER_SYNC_SECRET;
}

export async function serializeSupplierWithLinks(supplier) {
  const plain = supplier?.toJSON ? supplier.toJSON() : { ...supplier };
  try {
    const links = await SupplierAccount.findAll({
      where: { supplierId: plain.id },
      attributes: ["accountId"],
      raw: true,
    });
    const accountIds = links
      .map((l) => Number(l.accountId))
      .filter((id) => Number.isFinite(id) && id > 0);
    let accounts = [];
    if (accountIds.length) {
      accounts = await Account.findAll({
        where: { id: { [Op.in]: accountIds } },
        attributes: ["id", "username"],
      });
    }
    return {
      ...plain,
      linkedAccounts: accounts.map((a) => ({ id: a.id, username: a.username })),
    };
  } catch (error) {
    console.warn("serializeSupplierWithLinks:", error?.message || error);
    return { ...plain, linkedAccounts: [] };
  }
}

/** Proveedor local que representa a la app remota (se crea solo si no existe). */
async function resolveOrCreatePeerSupplier(sourceApp) {
  const key = String(sourceApp || "")
    .trim()
    .toLowerCase();
  if (!key) return null;

  const existing = await Supplier.findOne({ where: { remoteApp: key } });
  if (existing) return existing;

  const label = peerAppLabel(key);
  const created = await Supplier.create({
    name: label || key,
    company: label || key,
    notes: `Sistema enlazado automáticamente (${key})`,
    isActive: true,
    remoteApp: key,
  });
  return created;
}

/** Cliente local que representa a la app remota (se crea solo si no existe). */
async function resolveOrCreatePeerCustomer(sourceApp) {
  const key = String(sourceApp || "")
    .trim()
    .toLowerCase();
  if (!key) return null;

  const existing = await Customer.findOne({ where: { remoteApp: key } });
  if (existing) return existing;

  const label = peerAppLabel(key) || key;
  return Customer.create({
    name: label,
    firstName: label,
    isActive: true,
    remoteApp: key,
    identType: "07",
  });
}

async function notifyPeerCustomerOrderReceived(
  order,
  customer,
  sourceApp,
  unmappedCount,
  { updated = false } = {},
) {
  try {
    const userIds = await resolveAdminUserIds();
    const appLabel = peerAppLabel(sourceApp) || sourceApp || "sistema enlazado";
    const title = updated
      ? "Edición de pedido cliente del sistema enlazado"
      : "Pedido cliente entrante del sistema enlazado";
    const message = updated
      ? unmappedCount > 0
        ? `${appLabel} actualizó la venta #${order.id} (${customer?.name || "cliente"}). Hay ${unmappedCount} producto(s) por enlazar — aceptá los cambios.`
        : `${appLabel} actualizó la venta #${order.id}. Revisá y aceptá los cambios.`
      : unmappedCount > 0
        ? `${appLabel} envió un pedido a proveedor que llegó como venta #${order.id} (${customer?.name || "cliente"}). Hay ${unmappedCount} producto(s) por enlazar.`
        : `${appLabel} envió un pedido a proveedor que llegó como venta #${order.id}. Revisá y aceptá.`;
    const link = `/ventas/pedidos?peerAcceptCustomerOrderId=${order.id}`;
    const sourceKey = `peer_customer_order:${order.id}:${updated ? "rev" : "new"}:${Date.now()}`;
    for (const userId of userIds) {
      await createAndPushNotification({
        userId,
        type: "alert",
        title,
        message,
        link,
        sourceKey,
        force: true,
      });
      sendPeerOrderUpdated(userId, {
        kind: "customer",
        orderId: order.id,
        updated,
        link,
      });
    }
  } catch (error) {
    console.warn("notifyPeerCustomerOrderReceived:", error?.message || error);
  }
}

export async function ensurePeerSyncSchema() {
  const alters = [
    ["ERP_customers", "remoteApp", "VARCHAR(32) NULL"],
    ["ERP_customers", "remoteSupplierId", "INT NULL"],
    ["ERP_customers", "remoteBaseUrl", "VARCHAR(255) NULL"],
    ["ERP_customers", "remoteSyncSecret", "VARCHAR(255) NULL"],
    ["ERP_suppliers", "remoteApp", "VARCHAR(32) NULL"],
    ["ERP_suppliers", "remoteSupplierId", "INT NULL"],
    ["ERP_suppliers", "remoteBaseUrl", "VARCHAR(255) NULL"],
    ["ERP_suppliers", "remoteSyncSecret", "VARCHAR(255) NULL"],
    ["ERP_orders", "remoteSyncApp", "VARCHAR(32) NULL"],
    ["ERP_orders", "remoteSyncSupplierOrderId", "INT NULL"],
    ["ERP_orders", "remoteSyncedAt", "DATETIME NULL"],
    ["ERP_orders", "remoteSyncStatus", "VARCHAR(40) NULL"],
    ["ERP_orders", "remoteSyncError", "TEXT NULL"],
    ["ERP_orders", "remoteSyncPayloadHash", "VARCHAR(64) NULL"],
    ["ERP_orders", "remotePeerAcceptStatus", "VARCHAR(40) NULL"],
    ["ERP_orders", "peerAcceptStatus", "VARCHAR(40) NULL"],
    ["ERP_orders", "peerSourceApp", "VARCHAR(32) NULL"],
    ["ERP_orders", "peerSourceOrderId", "INT NULL"],
    ["ERP_orders", "peerAcceptedSnapshot", "LONGTEXT NULL"],
    ["ERP_orders", "peerRevisionBaseline", "LONGTEXT NULL"],
    ["ERP_order_items", "remoteName", "VARCHAR(180) NULL"],
    ["ERP_order_items", "remoteBarcode", "VARCHAR(80) NULL"],
    ["ERP_order_items", "remoteSku", "VARCHAR(80) NULL"],
    ["ERP_order_items", "remoteCode", "VARCHAR(100) NULL"],
    ["ERP_supplier_orders", "peerAcceptStatus", "VARCHAR(40) NULL"],
    ["ERP_supplier_orders", "peerSourceApp", "VARCHAR(32) NULL"],
    ["ERP_supplier_orders", "peerSourceOrderId", "INT NULL"],
    ["ERP_supplier_orders", "peerAcceptedSnapshot", "LONGTEXT NULL"],
    ["ERP_supplier_orders", "peerRevisionBaseline", "LONGTEXT NULL"],
    ["ERP_supplier_orders", "remoteSyncApp", "VARCHAR(32) NULL"],
    ["ERP_supplier_orders", "remoteSyncCustomerOrderId", "INT NULL"],
    ["ERP_supplier_orders", "remoteSyncedAt", "DATETIME NULL"],
    ["ERP_supplier_orders", "remoteSyncStatus", "VARCHAR(40) NULL"],
    ["ERP_supplier_orders", "remoteSyncError", "TEXT NULL"],
    ["ERP_supplier_orders", "remoteSyncPayloadHash", "VARCHAR(64) NULL"],
    ["ERP_supplier_orders", "remotePeerAcceptStatus", "VARCHAR(40) NULL"],
    ["ERP_supplier_order_items", "remoteName", "VARCHAR(180) NULL"],
    ["ERP_supplier_order_items", "remoteBarcode", "VARCHAR(80) NULL"],
    ["ERP_supplier_order_items", "remoteSku", "VARCHAR(80) NULL"],
    ["ERP_supplier_order_items", "remoteCode", "VARCHAR(100) NULL"],
  ];
  for (const [table, column, ddl] of alters) {
    try {
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table AND COLUMN_NAME = :column`,
        { replacements: { table, column } },
      );
      if (Number(rows?.[0]?.c || 0) > 0) continue;
      await sequelize.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
    } catch (error) {
      console.warn(`ensurePeerSyncSchema ${table}.${column}:`, error?.message || error);
    }
  }

  // productId nullable en ítems proveedor y cliente (peer sin mapear)
  for (const table of ["ERP_supplier_order_items", "ERP_order_items"]) {
    try {
      const [cols] = await sequelize.query(
        `SELECT IS_NULLABLE AS n FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND COLUMN_NAME = 'productId'`,
        { replacements: { table } },
      );
      if (String(cols?.[0]?.n || "").toUpperCase() === "NO") {
        const [fks] = await sequelize.query(
          `SELECT CONSTRAINT_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = :table
             AND COLUMN_NAME = 'productId'
             AND REFERENCED_TABLE_NAME IS NOT NULL`,
          { replacements: { table } },
        );
        for (const fk of fks || []) {
          if (!fk?.name) continue;
          await sequelize.query(
            `ALTER TABLE \`${table}\` DROP FOREIGN KEY \`${fk.name}\``,
          );
        }
        await sequelize.query(
          `ALTER TABLE \`${table}\` MODIFY COLUMN \`productId\` INT NULL`,
        );
        const fkName = `${table}_productId_fk`.slice(0, 64);
        await sequelize.query(
          `ALTER TABLE \`${table}\`
           ADD CONSTRAINT \`${fkName}\`
           FOREIGN KEY (\`productId\`) REFERENCES \`ERP_inventory_products\` (\`id\`)
           ON DELETE SET NULL ON UPDATE CASCADE`,
        );
      }
    } catch (error) {
      console.warn(`ensurePeerSyncSchema ${table} productId nullable:`, error?.message || error);
    }
  }

  // Evita duplicados en envíos concurrentes (peerSourceApp + peerSourceOrderId).
  for (const [table, idxName] of [
    ["ERP_supplier_orders", "uq_peer_source_supplier_order"],
    ["ERP_orders", "uq_peer_source_customer_order"],
  ]) {
    try {
      const [rows] = await sequelize.query(
        `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = :table
           AND INDEX_NAME = :idx`,
        { replacements: { table, idx: idxName } },
      );
      if (Number(rows?.[0]?.c || 0) > 0) continue;
      await sequelize.query(
        `ALTER TABLE \`${table}\`
         ADD UNIQUE INDEX \`${idxName}\` (\`peerSourceApp\`, \`peerSourceOrderId\`)`,
      );
    } catch (error) {
      console.warn(`ensurePeerSyncSchema ${table} unique peer source:`, error?.message || error);
    }
  }
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function billableQty(item) {
  const qty = Number(item.quantity || 0);
  return Math.max(0, qty - Number(item.damagedQty || 0) - Number(item.giftQty || 0));
}

function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+/g, " ");
}

/** Códigos estables para enlazar producto remoto ↔ local (próximos envíos). */
export function peerLinkCodesForRow(row = {}) {
  const codes = [];
  const barcode = String(row.barcode || row.remoteBarcode || "")
    .replace(/\D/g, "")
    .trim();
  const sku = String(row.sku || row.remoteSku || "").trim();
  const name = normalizeName(row.name || row.remoteName || "");
  const peerId = row.productId || row.remotePeerProductId || null;
  const remoteCode = String(row.remoteCode || "").trim();

  if (barcode) codes.push(`bc:${barcode}`);
  if (sku) codes.push(`sku:${sku}`);
  if (name) codes.push(`name:${name.toLowerCase()}`);
  if (peerId) codes.push(`peer-id:${peerId}`);
  if (remoteCode) codes.push(remoteCode);
  return [...new Set(codes.filter(Boolean))];
}


function itemSnapKey(row = {}) {
  const code = String(row.remoteCode || "").trim();
  if (code) return code.toLowerCase();
  const bc = String(row.remoteBarcode || row.barcode || "").replace(/\D/g, "").trim();
  if (bc) return `bc:${bc}`;
  const sku = String(row.remoteSku || row.sku || "").trim();
  if (sku) return `sku:${sku.toLowerCase()}`;
  const name = normalizeName(row.remoteName || row.name || "").toLowerCase();
  return name ? `name:${name}` : `row:${row.id || "?"}`;
}

function parsePeerSnapshot(raw) {
  if (!raw) return null;
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function snapshotSupplierItems(items = []) {
  return (items || []).map((it) => ({
    key: itemSnapKey(it),
    remoteName: it.remoteName || it.ERP_inventory_product?.name || null,
    remoteBarcode: it.remoteBarcode || null,
    remoteSku: it.remoteSku || null,
    remoteCode: it.remoteCode || null,
    quantity: Number(it.quantity || 0),
    unitPrice: Number(it.unitPrice || 0),
    productId: it.productId || null,
  }));
}

function snapshotCustomerItems(items = []) {
  return (items || []).map((it) => ({
    key: itemSnapKey(it),
    remoteName: it.remoteName || it.ERP_inventory_product?.name || null,
    remoteBarcode: it.remoteBarcode || null,
    remoteSku: it.remoteSku || null,
    remoteCode: it.remoteCode || null,
    quantity: Number(it.quantity || 0),
    unitPrice: Number(it.price || it.unitPrice || 0),
    productId: it.productId || null,
  }));
}

function computePeerChanges(before, after) {
  const bMap = new Map((before || []).map((x) => [itemSnapKey(x), x]));
  const aMap = new Map((after || []).map((x) => [itemSnapKey(x), x]));
  const changes = [];
  for (const [k, a] of aMap.entries()) {
    const b = bMap.get(k);
    if (!b) {
      changes.push({
        type: "added",
        key: k,
        remoteName: a.remoteName,
        quantity: a.quantity,
        unitPrice: a.unitPrice,
        beforeQuantity: null,
        beforeUnitPrice: null,
      });
    } else if (
      Number(b.quantity) !== Number(a.quantity) ||
      Number(b.unitPrice) !== Number(a.unitPrice)
    ) {
      changes.push({
        type: "modified",
        key: k,
        remoteName: a.remoteName || b.remoteName,
        quantity: a.quantity,
        unitPrice: a.unitPrice,
        beforeQuantity: b.quantity,
        beforeUnitPrice: b.unitPrice,
      });
    }
  }
  for (const [k, b] of bMap.entries()) {
    if (!aMap.has(k)) {
      changes.push({
        type: "removed",
        key: k,
        remoteName: b.remoteName,
        quantity: 0,
        unitPrice: b.unitPrice,
        beforeQuantity: b.quantity,
        beforeUnitPrice: b.unitPrice,
      });
    }
  }
  return changes;
}


function hashPeerPayloadItems(items = []) {
  const norm = (items || [])
    .map((it) => ({
      productId: Number(it.productId) || null,
      name: normalizeName(it.name || "").toLowerCase(),
      barcode: String(it.barcode || "").replace(/\D/g, ""),
      sku: String(it.sku || "").trim().toLowerCase(),
      quantity: Number(it.quantity || 0),
      price: Number(Number(it.price || 0).toFixed(6)),
      taxRate: Number(Number(it.taxRate || 0).toFixed(2)),
    }))
    .sort((a, b) => {
      const ka = `${a.productId || ""}|${a.barcode}|${a.sku}|${a.name}`;
      const kb = `${b.productId || ""}|${b.barcode}|${b.sku}|${b.name}`;
      return ka.localeCompare(kb);
    });
  return crypto.createHash("sha256").update(JSON.stringify(norm)).digest("hex");
}

function peerAcceptLabel(status) {
  const s = String(status || "").trim();
  if (s === "accepted") return "aceptado";
  if (s === "pending_accept") return "recibido, pendiente de aceptación";
  if (s === "not_found") return "no recibido / no aceptado";
  if (s === "error") return "no se pudo consultar el estado remoto";
  return s || "desconocido";
}

async function fetchRemotePeerOrderStatus({
  baseUrl,
  secret,
  kind,
  sourceApp,
  sourceOrderId,
}) {
  const qs = new URLSearchParams({
    kind: String(kind || ""),
    sourceApp: String(sourceApp || ""),
    sourceOrderId: String(sourceOrderId || ""),
    secret: String(secret || ""),
  });
  try {
    const res = await fetch(`${baseUrl}/orders/peer-sync/status?${qs}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return {
        found: false,
        peerAcceptStatus: "error",
        remoteOrderId: null,
        message: body?.message || `HTTP ${res.status}`,
      };
    }
    return body;
  } catch (error) {
    return {
      found: false,
      peerAcceptStatus: "error",
      remoteOrderId: null,
      message: String(error?.message || error),
    };
  }
}

async function notifyOriginPeerAcceptStatus({
  sourceApp,
  sourceOrderId,
  originKind,
  peerAcceptStatus,
  remoteOrderId,
}) {
  const peer = getPeerApp(sourceApp);
  const oid = Number(sourceOrderId);
  if (!peer || !Number.isFinite(oid) || oid <= 0) return;
  const baseUrl = normalizeBaseUrl(peer.baseUrl);
  try {
    await fetch(`${baseUrl}/orders/peer-sync/accept-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${PEER_SYNC_SECRET}`,
      },
      body: JSON.stringify({
        secret: PEER_SYNC_SECRET,
        originKind,
        sourceOrderId: oid,
        peerAcceptStatus,
        remoteOrderId: Number(remoteOrderId) || null,
        fromApp: APP_KEY,
      }),
    });
  } catch (error) {
    console.warn("notifyOriginPeerAcceptStatus:", error?.message || error);
  }
}

async function resolveIncomingPeerRows(rows, linkSupplierId, transaction) {
  const out = [];
  let unmappedCount = 0;
  for (const row of rows || []) {
    const qty = Number(row.quantity || 0);
    if (qty <= 0) continue;
    let product =
      (linkSupplierId
        ? await findProductViaSupplierCodes(linkSupplierId, row, transaction)
        : null) || (await findLocalProduct(row, transaction));
    const remoteName = normalizeName(row.name).slice(0, 180) || null;
    const remoteBarcode =
      String(row.barcode || "")
        .replace(/\D/g, "")
        .trim()
        .slice(0, 80) || null;
    const remoteSku = String(row.sku || "").trim().slice(0, 80) || null;
    const remoteCode =
      peerLinkCodesForRow(row)[0]?.slice(0, 100) ||
      (row.productId ? `peer-id:${row.productId}` : null);
    if (!product) unmappedCount += 1;
    out.push({
      productId: product?.id || null,
      quantity: qty,
      unitPrice: Number(row.price || product?.supplierPrice || product?.price || 0),
      price: Number(row.price || product?.price || 0),
      taxRate: Number(row.taxRate || 0),
      remoteName,
      remoteBarcode,
      remoteSku,
      remoteCode,
    });
  }
  return { rows: out, unmappedCount };
}

async function findLocalProduct({ barcode, sku, name }, transaction) {
  if (barcode) {
    const byBarcode = await InventoryProduct.findOne({
      where: { barcode: String(barcode).trim() },
      transaction,
    });
    if (byBarcode) return byBarcode;
  }
  if (sku) {
    const bySku = await InventoryProduct.findOne({
      where: { sku: String(sku).trim() },
      transaction,
    });
    if (bySku) return bySku;
  }
  const cleanName = normalizeName(name);
  if (cleanName) {
    const byName = await InventoryProduct.findOne({
      where: { name: cleanName },
      transaction,
    });
    if (byName) return byName;
    const [rows] = await sequelize.query(
      `SELECT id FROM ERP_inventory_products
       WHERE LOWER(TRIM(REGEXP_REPLACE(name, '[[:space:]]+', ' '))) = LOWER(:name)
       LIMIT 1`,
      { replacements: { name: cleanName }, transaction },
    );
    if (rows?.[0]?.id) {
      return InventoryProduct.findByPk(rows[0].id, { transaction });
    }
  }
  return null;
}

async function findProductViaSupplierCodes(supplierId, row, transaction) {
  const codes = peerLinkCodesForRow(row);
  if (!codes.length) return null;
  const links = await SupplierProductCode.findAll({
    where: { supplierId, supplierCode: { [Op.in]: codes } },
    transaction,
  });
  for (const link of links) {
    const product = await InventoryProduct.findByPk(link.productId, { transaction });
    if (product) return product;
  }
  return null;
}

async function upsertPeerProductLinks(supplierId, productId, row, transaction) {
  const codes = peerLinkCodesForRow(row);
  for (const supplierCode of codes) {
    const existing = await SupplierProductCode.findOne({
      where: { supplierId, supplierCode },
      transaction,
    });
    if (existing) {
      if (Number(existing.productId) !== Number(productId)) {
        await existing.update({ productId }, { transaction });
      }
    } else {
      await SupplierProductCode.create(
        {
          supplierId,
          productId,
          supplierCode,
          notes: "Enlace automático entre apps",
        },
        { transaction },
      );
    }
  }
}

async function notifyPeerOrderReceived(order, supplier, sourceApp, unmappedCount, { updated = false } = {}) {
  try {
    const userIds = await resolveAdminUserIds();
    const appLabel = peerAppLabel(sourceApp) || sourceApp || "sistema enlazado";
    const title = updated
      ? "Edición de pedido del sistema enlazado"
      : "Pedido entrante del sistema enlazado";
    const message = updated
      ? unmappedCount > 0
        ? `${appLabel} actualizó el pedido #${order.id} (${supplier?.name || "proveedor"}). Hay ${unmappedCount} producto(s) por enlazar — aceptá los cambios.`
        : `${appLabel} actualizó el pedido #${order.id} (${supplier?.name || "proveedor"}). Revisá y aceptá los cambios.`
      : unmappedCount > 0
        ? `${appLabel} envió el pedido #${order.id} (${supplier?.name || "proveedor"}). Hay ${unmappedCount} producto(s) por enlazar — aceptalo y mapeá los ítems.`
        : `${appLabel} envió el pedido #${order.id} (${supplier?.name || "proveedor"}). Revisá y aceptá el pedido.`;
    const link = `/ventas/compras?peerAcceptOrderId=${order.id}`;
    const sourceKey = `peer_order:${order.id}:${updated ? "rev" : "new"}:${Date.now()}`;
    for (const userId of userIds) {
      await createAndPushNotification({
        userId,
        type: "alert",
        title,
        message,
        link,
        sourceKey,
        force: true,
      });
      sendPeerOrderUpdated(userId, {
        kind: "supplier",
        orderId: order.id,
        updated,
        link,
      });
    }
  } catch (error) {
    console.warn("notifyPeerOrderReceived:", error?.message || error);
  }
}

/**
 * Recibe un pedido cliente remoto y lo crea/actualiza como pedido a proveedor local.
 * Si ya existe el mismo peerSourceOrderId, actualiza el mismo pedido (edición).
 */
export async function receivePeerSupplierOrder({
  secret,
  supplierId,
  sourceApp,
  sourceOrderId,
  date,
  notes,
  items = [],
}) {
  await ensurePeerSyncSchema();
  if (String(secret || "").trim() !== PEER_SYNC_SECRET) {
    const err = new Error("Secreto de enlace inválido");
    err.status = 401;
    throw err;
  }

  let supplier = null;
  const sid = Number(supplierId);
  if (Number.isFinite(sid) && sid > 0) {
    supplier = await Supplier.findByPk(sid);
  }
  if (!supplier) {
    supplier = await resolveOrCreatePeerSupplier(sourceApp || APP_KEY);
  }
  if (!supplier) {
    const err = new Error("Proveedor destino no encontrado");
    err.status = 404;
    throw err;
  }

  if (!Array.isArray(items) || !items.length) {
    const err = new Error("El pedido remoto no tiene ítems");
    err.status = 400;
    throw err;
  }

  const srcApp = String(sourceApp || "app").trim().toLowerCase();
  const srcId = Number(sourceOrderId);
  const marker = `[peer:${srcApp}:${srcId}]`;

  const invoiceMarker = `PEER-${srcApp.toUpperCase()}-${srcId}`.slice(0, 80);
  const itemInclude = [{ model: SupplierOrderItem, as: "ERP_supplier_order_items" }];

  const result = await sequelize.transaction(async (t) => {
    const { rows: resolved, unmappedCount } = await resolveIncomingPeerRows(
      items,
      supplier.id,
      t,
    );
    if (!resolved.length) {
      const err = new Error("Ningún ítem válido en el pedido remoto");
      err.status = 400;
      throw err;
    }

    let existing = await SupplierOrder.findOne({
      where: {
        supplierId: supplier.id,
        peerSourceApp: srcApp,
        peerSourceOrderId: srcId,
      },
      include: itemInclude,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!existing) {
      existing = await SupplierOrder.findOne({
        where: {
          supplierId: supplier.id,
          notes: { [Op.like]: `%${marker}%` },
        },
        include: itemInclude,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
    }
    if (!existing) {
      existing = await SupplierOrder.findOne({
        where: {
          supplierId: supplier.id,
          invoiceNumber: invoiceMarker,
        },
        include: itemInclude,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
    }

    if (existing) {
      if (existing.receivedAt || existing.paidAt) {
        const err = new Error(
          `El pedido #${existing.id} ya fue recibido o pagado en el destino; no se puede actualizar por enlace`,
        );
        err.status = 409;
        throw err;
      }
      const baseline =
        parsePeerSnapshot(existing.peerAcceptedSnapshot) ||
        snapshotSupplierItems(existing.ERP_supplier_order_items || []);
      await SupplierOrderItem.destroy({ where: { orderId: existing.id }, transaction: t });
      for (const row of resolved) {
        await SupplierOrderItem.create(
          {
            orderId: existing.id,
            productId: row.productId,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            taxRate: row.taxRate,
            remoteName: row.remoteName,
            remoteBarcode: row.remoteBarcode,
            remoteSku: row.remoteSku,
            remoteCode: row.remoteCode,
          },
          { transaction: t },
        );
      }
      const noteBase = String(notes || existing.notes || "")
        .replace(/\s*·\s*Pendiente de aceptación \/ enlace de productos/g, "")
        .split(marker)
        .join("")
        .replace(/\s*·\s*·/g, " · ")
        .replace(/^\s*·\s*|\s*·\s*$/g, "")
        .trim();
      const nextNotes = [noteBase, marker, "Pendiente de aceptación / enlace de productos"]
        .filter(Boolean)
        .join(" · ");
      // update por id: fuerza pending_accept aunque el pedido ya estuviera accepted
      await SupplierOrder.update(
        {
          date: date ? new Date(date) : existing.date,
          notes: nextNotes,
          peerAcceptStatus: "pending_accept",
          peerSourceApp: srcApp,
          peerSourceOrderId: srcId,
          peerRevisionBaseline: JSON.stringify(baseline),
          status: existing.receivedAt ? existing.status : "pendiente",
        },
        { where: { id: existing.id }, transaction: t },
      );
      return {
        orderId: existing.id,
        unmappedCount,
        updated: true,
        changes: computePeerChanges(baseline, resolved),
      };
    }

    const noteParts = [
      String(notes || "").trim(),
      marker,
      "Pendiente de aceptación / enlace de productos",
    ].filter(Boolean);
    try {
      const order = await SupplierOrder.create(
        {
          supplierId: supplier.id,
          date: date ? new Date(date) : new Date(),
          notes: noteParts.join(" · "),
          status: "pendiente",
          invoiceNumber: `PEER-${srcApp.toUpperCase()}-${srcId}`.slice(0, 80),
          peerAcceptStatus: "pending_accept",
          peerSourceApp: srcApp,
          peerSourceOrderId: srcId,
          peerRevisionBaseline: null,
          peerAcceptedSnapshot: null,
        },
        { transaction: t },
      );
      for (const row of resolved) {
        await SupplierOrderItem.create(
          {
            orderId: order.id,
            productId: row.productId,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            taxRate: row.taxRate,
            remoteName: row.remoteName,
            remoteBarcode: row.remoteBarcode,
            remoteSku: row.remoteSku,
            remoteCode: row.remoteCode,
          },
          { transaction: t },
        );
      }
      return { orderId: order.id, unmappedCount, updated: false, changes: [] };
    } catch (createErr) {
      const isDup =
        createErr?.name === "SequelizeUniqueConstraintError" ||
        createErr?.parent?.code === "ER_DUP_ENTRY" ||
        /Duplicate|unique/i.test(String(createErr?.message || ""));
      if (!isDup) throw createErr;
      const raced = await SupplierOrder.findOne({
        where: { peerSourceApp: srcApp, peerSourceOrderId: srcId },
        include: itemInclude,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!raced) throw createErr;
      if (raced.receivedAt || raced.paidAt) {
        const err = new Error(
          `El pedido #${raced.id} ya fue recibido o pagado en el destino; no se puede actualizar por enlace`,
        );
        err.status = 409;
        throw err;
      }
      const baseline =
        parsePeerSnapshot(raced.peerAcceptedSnapshot) ||
        snapshotSupplierItems(raced.ERP_supplier_order_items || []);
      await SupplierOrderItem.destroy({ where: { orderId: raced.id }, transaction: t });
      for (const row of resolved) {
        await SupplierOrderItem.create(
          {
            orderId: raced.id,
            productId: row.productId,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
            taxRate: row.taxRate,
            remoteName: row.remoteName,
            remoteBarcode: row.remoteBarcode,
            remoteSku: row.remoteSku,
            remoteCode: row.remoteCode,
          },
          { transaction: t },
        );
      }
      const noteBase = String(notes || raced.notes || "")
        .replace(/\s*·\s*Pendiente de aceptación \/ enlace de productos/g, "")
        .split(marker)
        .join("")
        .replace(/\s*·\s*·/g, " · ")
        .replace(/^\s*·\s*|\s*·\s*$/g, "")
        .trim();
      const nextNotes = [noteBase, marker, "Pendiente de aceptación / enlace de productos"]
        .filter(Boolean)
        .join(" · ");
      await SupplierOrder.update(
        {
          date: date ? new Date(date) : raced.date,
          notes: nextNotes,
          peerAcceptStatus: "pending_accept",
          peerSourceApp: srcApp,
          peerSourceOrderId: srcId,
          peerRevisionBaseline: JSON.stringify(baseline),
          status: raced.receivedAt ? raced.status : "pendiente",
        },
        { where: { id: raced.id }, transaction: t },
      );
      return {
        orderId: raced.id,
        unmappedCount,
        updated: true,
        changes: computePeerChanges(baseline, resolved),
      };
    }
  });

  const order = await SupplierOrder.findByPk(result.orderId);
  await notifyPeerOrderReceived(order, supplier, sourceApp, result.unmappedCount, {
    updated: result.updated,
  });

  return {
    reused: false,
    updated: result.updated,
    supplierOrderId: result.orderId,
    peerAcceptStatus: "pending_accept",
    unmappedCount: result.unmappedCount,
    changes: result.changes,
    message: result.updated
      ? `Pedido actualizado. Revisá y aceptá los cambios.${
          result.unmappedCount ? ` ${result.unmappedCount} sin enlazar.` : ""
        }`
      : result.unmappedCount > 0
        ? `Pedido recibido. ${result.unmappedCount} producto(s) pendientes de enlace.`
        : "Pedido recibido. Pendiente de aceptación.",
  };
}

/**
 * Acepta un pedido peer: enlaza ítems a productos locales y guarda códigos
 * para la próxima sincronización.
 * body.mappings = [{ itemId, productId }]
 */
export async function acceptPeerSupplierOrder(orderId, mappings = []) {
  await ensurePeerSyncSchema();
  const id = Number(orderId);
  const order = await SupplierOrder.findByPk(id, {
    include: [
      {
        model: SupplierOrderItem,
        as: "ERP_supplier_order_items",
      },
      { model: Supplier, as: "ERP_supplier" },
    ],
  });
  if (!order) {
    const err = new Error("Pedido a proveedor no encontrado");
    err.status = 404;
    throw err;
  }
  if (order.peerAcceptStatus && order.peerAcceptStatus !== "pending_accept") {
    const err = new Error("Este pedido ya fue aceptado");
    err.status = 400;
    throw err;
  }

  const items = order.ERP_supplier_order_items || [];
  const mapByItem = new Map(
    (Array.isArray(mappings) ? mappings : []).map((m) => [
      Number(m.itemId),
      Number(m.productId),
    ]),
  );

  await sequelize.transaction(async (t) => {
    for (const item of items) {
      const fromMap = mapByItem.has(Number(item.id))
        ? mapByItem.get(Number(item.id))
        : null;
      const productId = Number(fromMap) || Number(item.productId) || null;
      if (!productId) {
        const err = new Error(
          `Falta enlazar el producto: ${item.remoteName || `ítem #${item.id}`}`,
        );
        err.status = 400;
        throw err;
      }

      const product = await InventoryProduct.findByPk(productId, { transaction: t });
      if (!product) {
        const err = new Error(`Producto local #${productId} no encontrado`);
        err.status = 404;
        throw err;
      }

      await item.update({ productId: product.id }, { transaction: t });
      await upsertPeerProductLinks(
        order.supplierId,
        product.id,
        {
          name: item.remoteName,
          barcode: item.remoteBarcode,
          sku: item.remoteSku,
          remoteCode: item.remoteCode,
        },
        t,
      );
    }

    const notes = String(order.notes || "")
      .replace(/\s*·\s*Pendiente de aceptación \/ enlace de productos/g, "")
      .trim();
    const acceptedSnap = (items || []).map((it) => ({
      key: itemSnapKey(it),
      remoteName: it.remoteName,
      remoteBarcode: it.remoteBarcode,
      remoteSku: it.remoteSku,
      remoteCode: it.remoteCode,
      quantity: Number(it.quantity || 0),
      unitPrice: Number(it.unitPrice || 0),
      productId: Number(it.productId) || null,
    }));
    await order.update(
      {
        peerAcceptStatus: "accepted",
        notes: notes || order.notes,
        peerAcceptedSnapshot: JSON.stringify(acceptedSnap),
        peerRevisionBaseline: null,
      },
      { transaction: t },
    );
  });

  await notifyOriginPeerAcceptStatus({
    sourceApp: order.peerSourceApp,
    sourceOrderId: order.peerSourceOrderId,
    originKind: "client_order",
    peerAcceptStatus: "accepted",
    remoteOrderId: order.id,
  });

  return {
    supplierOrderId: order.id,
    peerAcceptStatus: "accepted",
    message: "Pedido aceptado y productos enlazados",
  };
}

/** Detalle para el modal de aceptación. */
export async function getPeerAcceptOrderDetail(orderId) {
  await ensurePeerSyncSchema();
  const order = await SupplierOrder.findByPk(Number(orderId), {
    include: [
      { model: Supplier, as: "ERP_supplier" },
      {
        model: SupplierOrderItem,
        as: "ERP_supplier_order_items",
        include: [
          {
            model: InventoryProduct,
            as: "ERP_inventory_product",
            attributes: ["id", "name", "barcode", "sku"],
            required: false,
          },
        ],
      },
    ],
  });
  if (!order) {
    const err = new Error("Pedido no encontrado");
    err.status = 404;
    throw err;
  }
  const items = (order.ERP_supplier_order_items || []).map((it) => ({
    id: it.id,
    productId: it.productId || null,
    productName: it.ERP_inventory_product?.name || null,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice || 0),
    remoteName: it.remoteName || it.ERP_inventory_product?.name || null,
    remoteBarcode: it.remoteBarcode || null,
    remoteSku: it.remoteSku || null,
    remoteCode: it.remoteCode || null,
    needsLink: !it.productId,
  }));
  const after = snapshotSupplierItems(order.ERP_supplier_order_items || []);
  const before =
    parsePeerSnapshot(order.peerRevisionBaseline) ||
    parsePeerSnapshot(order.peerAcceptedSnapshot) ||
    [];
  const isRevision = Boolean(
    order.peerRevisionBaseline ||
      (order.peerAcceptStatus === "pending_accept" &&
        parsePeerSnapshot(order.peerAcceptedSnapshot)),
  );
  return {
    id: order.id,
    kind: "supplier",
    supplierId: order.supplierId,
    supplierName: order.ERP_supplier?.name || null,
    date: order.date,
    notes: order.notes,
    invoiceNumber: order.invoiceNumber,
    peerAcceptStatus: order.peerAcceptStatus || null,
    status: order.status,
    isRevision,
    changes: isRevision ? computePeerChanges(before, after) : [],
    items,
  };
}


export async function getPeerOrderStatusBySource({
  secret,
  kind,
  sourceApp,
  sourceOrderId,
}) {
  await ensurePeerSyncSchema();
  if (String(secret || "").trim() !== PEER_SYNC_SECRET) {
    const err = new Error("Secreto de enlace inválido");
    err.status = 401;
    throw err;
  }
  const srcApp = String(sourceApp || "").trim().toLowerCase();
  const srcId = Number(sourceOrderId);
  if (!srcApp || !Number.isFinite(srcId) || srcId <= 0) {
    const err = new Error("sourceApp y sourceOrderId son requeridos");
    err.status = 400;
    throw err;
  }
  const k = String(kind || "").trim().toLowerCase();
  if (k === "supplier") {
    const marker = `[peer:${srcApp}:${srcId}]`;
    let order = await SupplierOrder.findOne({
      where: { peerSourceApp: srcApp, peerSourceOrderId: srcId },
      attributes: ["id", "peerAcceptStatus", "notes", "invoiceNumber"],
    });
    if (!order) {
      order = await SupplierOrder.findOne({
        where: { notes: { [Op.like]: `%${marker}%` } },
        attributes: ["id", "peerAcceptStatus", "notes", "invoiceNumber"],
      });
    }
    if (!order) {
      return {
        found: false,
        kind: "supplier",
        peerAcceptStatus: "not_found",
        remoteOrderId: null,
        message: "Pedido no recibido / no aceptado en el sistema enlazado",
      };
    }
    const st = order.peerAcceptStatus || "pending_accept";
    return {
      found: true,
      kind: "supplier",
      peerAcceptStatus: st,
      remoteOrderId: order.id,
      message:
        st === "accepted"
          ? "Pedido aceptado en el sistema enlazado"
          : "Pedido recibido, pendiente de aceptación",
    };
  }
  if (k === "customer") {
    const marker = `[peer-customer:${srcApp}:${srcId}]`;
    let order = await Order.findOne({
      where: { peerSourceApp: srcApp, peerSourceOrderId: srcId },
      attributes: ["id", "peerAcceptStatus", "notes"],
    });
    if (!order) {
      order = await Order.findOne({
        where: { notes: { [Op.like]: `%${marker}%` } },
        attributes: ["id", "peerAcceptStatus", "notes"],
      });
    }
    if (!order) {
      return {
        found: false,
        kind: "customer",
        peerAcceptStatus: "not_found",
        remoteOrderId: null,
        message: "Pedido no recibido / no aceptado en el sistema enlazado",
      };
    }
    const st = order.peerAcceptStatus || "pending_accept";
    return {
      found: true,
      kind: "customer",
      peerAcceptStatus: st,
      remoteOrderId: order.id,
      message:
        st === "accepted"
          ? "Pedido aceptado en el sistema enlazado"
          : "Pedido recibido, pendiente de aceptación",
    };
  }
  const err = new Error("kind inválido (supplier|customer)");
  err.status = 400;
  throw err;
}

export async function applyRemotePeerAcceptStatus({
  secret,
  originKind,
  sourceOrderId,
  peerAcceptStatus,
  remoteOrderId,
}) {
  await ensurePeerSyncSchema();
  if (String(secret || "").trim() !== PEER_SYNC_SECRET) {
    const err = new Error("Secreto de enlace inválido");
    err.status = 401;
    throw err;
  }
  const oid = Number(sourceOrderId);
  const st = String(peerAcceptStatus || "").trim() || null;
  if (!Number.isFinite(oid) || oid <= 0 || !st) {
    const err = new Error("Datos de estado incompletos");
    err.status = 400;
    throw err;
  }
  const kind = String(originKind || "").trim().toLowerCase();
  if (kind === "client_order" || kind === "order") {
    const order = await Order.findByPk(oid);
    if (!order) {
      const err = new Error("Pedido origen no encontrado");
      err.status = 404;
      throw err;
    }
    await order.update({
      remotePeerAcceptStatus: st,
      remoteSyncSupplierOrderId:
        Number(remoteOrderId) || order.remoteSyncSupplierOrderId || null,
      remoteSyncError: null,
    });
    return {
      ok: true,
      originKind: "client_order",
      orderId: order.id,
      remotePeerAcceptStatus: st,
    };
  }
  if (kind === "supplier_order") {
    const order = await SupplierOrder.findByPk(oid);
    if (!order) {
      const err = new Error("Pedido a proveedor origen no encontrado");
      err.status = 404;
      throw err;
    }
    await order.update({
      remotePeerAcceptStatus: st,
      remoteSyncCustomerOrderId:
        Number(remoteOrderId) || order.remoteSyncCustomerOrderId || null,
      remoteSyncError: null,
    });
    return {
      ok: true,
      originKind: "supplier_order",
      orderId: order.id,
      remotePeerAcceptStatus: st,
    };
  }
  const err = new Error("originKind inválido");
  err.status = 400;
  throw err;
}

/**
 * Desde un pedido de cliente local, envía al sistema remoto.
 * Si el contenido no cambió, no reenvía: solo consulta el estado de aceptación.
 */
export async function pushClientOrderToPeer(orderId) {
  await ensurePeerSyncSchema();
  const order = await Order.findByPk(orderId, {
    include: [
      { model: Customer, as: "ERP_customer" },
      {
        model: OrderItem,
        as: "ERP_order_items",
        include: [
          {
            model: InventoryProduct,
            as: "ERP_inventory_product",
            attributes: ["id", "name", "barcode", "sku", "price", "supplierPrice"],
          },
        ],
      },
    ],
  });
  if (!order) {
    const err = new Error("Pedido no encontrado");
    err.status = 404;
    throw err;
  }
  const customer = order.ERP_customer;
  if (!customer) {
    const err = new Error("El pedido no tiene cliente");
    err.status = 400;
    throw err;
  }

  const peer = getPeerApp(customer.remoteApp);
  if (!peer) {
    const err = new Error(
      "El cliente no tiene sistema enlazado (elegí EdDeli, Tienda o Store en el cliente)",
    );
    err.status = 400;
    throw err;
  }

  const baseUrl = normalizeBaseUrl(peer.baseUrl);
  const secret = PEER_SYNC_SECRET;

  const items = (order.ERP_order_items || [])
    .map((item) => {
      const qty = billableQty(item);
      if (qty <= 0) return null;
      const product = item.ERP_inventory_product || item.product || {};
      return {
        productId: item.productId,
        name: product.name || null,
        barcode: product.barcode || null,
        sku: product.sku || null,
        quantity: qty,
        price: Number(item.price || 0),
        taxRate: 0,
      };
    })
    .filter(Boolean);

  if (!items.length) {
    const err = new Error("El pedido no tiene ítems enviables");
    err.status = 400;
    throw err;
  }

  const payloadHash = hashPeerPayloadItems(items);
  const alreadySynced =
    String(order.remoteSyncStatus || "").startsWith("synced") &&
    Number(order.remoteSyncSupplierOrderId) > 0 &&
    String(order.remoteSyncPayloadHash || "") === payloadHash;

  if (alreadySynced) {
    const status = await fetchRemotePeerOrderStatus({
      baseUrl,
      secret,
      kind: "supplier",
      sourceApp: APP_KEY,
      sourceOrderId: order.id,
    });
    await order.update({
      remotePeerAcceptStatus: status.peerAcceptStatus || "not_found",
      remoteSyncError: null,
      remoteSyncedAt: new Date(),
    });
    return {
      skipped: true,
      unchanged: true,
      reused: true,
      updated: false,
      supplierOrderId: Number(status.remoteOrderId) || order.remoteSyncSupplierOrderId,
      peerAcceptStatus: status.peerAcceptStatus || "not_found",
      remotePeerAcceptStatus: status.peerAcceptStatus || "not_found",
      message:
        status.peerAcceptStatus === "accepted"
          ? "Sin cambios: el pedido ya está aceptado en el sistema enlazado"
          : status.peerAcceptStatus === "pending_accept"
            ? "Sin cambios: el pedido ya fue enviado y está pendiente de aceptación"
            : `Sin cambios: ${status.message || "pedido no aceptado en el sistema enlazado"}`,
    };
  }

  const payload = {
    secret,
    sourceApp: APP_KEY,
    sourceOrderId: order.id,
    date: order.date,
    notes: order.notes || `Pedido cliente #${order.id} · ${customer.name || ""}`,
    items,
  };

  let remote;
  try {
    const res = await fetch(`${baseUrl}/orders/peer-sync/supplier-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.message || `Error remoto HTTP ${res.status}`);
    }
    remote = body;
  } catch (error) {
    await order.update({
      remoteSyncApp: peer.key,
      remoteSyncStatus: "error",
      remoteSyncError: String(error?.message || error),
      remotePeerAcceptStatus: "not_found",
      remoteSyncedAt: new Date(),
    });
    throw error;
  }

  const status = await fetchRemotePeerOrderStatus({
    baseUrl,
    secret,
    kind: "supplier",
    sourceApp: APP_KEY,
    sourceOrderId: order.id,
  });
  const peerAcceptStatus =
    status.peerAcceptStatus || remote.peerAcceptStatus || "pending_accept";

  await order.update({
    remoteSyncApp: peer.key,
    remoteSyncSupplierOrderId:
      Number(remote.supplierOrderId) || Number(status.remoteOrderId) || null,
    remoteSyncStatus: remote.updated ? "synced_update" : "synced",
    remoteSyncPayloadHash: payloadHash,
    remotePeerAcceptStatus: peerAcceptStatus,
    remoteSyncError: null,
    remoteSyncedAt: new Date(),
  });

  return {
    ...remote,
    skipped: false,
    unchanged: false,
    peerAcceptStatus,
    remotePeerAcceptStatus: peerAcceptStatus,
    message:
      remote.message ||
      (remote.updated
        ? `Pedido actualizado. Estado remoto: ${peerAcceptLabel(peerAcceptStatus)}`
        : `Pedido enviado. Estado remoto: ${peerAcceptLabel(peerAcceptStatus)}`),
  };
}

export async function receivePeerCustomerOrder({
  secret,
  sourceApp,
  sourceOrderId,
  date,
  notes,
  items = [],
}) {
  await ensurePeerSyncSchema();
  if (String(secret || "").trim() !== PEER_SYNC_SECRET) {
    const err = new Error("Secreto de enlace inválido");
    err.status = 401;
    throw err;
  }

  const customer = await resolveOrCreatePeerCustomer(sourceApp || APP_KEY);
  if (!customer) {
    const err = new Error("Cliente destino no encontrado");
    err.status = 404;
    throw err;
  }

  const peerSupplier = await resolveOrCreatePeerSupplier(sourceApp || APP_KEY);

  if (!Array.isArray(items) || !items.length) {
    const err = new Error("El pedido remoto no tiene ítems");
    err.status = 400;
    throw err;
  }

  const srcApp = String(sourceApp || "app").trim().toLowerCase();
  const srcId = Number(sourceOrderId);
  const marker = `[peer-customer:${srcApp}:${srcId}]`;

  const itemInclude = [{ model: OrderItem, as: "ERP_order_items" }];

  const result = await sequelize.transaction(async (t) => {
    const { rows: resolved, unmappedCount } = await resolveIncomingPeerRows(
      items,
      peerSupplier?.id || null,
      t,
    );
    if (!resolved.length) {
      const err = new Error("Ningún ítem válido en el pedido remoto");
      err.status = 400;
      throw err;
    }

    let existing = await Order.findOne({
      where: {
        customerId: customer.id,
        peerSourceApp: srcApp,
        peerSourceOrderId: srcId,
      },
      include: itemInclude,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!existing) {
      existing = await Order.findOne({
        where: {
          customerId: customer.id,
          notes: { [Op.like]: `%${marker}%` },
        },
        include: itemInclude,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
    }

    if (existing) {
      const itemsLocked = existing.ERP_order_items || [];
      const hasProgress =
        existing.paidAt ||
        existing.status === "pagado" ||
        existing.status === "entregado" ||
        itemsLocked.some((it) => it.paidAt || it.deliveredAt);
      if (hasProgress) {
        const err = new Error(
          `El pedido cliente #${existing.id} ya fue entregado o pagado en el destino; no se puede actualizar por enlace`,
        );
        err.status = 409;
        throw err;
      }
      const baseline =
        parsePeerSnapshot(existing.peerAcceptedSnapshot) ||
        snapshotCustomerItems(existing.ERP_order_items || []);
      await OrderItem.destroy({ where: { orderId: existing.id }, transaction: t });
      for (const row of resolved) {
        await OrderItem.create(
          {
            orderId: existing.id,
            productId: row.productId,
            quantity: row.quantity,
            soldQty: row.quantity,
            price: row.price,
            remoteName: row.remoteName,
            remoteBarcode: row.remoteBarcode,
            remoteSku: row.remoteSku,
            remoteCode: row.remoteCode,
          },
          { transaction: t },
        );
      }
      const noteBase = String(notes || existing.notes || "")
        .replace(/\s*·\s*Pendiente de aceptación \/ enlace de productos/g, "")
        .split(marker)
        .join("")
        .replace(/\s*·\s*·/g, " · ")
        .replace(/^\s*·\s*|\s*·\s*$/g, "")
        .trim();
      const nextNotes = [noteBase, marker, "Pendiente de aceptación / enlace de productos"]
        .filter(Boolean)
        .join(" · ");
      await Order.update(
        {
          date: date ? new Date(date) : existing.date,
          notes: nextNotes,
          peerAcceptStatus: "pending_accept",
          peerSourceApp: srcApp,
          peerSourceOrderId: srcId,
          peerRevisionBaseline: JSON.stringify(baseline),
          status: existing.status === "entregado" ? existing.status : "pendiente",
        },
        { where: { id: existing.id }, transaction: t },
      );
      return {
        orderId: existing.id,
        unmappedCount,
        updated: true,
        changes: computePeerChanges(
          baseline,
          resolved.map((r) => ({ ...r, unitPrice: r.price })),
        ),
      };
    }

    const noteParts = [
      String(notes || "").trim(),
      marker,
      "Pendiente de aceptación / enlace de productos",
    ].filter(Boolean);
    try {
      const order = await Order.create(
        {
          customerId: customer.id,
          date: date ? new Date(date) : new Date(),
          notes: noteParts.join(" · "),
          status: "pendiente",
          peerAcceptStatus: "pending_accept",
          peerSourceApp: srcApp,
          peerSourceOrderId: srcId,
          peerRevisionBaseline: null,
          peerAcceptedSnapshot: null,
        },
        { transaction: t },
      );
      for (const row of resolved) {
        await OrderItem.create(
          {
            orderId: order.id,
            productId: row.productId,
            quantity: row.quantity,
            soldQty: row.quantity,
            price: row.price,
            remoteName: row.remoteName,
            remoteBarcode: row.remoteBarcode,
            remoteSku: row.remoteSku,
            remoteCode: row.remoteCode,
          },
          { transaction: t },
        );
      }
      return { orderId: order.id, unmappedCount, updated: false, changes: [] };
    } catch (createErr) {
      const isDup =
        createErr?.name === "SequelizeUniqueConstraintError" ||
        createErr?.parent?.code === "ER_DUP_ENTRY" ||
        /Duplicate|unique/i.test(String(createErr?.message || ""));
      if (!isDup) throw createErr;
      const raced = await Order.findOne({
        where: { peerSourceApp: srcApp, peerSourceOrderId: srcId },
        include: itemInclude,
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!raced) throw createErr;
      const racedItems = raced.ERP_order_items || [];
      const hasProgress =
        raced.paidAt ||
        raced.status === "pagado" ||
        raced.status === "entregado" ||
        racedItems.some((it) => it.paidAt || it.deliveredAt);
      if (hasProgress) {
        const err = new Error(
          `El pedido cliente #${raced.id} ya fue entregado o pagado en el destino; no se puede actualizar por enlace`,
        );
        err.status = 409;
        throw err;
      }
      const baseline =
        parsePeerSnapshot(raced.peerAcceptedSnapshot) ||
        snapshotCustomerItems(racedItems);
      await OrderItem.destroy({ where: { orderId: raced.id }, transaction: t });
      for (const row of resolved) {
        await OrderItem.create(
          {
            orderId: raced.id,
            productId: row.productId,
            quantity: row.quantity,
            soldQty: row.quantity,
            price: row.price,
            remoteName: row.remoteName,
            remoteBarcode: row.remoteBarcode,
            remoteSku: row.remoteSku,
            remoteCode: row.remoteCode,
          },
          { transaction: t },
        );
      }
      const noteBase = String(notes || raced.notes || "")
        .replace(/\s*·\s*Pendiente de aceptación \/ enlace de productos/g, "")
        .split(marker)
        .join("")
        .replace(/\s*·\s*·/g, " · ")
        .replace(/^\s*·\s*|\s*·\s*$/g, "")
        .trim();
      const nextNotes = [noteBase, marker, "Pendiente de aceptación / enlace de productos"]
        .filter(Boolean)
        .join(" · ");
      await Order.update(
        {
          date: date ? new Date(date) : raced.date,
          notes: nextNotes,
          peerAcceptStatus: "pending_accept",
          peerSourceApp: srcApp,
          peerSourceOrderId: srcId,
          peerRevisionBaseline: JSON.stringify(baseline),
          status: raced.status === "entregado" ? raced.status : "pendiente",
        },
        { where: { id: raced.id }, transaction: t },
      );
      return {
        orderId: raced.id,
        unmappedCount,
        updated: true,
        changes: computePeerChanges(
          baseline,
          resolved.map((r) => ({ ...r, unitPrice: r.price })),
        ),
      };
    }
  });

  const order = await Order.findByPk(result.orderId);
  await notifyPeerCustomerOrderReceived(order, customer, sourceApp, result.unmappedCount, {
    updated: result.updated,
  });

  return {
    reused: false,
    updated: result.updated,
    customerOrderId: result.orderId,
    peerAcceptStatus: "pending_accept",
    unmappedCount: result.unmappedCount,
    changes: result.changes,
    message: result.updated
      ? `Pedido cliente actualizado. Revisá y aceptá los cambios.${
          result.unmappedCount ? ` ${result.unmappedCount} sin enlazar.` : ""
        }`
      : result.unmappedCount > 0
        ? `Pedido cliente recibido. ${result.unmappedCount} producto(s) pendientes de enlace.`
        : "Pedido cliente recibido. Pendiente de aceptación.",
  };
}

export async function acceptPeerCustomerOrder(orderId, mappings = []) {
  await ensurePeerSyncSchema();
  const id = Number(orderId);
  const order = await Order.findByPk(id, {
    include: [
      { model: OrderItem, as: "ERP_order_items" },
      { model: Customer, as: "ERP_customer" },
    ],
  });
  if (!order) {
    const err = new Error("Pedido no encontrado");
    err.status = 404;
    throw err;
  }
  if (order.peerAcceptStatus && order.peerAcceptStatus !== "pending_accept") {
    const err = new Error("Este pedido ya fue aceptado");
    err.status = 400;
    throw err;
  }

  const sourceApp = order.ERP_customer?.remoteApp || null;
  const peerSupplier = sourceApp
    ? await resolveOrCreatePeerSupplier(sourceApp)
    : null;

  const items = order.ERP_order_items || [];
  const mapByItem = new Map(
    (Array.isArray(mappings) ? mappings : []).map((m) => [
      Number(m.itemId),
      Number(m.productId),
    ]),
  );

  await sequelize.transaction(async (t) => {
    for (const item of items) {
      const fromMap = mapByItem.has(Number(item.id))
        ? mapByItem.get(Number(item.id))
        : null;
      const productId = Number(fromMap) || Number(item.productId) || null;
      if (!productId) {
        const err = new Error(
          `Falta enlazar el producto: ${item.remoteName || `ítem #${item.id}`}`,
        );
        err.status = 400;
        throw err;
      }
      const product = await InventoryProduct.findByPk(productId, { transaction: t });
      if (!product) {
        const err = new Error(`Producto local #${productId} no encontrado`);
        err.status = 404;
        throw err;
      }
      await item.update({ productId: product.id }, { transaction: t });
      if (peerSupplier) {
        await upsertPeerProductLinks(
          peerSupplier.id,
          product.id,
          {
            name: item.remoteName,
            barcode: item.remoteBarcode,
            sku: item.remoteSku,
            remoteCode: item.remoteCode,
          },
          t,
        );
      }
    }

    const notes = String(order.notes || "")
      .replace(/\s*·\s*Pendiente de aceptación \/ enlace de productos/g, "")
      .trim();
    const acceptedSnap = (items || []).map((it) => ({
      key: itemSnapKey(it),
      remoteName: it.remoteName,
      remoteBarcode: it.remoteBarcode,
      remoteSku: it.remoteSku,
      remoteCode: it.remoteCode,
      quantity: Number(it.quantity || 0),
      unitPrice: Number(it.price || 0),
      productId: Number(it.productId) || null,
    }));
    await order.update(
      {
        peerAcceptStatus: "accepted",
        notes: notes || order.notes,
        peerAcceptedSnapshot: JSON.stringify(acceptedSnap),
        peerRevisionBaseline: null,
      },
      { transaction: t },
    );
  });

  await notifyOriginPeerAcceptStatus({
    sourceApp: order.peerSourceApp || order.ERP_customer?.remoteApp,
    sourceOrderId: order.peerSourceOrderId,
    originKind: "supplier_order",
    peerAcceptStatus: "accepted",
    remoteOrderId: order.id,
  });

  return {
    customerOrderId: order.id,
    peerAcceptStatus: "accepted",
    message: "Pedido cliente aceptado y productos enlazados",
  };
}

export async function getPeerAcceptCustomerOrderDetail(orderId) {
  await ensurePeerSyncSchema();
  const order = await Order.findByPk(Number(orderId), {
    include: [
      { model: Customer, as: "ERP_customer" },
      {
        model: OrderItem,
        as: "ERP_order_items",
        include: [
          {
            model: InventoryProduct,
            as: "ERP_inventory_product",
            attributes: ["id", "name", "barcode", "sku"],
            required: false,
          },
        ],
      },
    ],
  });
  if (!order) {
    const err = new Error("Pedido no encontrado");
    err.status = 404;
    throw err;
  }
  const items = (order.ERP_order_items || []).map((it) => ({
    id: it.id,
    productId: it.productId || null,
    productName: it.ERP_inventory_product?.name || null,
    quantity: it.quantity,
    unitPrice: Number(it.price || 0),
    remoteName: it.remoteName || it.ERP_inventory_product?.name || null,
    remoteBarcode: it.remoteBarcode || null,
    remoteSku: it.remoteSku || null,
    remoteCode: it.remoteCode || null,
    needsLink: !it.productId,
  }));
  const after = snapshotCustomerItems(order.ERP_order_items || []);
  const before =
    parsePeerSnapshot(order.peerRevisionBaseline) ||
    parsePeerSnapshot(order.peerAcceptedSnapshot) ||
    [];
  const isRevision = Boolean(
    order.peerRevisionBaseline ||
      (order.peerAcceptStatus === "pending_accept" &&
        parsePeerSnapshot(order.peerAcceptedSnapshot)),
  );
  return {
    id: order.id,
    kind: "customer",
    customerId: order.customerId,
    customerName: order.ERP_customer?.name || null,
    supplierName: order.ERP_customer?.name || null,
    date: order.date,
    notes: order.notes,
    peerAcceptStatus: order.peerAcceptStatus || null,
    status: order.status,
    isRevision,
    changes: isRevision ? computePeerChanges(before, after) : [],
    items,
  };
}

/**
 * Desde un pedido a proveedor local, envía al sistema remoto como venta.
 * Si el contenido no cambió, no reenvía: solo consulta el estado de aceptación.
 */
export async function pushSupplierOrderToPeer(supplierOrderId) {
  await ensurePeerSyncSchema();
  const order = await SupplierOrder.findByPk(supplierOrderId, {
    include: [
      { model: Supplier, as: "ERP_supplier" },
      {
        model: SupplierOrderItem,
        as: "ERP_supplier_order_items",
        include: [
          {
            model: InventoryProduct,
            as: "ERP_inventory_product",
            attributes: ["id", "name", "barcode", "sku", "price", "supplierPrice"],
            required: false,
          },
        ],
      },
    ],
  });
  if (!order) {
    const err = new Error("Pedido a proveedor no encontrado");
    err.status = 404;
    throw err;
  }
  if (order.peerAcceptStatus === "pending_accept") {
    const err = new Error("Primero aceptá este pedido entrante antes de reenviarlo");
    err.status = 400;
    throw err;
  }
  const supplier = order.ERP_supplier;
  if (!supplier?.remoteApp) {
    const err = new Error(
      "El proveedor no tiene sistema enlazado (elegí EdDeli, Tienda o Store en el proveedor)",
    );
    err.status = 400;
    throw err;
  }

  const peer = getPeerApp(supplier.remoteApp);
  if (!peer) {
    const err = new Error("Sistema enlazado del proveedor no configurado");
    err.status = 400;
    throw err;
  }

  const baseUrl = normalizeBaseUrl(peer.baseUrl);
  const secret = PEER_SYNC_SECRET;

  const items = (order.ERP_supplier_order_items || [])
    .map((item) => {
      const qty = Number(item.quantity || 0);
      if (qty <= 0) return null;
      if (!item.productId) return null;
      const product = item.ERP_inventory_product || {};
      return {
        productId: item.productId,
        name: product.name || item.remoteName || null,
        barcode: product.barcode || item.remoteBarcode || null,
        sku: product.sku || item.remoteSku || null,
        quantity: qty,
        price: Number(item.unitPrice || 0),
        taxRate: Number(item.taxRate || 0),
      };
    })
    .filter(Boolean);

  if (!items.length) {
    const err = new Error("El pedido no tiene ítems enviables (todos deben tener producto)");
    err.status = 400;
    throw err;
  }

  const payloadHash = hashPeerPayloadItems(items);
  const alreadySynced =
    String(order.remoteSyncStatus || "").startsWith("synced") &&
    Number(order.remoteSyncCustomerOrderId) > 0 &&
    String(order.remoteSyncPayloadHash || "") === payloadHash;

  if (alreadySynced) {
    const status = await fetchRemotePeerOrderStatus({
      baseUrl,
      secret,
      kind: "customer",
      sourceApp: APP_KEY,
      sourceOrderId: order.id,
    });
    await order.update({
      remotePeerAcceptStatus: status.peerAcceptStatus || "not_found",
      remoteSyncError: null,
      remoteSyncedAt: new Date(),
    });
    return {
      skipped: true,
      unchanged: true,
      reused: true,
      updated: false,
      customerOrderId: Number(status.remoteOrderId) || order.remoteSyncCustomerOrderId,
      peerAcceptStatus: status.peerAcceptStatus || "not_found",
      remotePeerAcceptStatus: status.peerAcceptStatus || "not_found",
      message:
        status.peerAcceptStatus === "accepted"
          ? "Sin cambios: el pedido ya está aceptado en el sistema enlazado"
          : status.peerAcceptStatus === "pending_accept"
            ? "Sin cambios: el pedido ya fue enviado y está pendiente de aceptación"
            : `Sin cambios: ${status.message || "pedido no aceptado en el sistema enlazado"}`,
    };
  }

  const payload = {
    secret,
    sourceApp: APP_KEY,
    sourceOrderId: order.id,
    date: order.date,
    notes:
      order.notes ||
      `Pedido proveedor #${order.id} · ${supplier.name || ""}`,
    items,
  };

  let remote;
  try {
    const res = await fetch(`${baseUrl}/orders/peer-sync/customer-orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body?.message || `Error remoto HTTP ${res.status}`);
    }
    remote = body;
  } catch (error) {
    await order.update({
      remoteSyncApp: peer.key,
      remoteSyncStatus: "error",
      remoteSyncError: String(error?.message || error),
      remotePeerAcceptStatus: "not_found",
      remoteSyncedAt: new Date(),
    });
    throw error;
  }

  const status = await fetchRemotePeerOrderStatus({
    baseUrl,
    secret,
    kind: "customer",
    sourceApp: APP_KEY,
    sourceOrderId: order.id,
  });
  const peerAcceptStatus =
    status.peerAcceptStatus || remote.peerAcceptStatus || "pending_accept";

  await order.update({
    remoteSyncApp: peer.key,
    remoteSyncCustomerOrderId:
      Number(remote.customerOrderId) || Number(status.remoteOrderId) || null,
    remoteSyncStatus: remote.updated ? "synced_update" : "synced",
    remoteSyncPayloadHash: payloadHash,
    remotePeerAcceptStatus: peerAcceptStatus,
    remoteSyncError: null,
    remoteSyncedAt: new Date(),
  });

  return {
    ...remote,
    skipped: false,
    unchanged: false,
    peerAcceptStatus,
    remotePeerAcceptStatus: peerAcceptStatus,
    message:
      remote.message ||
      (remote.updated
        ? `Pedido actualizado. Estado remoto: ${peerAcceptLabel(peerAcceptStatus)}`
        : `Pedido enviado. Estado remoto: ${peerAcceptLabel(peerAcceptStatus)}`),
  };
}
