import { sequelize } from "../database/connection.js";
import { Op } from "sequelize";
import {
  Supplier,
  MeasureUnit,
  ProductCategory,
  Brand,
  StoreProduct,
  Purchase,
  PurchaseItem,
  StockMovement,
  FinanceEntry,
  Customer,
  SaleOrder,
  SaleOrderItem,
  SupplierOrder,
  SupplierOrderItem,
} from "../models/Tienda.js";

const slugify = (value = "") =>
  value
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const VALID_TAX_TYPES = new Set(["gravado", "zero", "exento"]);
const to2 = (n) => Number(Number(n || 0).toFixed(2));
const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

const normalizeTaxType = (value) => {
  const t = String(value || "").trim().toLowerCase();
  return VALID_TAX_TYPES.has(t) ? t : "gravado";
};

const normalizeTaxRate = (value, taxType) => {
  const n = Number(value);
  if (taxType !== "gravado") return 0;
  if (!Number.isFinite(n)) return 15;
  return clamp(n, 0, 100);
};

const calculateTaxBreakdown = ({ quantity = 0, unitPrice = 0, taxType = "gravado", taxRate = 15 }) => {
  const qty = Number(quantity || 0);
  const price = Number(unitPrice || 0);
  const lineTotal = to2(qty * price);
  if (taxType !== "gravado" || Number(taxRate || 0) <= 0) {
    return { lineTotal, taxBase: lineTotal, taxAmount: 0 };
  }
  const rate = Number(taxRate || 0) / 100;
  const taxBase = to2(lineTotal / (1 + rate));
  const taxAmount = to2(lineTotal - taxBase);
  return { lineTotal, taxBase, taxAmount };
};

export const getSuppliers = async (_req, res) => {
  const data = await Supplier.findAll({ order: [["name", "ASC"]] });
  res.json(data);
};

export const createSupplier = async (req, res) => {
  const created = await Supplier.create(req.body);
  res.status(201).json(created);
};

export const getUnits = async (_req, res) => {
  const data = await MeasureUnit.findAll({ order: [["groupName", "ASC"], ["factorToBase", "ASC"]] });
  res.json(data);
};

export const createUnit = async (req, res) => {
  const { name, abbreviation, groupName, factorToBase, isBase } = req.body;
  if (!name?.trim() || !abbreviation?.trim() || !groupName?.trim()) {
    return res.status(400).json({ message: "Nombre, abreviatura y grupo son requeridos." });
  }
  const f = Number(factorToBase);
  if (!Number.isFinite(f) || f <= 0) {
    return res.status(400).json({ message: "factorToBase debe ser un número mayor que 0." });
  }
  try {
    const created = await MeasureUnit.create({
      name: name.trim(),
      abbreviation: abbreviation.trim(),
      groupName: groupName.trim(),
      factorToBase: f,
      isBase: Boolean(isBase),
    });
    res.status(201).json(created);
  } catch (e) {
    if (e.name === "SequelizeUniqueConstraintError") {
      return res.status(400).json({ message: "Ya existe una unidad con ese nombre." });
    }
    throw e;
  }
};

export const getCategories = async (_req, res) => {
  const data = await ProductCategory.findAll({
    include: [{ model: ProductCategory, as: "parent", attributes: ["id", "name", "slug"] }],
    order: [
      ["sortOrder", "ASC"],
      ["name", "ASC"],
    ],
  });
  res.json(data);
};

export const getBrands = async (_req, res) => {
  const data = await Brand.findAll({ order: [["name", "ASC"]] });
  res.json(data);
};

export const createBrand = async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ message: "El nombre de marca es requerido." });
  }
  const created = await Brand.create({ name: name.trim() });
  res.status(201).json(created);
};

export const createCategory = async (req, res) => {
  const { name, description, parentId = null, isActive = true, sortOrder = 0 } = req.body;
  if (!name?.trim()) {
    return res.status(400).json({ message: "El nombre de categoría es requerido." });
  }

  if (parentId) {
    const parent = await ProductCategory.findByPk(parentId);
    if (!parent) {
      return res.status(400).json({ message: "La categoría padre no existe." });
    }
  }

  const slugBase = slugify(name);
  if (!slugBase) {
    return res.status(400).json({ message: "No se pudo generar slug válido." });
  }

  let slug = slugBase;
  let i = 1;
  // Garantiza slug único sin romper por nombre repetido
  while (await ProductCategory.findOne({ where: { slug } })) {
    i += 1;
    slug = `${slugBase}-${i}`;
  }

  const created = await ProductCategory.create({
    name: name.trim(),
    slug,
    parentId: parentId || null,
    description: description?.trim() || null,
    isActive: Boolean(isActive),
    sortOrder: Number(sortOrder || 0),
  });
  res.status(201).json(created);
};

export const getProducts = async (_req, res) => {
  const data = await StoreProduct.findAll({
    include: [
      { model: ProductCategory, as: "category" },
      { model: Brand, as: "brand" },
      { model: MeasureUnit, as: "baseUnit" },
    ],
    order: [["name", "ASC"]],
  });
  res.json(data);
};

export const createProduct = async (req, res) => {
  const taxType = normalizeTaxType(req.body.taxType);
  const taxRate = normalizeTaxRate(req.body.taxRate, taxType);
  const created = await StoreProduct.create({
    ...req.body,
    brandId: req.body.brandId || null,
    sizeLabel: req.body.sizeLabel?.trim() || null,
    taxType,
    taxRate,
    primaryImageUrl: req.uploadInfo?.relPath || null,
    wholesaleMinQty: Number(req.body.wholesaleMinQty || 0),
    wholesalePrice: Number(req.body.wholesalePrice || 0),
  });
  res.status(201).json(created);
};

export const updateProduct = async (req, res) => {
  const { id } = req.params;
  const product = await StoreProduct.findByPk(id);
  if (!product) return res.status(404).json({ message: "Producto no encontrado." });

  const taxType = normalizeTaxType(req.body.taxType ?? product.taxType);
  const taxRate = normalizeTaxRate(req.body.taxRate ?? product.taxRate, taxType);
  const payload = {
    name: req.body.name?.trim() || product.name,
    sku: req.body.sku?.trim() || null,
    barcode: req.body.barcode?.trim() || null,
    categoryId: req.body.categoryId ? Number(req.body.categoryId) : null,
    brandId: req.body.brandId ? Number(req.body.brandId) : null,
    baseUnitId: req.body.baseUnitId ? Number(req.body.baseUnitId) : product.baseUnitId,
    sizeLabel: req.body.sizeLabel?.trim() || null,
    salePrice: Number(req.body.salePrice ?? product.salePrice ?? 0),
    taxType,
    taxRate,
    wholesaleMinQty: Number(req.body.wholesaleMinQty ?? product.wholesaleMinQty ?? 0),
    wholesalePrice: Number(req.body.wholesalePrice ?? product.wholesalePrice ?? 0),
    minStockBase: Number(req.body.minStockBase ?? product.minStockBase ?? 0),
  };

  if (req.uploadInfo?.relPath) {
    payload.primaryImageUrl = req.uploadInfo.relPath;
  }

  await product.update(payload);
  res.json(product);
};

/**
 * Registrar compra y actualizar stock/costo promedio en unidad base.
 * Body esperado:
 * {
 *   supplierId, date, invoiceNumber?, note?,
 *   items: [{ productId, unitId, quantity, unitPrice }]
 * }
 */
export const createPurchase = async (req, res) => {
  const { supplierId, date, invoiceNumber, note, items = [] } = req.body;
  if (!supplierId || !date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "supplierId, date e items son requeridos." });
  }

  const t = await sequelize.transaction();
  try {
    let purchaseTotal = 0;
    const purchase = await Purchase.create(
      { supplierId, date, invoiceNumber, note, total: 0 },
      { transaction: t }
    );

    for (const item of items) {
      const { productId, unitId, quantity, unitPrice } = item;
      if (!productId || !unitId || !quantity || !unitPrice) {
        throw new Error("Cada item requiere productId, unitId, quantity y unitPrice.");
      }

      const product = await StoreProduct.findByPk(productId, { transaction: t });
      const purchaseUnit = await MeasureUnit.findByPk(unitId, { transaction: t });
      const baseUnit = await MeasureUnit.findByPk(product.baseUnitId, { transaction: t });
      if (!product || !purchaseUnit || !baseUnit) {
        throw new Error("Producto o unidad no encontrada.");
      }
      if (purchaseUnit.groupName !== baseUnit.groupName) {
        throw new Error(`Unidad ${purchaseUnit.name} no compatible con base ${baseUnit.name}.`);
      }

      // Conversión: cantidad comprada -> cantidad base
      const quantityBase = (Number(quantity) * Number(purchaseUnit.factorToBase)) / Number(baseUnit.factorToBase);
      const lineTotal = Number(quantity) * Number(unitPrice);
      purchaseTotal += lineTotal;

      await PurchaseItem.create(
        {
          purchaseId: purchase.id,
          productId,
          unitId,
          quantity,
          quantityBase,
          expiryDate: item.expiryDate || null,
          unitPrice,
          lineTotal,
        },
        { transaction: t }
      );

      // Costo promedio ponderado
      const currentStock = Number(product.stockBase || 0);
      const currentAvg = Number(product.avgCostBase || 0);
      const incomingCostBase = lineTotal / quantityBase;
      const newStock = currentStock + quantityBase;
      const newAvg =
        newStock > 0
          ? (currentStock * currentAvg + quantityBase * incomingCostBase) / newStock
          : incomingCostBase;

      await product.update(
        { stockBase: newStock, avgCostBase: newAvg },
        { transaction: t }
      );

      await StockMovement.create(
        {
          productId,
          type: "entrada_compra",
          quantityBase,
          unitCostBase: incomingCostBase,
          referenceType: "purchase",
          referenceId: purchase.id,
          note: `Compra ${invoiceNumber || purchase.id}`,
        },
        { transaction: t }
      );
    }

    await purchase.update({ total: purchaseTotal }, { transaction: t });
    await t.commit();
    res.status(201).json({ ok: true, purchaseId: purchase.id, total: purchaseTotal });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

export const getPurchases = async (_req, res) => {
  const data = await Purchase.findAll({
    include: [
      { model: Supplier, as: "supplier" },
      {
        model: PurchaseItem,
        include: [
          { model: StoreProduct, as: "product" },
          { model: MeasureUnit, as: "unit" },
        ],
      },
    ],
    order: [["id", "DESC"]],
  });
  res.json(data);
};

export const getStockMovements = async (_req, res) => {
  const data = await StockMovement.findAll({
    include: [{ model: StoreProduct, as: "product" }],
    order: [["id", "DESC"]],
    limit: 500,
  });
  res.json(data);
};

export const getFinanceEntries = async (_req, res) => {
  const data = await FinanceEntry.findAll({ order: [["date", "DESC"], ["id", "DESC"]] });
  res.json(data);
};

export const createFinanceEntry = async (req, res) => {
  const { type, date, amount, category, description } = req.body;
  if (!["income", "expense"].includes(type)) {
    return res.status(400).json({ message: "type debe ser income o expense." });
  }
  if (!date) return res.status(400).json({ message: "date es requerido." });
  const a = Number(amount || 0);
  if (a <= 0) return res.status(400).json({ message: "amount debe ser mayor que 0." });
  const created = await FinanceEntry.create({
    type,
    date,
    amount: a,
    category: category?.trim() || null,
    description: description?.trim() || null,
    sourceType: "manual",
  });
  res.status(201).json(created);
};

export const getFinanceSummary = async (req, res) => {
  const from = req.query.from || null;
  const to = req.query.to || null;
  const dateWhere = {};
  if (from) dateWhere[Op.gte] = from;
  if (to) dateWhere[Op.lte] = to;
  const hasRange = Object.keys(dateWhere).length > 0;

  const [manualEntries, purchases, orders] = await Promise.all([
    FinanceEntry.findAll({
      where: hasRange ? { date: dateWhere } : undefined,
      raw: true,
    }),
    Purchase.findAll({
      where: hasRange ? { date: dateWhere } : undefined,
      raw: true,
    }),
    SaleOrder.findAll({
      where: hasRange ? { date: { [Op.gte]: from || "1900-01-01", [Op.lte]: to || "2999-12-31T23:59:59" } } : undefined,
      include: [{ model: SaleOrderItem, attributes: ["quantity", "price", "lineTotal"] }],
    }),
  ]);

  const manualIncome = manualEntries
    .filter((e) => e.type === "income")
    .reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const manualExpense = manualEntries
    .filter((e) => e.type === "expense")
    .reduce((acc, e) => acc + Number(e.amount || 0), 0);
  const purchasesExpense = purchases.reduce((acc, p) => acc + Number(p.total || 0), 0);
  const salesIncome = orders.reduce((acc, o) => {
    const total = (o.tienda_order_items || []).reduce(
      (a, item) =>
        a +
        Number(
          item.lineTotal ??
            Number(item.quantity || 0) * Number(item.price || 0)
        ),
      0
    );
    return acc + total;
  }, 0);

  const totalIncome = manualIncome + salesIncome;
  const totalExpense = manualExpense + purchasesExpense;

  res.json({
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    breakdown: {
      salesIncome,
      manualIncome,
      purchasesExpense,
      manualExpense,
    },
  });
};

export const openProductBoxes = async (req, res) => {
  const { boxProductId, unitProductId, unitsPerBox, boxesToOpen = 1 } = req.body;
  const units = Number(unitsPerBox || 0);
  const boxes = Number(boxesToOpen || 0);
  if (!boxProductId || !unitProductId || units <= 0 || boxes <= 0) {
    return res.status(400).json({ message: "boxProductId, unitProductId, unitsPerBox y boxesToOpen son requeridos." });
  }

  const t = await sequelize.transaction();
  try {
    const boxProduct = await StoreProduct.findByPk(Number(boxProductId), { transaction: t });
    const unitProduct = await StoreProduct.findByPk(Number(unitProductId), { transaction: t });
    if (!boxProduct || !unitProduct) throw new Error("Producto caja o unidad no encontrado.");
    if (Number(boxProduct.stockBase || 0) < boxes) throw new Error("No hay cajas suficientes para abrir.");

    const unitQty = boxes * units;
    await boxProduct.update({ stockBase: Number(boxProduct.stockBase || 0) - boxes }, { transaction: t });
    await unitProduct.update({ stockBase: Number(unitProduct.stockBase || 0) + unitQty }, { transaction: t });

    await StockMovement.create(
      {
        productId: boxProduct.id,
        type: "ajuste_salida",
        quantityBase: boxes,
        unitCostBase: Number(boxProduct.avgCostBase || 0),
        referenceType: "open_box",
        referenceId: unitProduct.id,
        note: `Abrir ${boxes} caja(s) -> ${unitQty} unidad(es) de ${unitProduct.name}`,
      },
      { transaction: t }
    );
    await StockMovement.create(
      {
        productId: unitProduct.id,
        type: "ajuste_entrada",
        quantityBase: unitQty,
        unitCostBase: Number(unitProduct.avgCostBase || 0),
        referenceType: "open_box",
        referenceId: boxProduct.id,
        note: `Ingreso por abrir ${boxes} caja(s) de ${boxProduct.name}`,
      },
      { transaction: t }
    );

    await t.commit();
    res.status(201).json({ ok: true, boxProductId: boxProduct.id, unitProductId: unitProduct.id, boxesOpened: boxes, unitsAdded: unitQty });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

export const getExpiryAlerts = async (req, res) => {
  const days = Math.max(1, Number(req.query.days || 30));
  const today = new Date();
  const limitDate = new Date();
  limitDate.setDate(limitDate.getDate() + days);

  const rows = await PurchaseItem.findAll({
    where: {
      expiryDate: {
        [Op.not]: null,
        [Op.lte]: limitDate,
      },
    },
    include: [{ model: StoreProduct, as: "product", attributes: ["id", "name", "sizeLabel"] }],
    order: [["expiryDate", "ASC"]],
  });

  const data = rows.map((r) => {
    const d = new Date(r.expiryDate);
    const diffDays = Math.ceil((d.getTime() - today.getTime()) / 86400000);
    return {
      id: r.id,
      productId: r.productId,
      productName: r.product?.name || "—",
      sizeLabel: r.product?.sizeLabel || null,
      expiryDate: r.expiryDate,
      quantityBase: Number(r.quantityBase || 0),
      status: diffDays < 0 ? "vencido" : diffDays <= 7 ? "critico" : "proximo",
      remainingDays: diffDays,
    };
  });
  res.json(data);
};

export const getCustomers = async (_req, res) => {
  const data = await Customer.findAll({ order: [["name", "ASC"]] });
  res.json(data);
};

export const createCustomer = async (req, res) => {
  const { name, ci, nickname, email, phone, secondaryPhone, address, city, reference, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Nombre de cliente requerido." });
  const created = await Customer.create({
    name: name.trim(),
    ci: ci?.trim() || null,
    nickname: nickname?.trim() || null,
    email: email?.trim() || null,
    phone: phone || null,
    secondaryPhone: secondaryPhone || null,
    address: address || null,
    city: city?.trim() || null,
    reference: reference?.trim() || null,
    notes: notes?.trim() || null,
  });
  res.status(201).json(created);
};

export const updateCustomer = async (req, res) => {
  const { id } = req.params;
  const customer = await Customer.findByPk(id);
  if (!customer) return res.status(404).json({ message: "Cliente no encontrado." });
  const { name, ci, nickname, email, phone, secondaryPhone, address, city, reference, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Nombre de cliente requerido." });
  await customer.update({
    name: name.trim(),
    ci: ci?.trim() || null,
    nickname: nickname?.trim() || null,
    email: email?.trim() || null,
    phone: phone || null,
    secondaryPhone: secondaryPhone || null,
    address: address || null,
    city: city?.trim() || null,
    reference: reference?.trim() || null,
    notes: notes?.trim() || null,
  });
  res.json(customer);
};

export const getOrders = async (_req, res) => {
  const data = await SaleOrder.findAll({
    include: [
      { model: Customer, as: "customer" },
      { model: SaleOrderItem, include: [{ model: StoreProduct, as: "product" }] },
    ],
    order: [["date", "DESC"]],
  });
  res.json(data);
};

export const createOrder = async (req, res) => {
  const { customerId, date, notes, items = [] } = req.body;
  if (!customerId || !date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "customerId, date e items son requeridos." });
  }
  const t = await sequelize.transaction();
  try {
    const order = await SaleOrder.create(
      { customerId, date: new Date(date), notes: notes || null, status: "pendiente" },
      { transaction: t }
    );
    for (const row of items) {
      const product = await StoreProduct.findByPk(row.productId, { transaction: t });
      if (!product) throw new Error("Producto no encontrado.");
      const qty = Number(row.quantity || 0);
      if (qty <= 0) throw new Error("Cantidad inválida.");
      const wholesaleMin = Number(product.wholesaleMinQty || 0);
      const defaultPrice =
        wholesaleMin > 0 && qty >= wholesaleMin
          ? Number(product.wholesalePrice || product.salePrice || 0)
          : Number(product.salePrice || 0);
      const price = Number(row.price || defaultPrice);
      const taxType = normalizeTaxType(product.taxType);
      const taxRate = normalizeTaxRate(product.taxRate, taxType);
      const breakdown = calculateTaxBreakdown({
        quantity: qty,
        unitPrice: price,
        taxType,
        taxRate,
      });
      await SaleOrderItem.create(
        {
          orderId: order.id,
          productId: product.id,
          quantity: qty,
          price,
          taxType,
          taxRate,
          taxBase: breakdown.taxBase,
          taxAmount: breakdown.taxAmount,
          lineTotal: breakdown.lineTotal,
          deliveredAt: null,
          paidAt: null,
        },
        { transaction: t }
      );
    }
    await t.commit();
    res.status(201).json({ ok: true, orderId: order.id });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

export const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { customerId, date, notes, status } = req.body;
  const order = await SaleOrder.findByPk(id);
  if (!order) return res.status(404).json({ message: "Pedido no encontrado." });
  if (!customerId || !date) {
    return res.status(400).json({ message: "customerId y date son requeridos." });
  }
  await order.update({
    customerId: Number(customerId),
    date: new Date(date),
    notes: notes || null,
    status: status || order.status,
  });
  res.json(order);
};

export const getSupplierOrders = async (_req, res) => {
  const data = await SupplierOrder.findAll({
    include: [
      { model: Supplier, as: "supplier" },
      { model: SupplierOrderItem, include: [{ model: StoreProduct, as: "product" }] },
    ],
    order: [["date", "DESC"]],
  });
  res.json(data);
};

export const createSupplierOrder = async (req, res) => {
  const { supplierId, date, notes, items = [] } = req.body;
  if (!supplierId || !date || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "supplierId, date e items son requeridos." });
  }
  const t = await sequelize.transaction();
  try {
    const order = await SupplierOrder.create(
      { supplierId, date: new Date(date), notes: notes || null, status: "pendiente" },
      { transaction: t }
    );
    for (const row of items) {
      if (!row.productId || Number(row.quantity || 0) <= 0) throw new Error("Item inválido.");
      await SupplierOrderItem.create(
        {
          orderId: order.id,
          productId: Number(row.productId),
          quantity: Number(row.quantity),
          unitPrice: Number(row.unitPrice || 0),
        },
        { transaction: t }
      );
    }
    await t.commit();
    res.status(201).json({ ok: true, orderId: order.id });
  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
};

export const updateSupplierOrder = async (req, res) => {
  const { id } = req.params;
  const { supplierId, date, notes, status } = req.body;
  const order = await SupplierOrder.findByPk(id);
  if (!order) return res.status(404).json({ message: "Pedido proveedor no encontrado." });
  await order.update({
    supplierId: Number(supplierId || order.supplierId),
    date: date ? new Date(date) : order.date,
    notes: notes ?? order.notes,
    status: status || order.status,
  });
  res.json(order);
};
