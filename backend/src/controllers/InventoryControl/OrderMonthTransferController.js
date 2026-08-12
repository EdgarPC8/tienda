/**
 * Exportar / importar pedidos del mes (clientes + proveedores) como JSON.
 * Importación solo-datos: no mueve stock ni crea Income/Expense de cobranzas.
 */
import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { InventoryProduct } from "../../models/Inventory.js";
import {
  Customer,
  Order,
  OrderItem,
  Supplier,
  SupplierOrder,
  SupplierOrderItem,
} from "../../models/Orders.js";
import { SupplierOrderPayment } from "../../models/Finance.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const IMPORT_TAG = "[IMPORT_MES]";
const CAJA_POS_TAG = "[CAJA_POS]";
const SALE_CREDITO_TAG = "[CREDITO]";

/** Export de pedidos: manuales + crédito de caja (sin contado POS). */
const pedidosListNotesWhere = {
  [Op.or]: [
    { notes: null },
    { notes: { [Op.notLike]: `%${CAJA_POS_TAG}%` } },
    { notes: { [Op.like]: `%${SALE_CREDITO_TAG}%` } },
    { paymentMethod: "credito" },
  ],
};

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const norm = (s) => String(s || "").trim();
const normKey = (s) => norm(s).toLowerCase();

function monthRange(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    throw new Error("Año y mes inválidos (month 1–12)");
  }
  const from = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const to = new Date(y, m, 0, 23, 59, 59, 999);
  return { from, to, year: y, month: m };
}

function toIso(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseMaybeDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function productRef(p) {
  if (!p) return { barcode: null, sku: null, name: null };
  return {
    barcode: p.barcode || null,
    sku: p.sku || null,
    name: p.name || null,
  };
}

function customerRef(c) {
  if (!c) return null;
  return {
    cedula: c.cedula || null,
    identType: c.identType || null,
    name: c.name || null,
    firstName: c.firstName || null,
    secondName: c.secondName || null,
    firstLastName: c.firstLastName || null,
    secondLastName: c.secondLastName || null,
    phone: c.phone || null,
    email: c.email || null,
    address: c.address || null,
  };
}

async function resolveProduct(ref, { transaction, cache }) {
  const barcode = norm(ref?.barcode);
  const sku = norm(ref?.sku);
  const name = norm(ref?.name);
  const cacheKey = `p:${barcode}|${sku}|${normKey(name)}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let product = null;
  if (barcode) {
    product = await InventoryProduct.findOne({ where: { barcode }, transaction });
  }
  if (!product && sku) {
    product = await InventoryProduct.findOne({ where: { sku }, transaction });
  }
  if (!product && name) {
    product = await InventoryProduct.findOne({
      where: sequelize.where(
        sequelize.fn("LOWER", sequelize.col("name")),
        normKey(name),
      ),
      transaction,
    });
  }
  cache.set(cacheKey, product);
  return product;
}

/** GET /orders/month-transfer/export?year=&month= */
export const exportOrdersMonth = async (req, res) => {
  try {
    const { from, to, year, month } = monthRange(req.query.year, req.query.month);

    const [customerRows, supplierRows] = await Promise.all([
      Order.findAll({
        where: {
          ...pedidosListNotesWhere,
          date: { [Op.gte]: from, [Op.lte]: to },
        },
        include: [
          { model: Customer, as: "ERP_customer" },
          {
            model: OrderItem,
            as: "ERP_order_items",
            include: [{ model: InventoryProduct, as: "ERP_inventory_product" }],
          },
        ],
        order: [["date", "ASC"]],
      }),
      SupplierOrder.findAll({
        where: { date: { [Op.gte]: from, [Op.lte]: to } },
        include: [
          { model: Supplier, as: "ERP_supplier" },
          {
            model: SupplierOrderItem,
            as: "ERP_supplier_order_items",
            include: [{ model: InventoryProduct, as: "ERP_inventory_product" }],
          },
        ],
        order: [["date", "ASC"]],
      }),
    ]);

    const supplierIds = supplierRows.map((o) => o.id);
    let payments = [];
    if (supplierIds.length) {
      try {
        payments = await SupplierOrderPayment.findAll({
          where: {
            supplierOrderId: { [Op.in]: supplierIds },
            status: "completed",
          },
          order: [["date", "ASC"]],
        });
      } catch {
        payments = [];
      }
    }
    const paymentsByOrder = new Map();
    for (const p of payments) {
      const oid = Number(p.supplierOrderId);
      if (!paymentsByOrder.has(oid)) paymentsByOrder.set(oid, []);
      paymentsByOrder.get(oid).push({
        date: toIso(p.date),
        amount: toNum(p.amount),
        method: p.method || "efectivo",
        note: p.note || null,
        status: p.status || "completed",
      });
    }

    const customerOrders = customerRows.map((o) => ({
      sourceId: o.id,
      date: toIso(o.date),
      notes: o.notes || null,
      status: o.status || "pendiente",
      paidAt: toIso(o.paidAt),
      paymentMethod: o.paymentMethod || null,
      customer: customerRef(o.ERP_customer),
      items: (o.ERP_order_items || []).map((it) => ({
        product: productRef(it.ERP_inventory_product),
        quantity: toNum(it.quantity),
        price: toNum(it.price),
        soldQty: toNum(it.soldQty),
        damagedQty: toNum(it.damagedQty),
        giftQty: toNum(it.giftQty),
        replacedQty: toNum(it.replacedQty),
        deliveredAt: toIso(it.deliveredAt),
        paidAt: toIso(it.paidAt),
      })),
    }));

    const supplierOrders = supplierRows.map((o) => ({
      sourceId: o.id,
      date: toIso(o.date),
      notes: o.notes || null,
      status: o.status || "pendiente",
      receivedAt: toIso(o.receivedAt),
      paidAt: toIso(o.paidAt),
      paymentMethod: o.paymentMethod || null,
      supplier: o.ERP_supplier
        ? {
            name: o.ERP_supplier.name,
            phone: o.ERP_supplier.phone || null,
            email: o.ERP_supplier.email || null,
            address: o.ERP_supplier.address || null,
            notes: o.ERP_supplier.notes || null,
          }
        : null,
      items: (o.ERP_supplier_order_items || []).map((it) => ({
        product: productRef(it.ERP_inventory_product),
        quantity: toNum(it.quantity),
        unitPrice: toNum(it.unitPrice),
        taxRate: toNum(it.taxRate),
        packKey: it.packKey || null,
        packName: it.packName || null,
        lotCode: it.lotCode || null,
        expiresAt: toIso(it.expiresAt),
        manufacturedAt: toIso(it.manufacturedAt),
      })),
      payments: paymentsByOrder.get(Number(o.id)) || [],
    }));

    const payload = {
      version: 1,
      kind: "eddeli-orders-month",
      year,
      month,
      exportedAt: new Date().toISOString(),
      notes: [
        "Importación solo-datos: no mueve stock.",
        "No incluye grupos de cobranzas de clientes ni Income/Expense.",
        "Pagos a proveedor se recrean sin Expense contable.",
      ],
      totals: {
        customerOrders: customerOrders.length,
        supplierOrders: supplierOrders.length,
      },
      customerOrders,
      supplierOrders,
    };

    notifyOk("orders.month_exported", `Export mes ${year}-${month}`, {
      year,
      month,
      customerOrders: customerOrders.length,
      supplierOrders: supplierOrders.length,
    });

    return res.json(payload);
  } catch (error) {
    console.error("exportOrdersMonth:", error);
    notifyFail("orders.month_export_failed", error.message || "Error al exportar", {
      error,
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: error.message || "Error al exportar pedidos del mes" });
  }
};

/** POST /orders/month-transfer/import  body: { ...payload } o { data: payload } */
export const importOrdersMonth = async (req, res) => {
  try {
    const raw = req.body?.data && typeof req.body.data === "object" ? req.body.data : req.body;
    if (!raw || raw.kind !== "eddeli-orders-month") {
      return res.status(400).json({
        message: "JSON inválido: se espera kind = eddeli-orders-month",
      });
    }

    const customerOrders = Array.isArray(raw.customerOrders) ? raw.customerOrders : [];
    const supplierOrders = Array.isArray(raw.supplierOrders) ? raw.supplierOrders : [];
    const createMissing = raw.createMissing !== false;

    const summary = {
      customersCreated: 0,
      suppliersCreated: 0,
      customerOrdersCreated: 0,
      supplierOrdersCreated: 0,
      supplierPaymentsCreated: 0,
      skipped: [],
      errors: [],
    };

    await sequelize.transaction(async (t) => {
      const cache = new Map();

      const resolveCustomerTracked = async (ref) => {
        const cedula = norm(ref?.cedula);
        const name = norm(ref?.name);
        const cacheKey = `c:${cedula}|${normKey(name)}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);

        let customer = null;
        if (cedula) customer = await Customer.findOne({ where: { cedula }, transaction: t });
        if (!customer && name) {
          customer = await Customer.findOne({
            where: sequelize.where(
              sequelize.fn("LOWER", sequelize.col("name")),
              normKey(name),
            ),
            transaction: t,
          });
        }
        let created = false;
        if (!customer && createMissing && (cedula || name)) {
          const builtName =
            name ||
            [ref?.firstName, ref?.secondName, ref?.firstLastName, ref?.secondLastName]
              .map(norm)
              .filter(Boolean)
              .join(" ") ||
            cedula ||
            "Cliente importado";
          customer = await Customer.create(
            {
              name: builtName,
              cedula: cedula || null,
              identType: ref?.identType || (cedula ? "05" : null),
              firstName: ref?.firstName || null,
              secondName: ref?.secondName || null,
              firstLastName: ref?.firstLastName || null,
              secondLastName: ref?.secondLastName || null,
              phone: ref?.phone || null,
              email: ref?.email || null,
              address: ref?.address || null,
            },
            { transaction: t },
          );
          created = true;
          summary.customersCreated += 1;
        }
        const out = { customer, created };
        cache.set(cacheKey, out);
        return out;
      };

      const resolveSupplierTracked = async (ref) => {
        const name = norm(ref?.name);
        if (!name) return { supplier: null, created: false };
        const cacheKey = `s:${normKey(name)}`;
        if (cache.has(cacheKey)) return cache.get(cacheKey);
        let supplier = await Supplier.findOne({
          where: sequelize.where(
            sequelize.fn("LOWER", sequelize.col("name")),
            normKey(name),
          ),
          transaction: t,
        });
        let created = false;
        if (!supplier && createMissing) {
          supplier = await Supplier.create(
            {
              name,
              phone: ref?.phone || null,
              email: ref?.email || null,
              address: ref?.address || null,
              notes: ref?.notes || null,
            },
            { transaction: t },
          );
          created = true;
          summary.suppliersCreated += 1;
        }
        const out = { supplier, created };
        cache.set(cacheKey, out);
        return out;
      };

      for (const row of customerOrders) {
        try {
          const { customer } = await resolveCustomerTracked(row.customer);
          if (!customer) {
            summary.skipped.push({
              kind: "customerOrder",
              sourceId: row.sourceId,
              reason: "Cliente no encontrado",
            });
            continue;
          }

          const itemsIn = Array.isArray(row.items) ? row.items : [];
          if (!itemsIn.length) {
            summary.skipped.push({
              kind: "customerOrder",
              sourceId: row.sourceId,
              reason: "Sin ítems",
            });
            continue;
          }

          const resolvedItems = [];
          let missingProduct = false;
          for (const it of itemsIn) {
            const product = await resolveProduct(it.product, { transaction: t, cache });
            if (!product) {
              missingProduct = true;
              summary.skipped.push({
                kind: "customerOrderItem",
                sourceId: row.sourceId,
                product: it.product?.name || it.product?.barcode || it.product?.sku,
                reason: "Producto no encontrado",
              });
              break;
            }
            resolvedItems.push({ product, it });
          }
          if (missingProduct) continue;

          const importMark = `${IMPORT_TAG} src=${row.sourceId ?? "?"}`;
          const baseNotes = norm(row.notes);
          const notes = baseNotes.includes(IMPORT_TAG)
            ? baseNotes
            : [baseNotes, importMark].filter(Boolean).join("\n");

          const order = await Order.create(
            {
              customerId: customer.id,
              date: parseMaybeDate(row.date) || new Date(),
              notes,
              status: row.status || "pendiente",
              paidAt: parseMaybeDate(row.paidAt),
              paymentMethod: row.paymentMethod || null,
            },
            { transaction: t },
          );

          for (const { product, it } of resolvedItems) {
            await OrderItem.create(
              {
                orderId: order.id,
                productId: product.id,
                quantity: toNum(it.quantity),
                price: toNum(it.price),
                soldQty: toNum(it.soldQty),
                damagedQty: toNum(it.damagedQty),
                giftQty: toNum(it.giftQty),
                replacedQty: toNum(it.replacedQty),
                deliveredAt: parseMaybeDate(it.deliveredAt),
                paidAt: parseMaybeDate(it.paidAt),
              },
              { transaction: t },
            );
          }
          summary.customerOrdersCreated += 1;
        } catch (e) {
          summary.errors.push({
            kind: "customerOrder",
            sourceId: row.sourceId,
            message: e.message,
          });
        }
      }

      for (const row of supplierOrders) {
        try {
          const { supplier } = await resolveSupplierTracked(row.supplier);
          if (!supplier) {
            summary.skipped.push({
              kind: "supplierOrder",
              sourceId: row.sourceId,
              reason: "Proveedor no encontrado",
            });
            continue;
          }

          const itemsIn = Array.isArray(row.items) ? row.items : [];
          if (!itemsIn.length) {
            summary.skipped.push({
              kind: "supplierOrder",
              sourceId: row.sourceId,
              reason: "Sin ítems",
            });
            continue;
          }

          const resolvedItems = [];
          let missingProduct = false;
          for (const it of itemsIn) {
            const product = await resolveProduct(it.product, { transaction: t, cache });
            if (!product) {
              missingProduct = true;
              summary.skipped.push({
                kind: "supplierOrderItem",
                sourceId: row.sourceId,
                product: it.product?.name || it.product?.barcode || it.product?.sku,
                reason: "Producto no encontrado",
              });
              break;
            }
            resolvedItems.push({ product, it });
          }
          if (missingProduct) continue;

          const importMark = `${IMPORT_TAG} src=${row.sourceId ?? "?"}`;
          const baseNotes = norm(row.notes);
          const notes = baseNotes.includes(IMPORT_TAG)
            ? baseNotes
            : [baseNotes, importMark].filter(Boolean).join("\n");

          // Datos históricos: no dispara markReceived (sin stock)
          const order = await SupplierOrder.create(
            {
              supplierId: supplier.id,
              date: parseMaybeDate(row.date) || new Date(),
              notes,
              status: row.receivedAt ? "recibido" : row.status || "pendiente",
              receivedAt: parseMaybeDate(row.receivedAt),
              paidAt: parseMaybeDate(row.paidAt),
              paymentMethod: row.paymentMethod || null,
            },
            { transaction: t },
          );

          for (const { product, it } of resolvedItems) {
            await SupplierOrderItem.create(
              {
                orderId: order.id,
                productId: product.id,
                quantity: toNum(it.quantity),
                unitPrice: toNum(it.unitPrice ?? it.price),
                taxRate: Math.max(0, toNum(it.taxRate)),
                packKey: it.packKey || null,
                packName: it.packName || null,
                lotCode: it.lotCode || null,
                expiresAt: parseMaybeDate(it.expiresAt),
                manufacturedAt: parseMaybeDate(it.manufacturedAt),
              },
              { transaction: t },
            );
          }

          for (const pay of Array.isArray(row.payments) ? row.payments : []) {
            const amount = toNum(pay.amount);
            if (amount <= 0) continue;
            await SupplierOrderPayment.create(
              {
                supplierOrderId: order.id,
                supplierId: supplier.id,
                date: parseMaybeDate(pay.date) || new Date(),
                amount,
                method: pay.method || "efectivo",
                note: pay.note || `${IMPORT_TAG} abono importado`,
                status: pay.status || "completed",
                expenseId: null,
              },
              { transaction: t },
            );
            summary.supplierPaymentsCreated += 1;
          }

          summary.supplierOrdersCreated += 1;
        } catch (e) {
          summary.errors.push({
            kind: "supplierOrder",
            sourceId: row.sourceId,
            message: e.message,
          });
        }
      }
    });

    notifyOk("orders.month_imported", "Importación de pedidos del mes", summary);
    return res.json({
      ok: true,
      message: "Importación lista (solo datos; sin movimiento de stock)",
      summary,
    });
  } catch (error) {
    console.error("importOrdersMonth:", error);
    notifyFail("orders.month_import_failed", error.message || "Error al importar", {
      error,
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: error.message || "Error al importar pedidos del mes" });
  }
};
