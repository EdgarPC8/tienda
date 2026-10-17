import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { TaskPlan, TaskItem } from "../../models/Tasks.js";
import { Account } from "../../models/Account.js";
import { Users } from "../../models/Users.js";
import { Roles } from "../../models/Roles.js";
import { InventoryProduct, InventoryMovement } from "../../models/Inventory.js";
import { getStoreStockQty } from "../../services/storeStockService.js";
import {
  applyProductionPlan,
  formatGrams,
  packagingOpenEnabled,
  parseProductionQuantity,
  planProduction,
  ProductionInputError,
} from "../../services/productionGramsService.js";
import { Notifications } from "../../models/Notifications.js";
import { sendNotificationToUser } from "../../sockets/notificationSocket.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const ADMIN_ROLES = new Set(["Administrador", "Propietario", "Programador"]);
const TASK_STATUS_PRIORITY = { pending: 0, in_progress: 1, blocked: 2, done: 3 };

const isAdminRole = (req) => ADMIN_ROLES.has(String(req?.user?.loginRol || ""));
const todayISO = () => new Date().toISOString().slice(0, 10);

const parseActionPayload = (item) => {
  if (!item?.actionPayload) return null;
  try {
    return JSON.parse(item.actionPayload);
  } catch {
    return null;
  }
};

let produceActionReady = null;
async function ensureProduceActionType() {
  if (produceActionReady) return produceActionReady;
  produceActionReady = (async () => {
    const rawName = TaskItem.getTableName();
    const table = typeof rawName === "string" ? rawName : rawName.tableName;
    const [cols] = await sequelize.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'actionType'`);
    const type = String(cols?.[0]?.Type || "");
    if (type.includes("produce")) return;
    await sequelize.query(
      `ALTER TABLE \`${table}\` MODIFY \`actionType\` ENUM('none','open_box','produce') NOT NULL DEFAULT 'none'`,
    );
  })().catch((error) => {
    produceActionReady = null;
    throw error;
  });
  return produceActionReady;
}

async function openBoxForTaskPayload(payload, t, taskItemId) {
  const boxProductId = Number(payload?.boxProductId);
  const unitProductId = Number(payload?.unitProductId);
  const unitsPerBox = Number(payload?.unitsPerBox || 0);
  const boxesToOpen = Number(payload?.boxesToOpen || 1);
  if (!boxProductId || !unitProductId || unitsPerBox <= 0 || boxesToOpen <= 0) {
    throw new Error("La tarea no tiene un payload válido para abrir caja.");
  }
  const boxProduct = await InventoryProduct.findByPk(boxProductId, {
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  const unitProduct = await InventoryProduct.findByPk(unitProductId, {
    transaction: t,
    lock: t.LOCK.UPDATE,
  });
  if (!boxProduct || !unitProduct) throw new Error("Producto caja o unidad no encontrado.");
  if (Number(boxProduct.stock || 0) < boxesToOpen) {
    throw new Error("No hay cajas suficientes para abrir.");
  }

  const unitQty = boxesToOpen * unitsPerBox;
  boxProduct.stock = Number(boxProduct.stock || 0) - boxesToOpen;
  unitProduct.stock = Number(unitProduct.stock || 0) + unitQty;
  await boxProduct.save({ transaction: t });
  await unitProduct.save({ transaction: t });

  await InventoryMovement.create(
    {
      productId: boxProduct.id,
      quantity: boxesToOpen,
      type: "salida",
      reason: "SALIDA_OTRA",
      referenceType: "task_open_box",
      referenceId: taskItemId,
      description: `[TAREA] Abrir ${boxesToOpen} caja(s) -> ${unitQty} unidad(es) de ${unitProduct.name}`,
    },
    { transaction: t },
  );
  await InventoryMovement.create(
    {
      productId: unitProduct.id,
      quantity: unitQty,
      type: "entrada",
      reason: "ENTRADA_OTRA",
      referenceType: "task_open_box",
      referenceId: taskItemId,
      description: `[TAREA] Ingreso por abrir ${boxesToOpen} caja(s) de ${boxProduct.name}`,
    },
    { transaction: t },
  );
  return { boxesOpened: boxesToOpen, unitsAdded: unitQty };
}

export const getTaskAssignees = async (req, res) => {
  if (!isAdminRole(req)) return res.status(403).json({ message: "No autorizado." });
  const rows = await Account.findAll({
    include: [
      {
        model: Users,
        as: "user",
        attributes: ["id", "firstName", "secondName", "firstLastName", "secondLastName"],
      },
      {
        model: Roles,
        as: "roles",
        attributes: ["name"],
        through: { attributes: [] },
      },
    ],
    order: [["id", "ASC"]],
  });
  const data = rows.map((a) => {
    const u = a.user || {};
    const fullName = [u.firstName, u.secondName, u.firstLastName, u.secondLastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    return {
      accountId: a.id,
      userId: a.userId,
      username: a.username,
      fullName: fullName || a.username || `Usuario ${a.userId}`,
      roles: (a.roles || []).map((r) => r.name),
    };
  });
  res.json(data);
};

export const createTaskPlan = async (req, res) => {
  if (!isAdminRole(req)) {
    notifyFail("task_plan.create_failed", "No autorizado", { req, httpStatus: 403 });
    return res.status(403).json({ message: "No autorizado." });
  }
  const { title, description, startDate, endDate, items = [] } = req.body;
  if (!title?.trim() || !startDate || !endDate) {
    notifyFail("task_plan.create_failed", "title, startDate y endDate son requeridos", {
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: "title, startDate y endDate son requeridos." });
  }
  if (String(endDate).slice(0, 10) < String(startDate).slice(0, 10)) {
    return res.status(400).json({ message: "La fecha de fin no puede ser anterior al inicio." });
  }
  await ensureProduceActionType();
  const t = await sequelize.transaction();
  try {
    const normalized = normalizePlanItems(items);
    const plan = await TaskPlan.create(
      {
        title: title.trim(),
        description: description?.trim() || null,
        startDate,
        endDate,
        status: "draft",
        createdByUserId: Number(req.user?.userId || 0),
      },
      { transaction: t },
    );
    for (const row of normalized) {
      await TaskItem.create({ ...row, planId: plan.id }, { transaction: t });
    }
    await t.commit();
    notifyOk("task_plan.created", "Plan de tareas creado", { planId: plan.id });
    res.status(201).json({ ok: true, planId: plan.id });
  } catch (error) {
    await t.rollback();
    notifyFail("task_plan.create_failed", error.message, { error, req, httpStatus: 400 });
    res.status(400).json({ message: error.message });
  }
};

function normalizeProducePayload(raw, idx) {
  const productId = Number(raw?.productId);
  const quantity = Number(raw?.quantity);
  if (!Number.isInteger(productId) || productId <= 0 || !Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`La tarea #${idx + 1} de producción necesita un producto y una cantidad entera mayor que 0.`);
  }
  return { productId, quantity };
}

function normalizePlanItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Debes agregar al menos una tarea.");
  }
  return items.map((row, idx) => {
    const assignedUserId = Number(row.assignedUserId || 0);
    if (!row?.title?.trim() || !assignedUserId) {
      throw new Error(`La tarea #${idx + 1} requiere título y usuario asignado.`);
    }
    const payload = row.actionPayload && typeof row.actionPayload === "object" ? row.actionPayload : null;
    const actionType = row.actionType === "open_box" || row.actionType === "produce" ? row.actionType : "none";
    let actionPayload = null;
    if (actionType === "open_box") actionPayload = payload ? JSON.stringify(payload) : null;
    if (actionType === "produce") actionPayload = JSON.stringify(normalizeProducePayload(payload, idx));
    return {
      title: row.title.trim(),
      description: row.description?.trim() || null,
      assignedUserId,
      status: "pending",
      priority: Number(row.priority || idx || 0),
      dueDate: row.dueDate || null,
      actionType,
      actionPayload,
    };
  });
}

export const updateTaskPlan = async (req, res) => {
  if (!isAdminRole(req)) {
    notifyFail("task_plan.update_failed", "No autorizado", { req, httpStatus: 403 });
    return res.status(403).json({ message: "No autorizado." });
  }
  const { id } = req.params;
  const plan = await TaskPlan.findByPk(id, { include: [{ model: TaskItem, as: "items" }] });
  if (!plan) {
    notifyFail("task_plan.update_failed", `Plan #${id} no encontrado`, { req, httpStatus: 404 });
    return res.status(404).json({ message: "Plan no encontrado." });
  }
  if (plan.status !== "draft") {
    notifyFail("task_plan.update_failed", "Solo se pueden editar planes en borrador", {
      req,
      httpStatus: 400,
      extra: { planId: id },
    });
    return res.status(400).json({ message: "Solo se pueden editar planes en borrador." });
  }

  const { title, description, startDate, endDate, items } = req.body;
  if (!title?.trim() || !startDate || !endDate) {
    notifyFail("task_plan.update_failed", "title, startDate y endDate son requeridos", {
      req,
      httpStatus: 400,
    });
    return res.status(400).json({ message: "title, startDate y endDate son requeridos." });
  }
  if (String(endDate).slice(0, 10) < String(startDate).slice(0, 10)) {
    return res.status(400).json({ message: "La fecha de fin no puede ser anterior al inicio." });
  }

  await ensureProduceActionType();
  const t = await sequelize.transaction();
  try {
    const normalized = normalizePlanItems(items);
    await plan.update(
      {
        title: title.trim(),
        description: description?.trim() || null,
        startDate,
        endDate,
      },
      { transaction: t },
    );
    await TaskItem.destroy({ where: { planId: plan.id }, transaction: t });
    for (const row of normalized) {
      await TaskItem.create({ ...row, planId: plan.id }, { transaction: t });
    }
    await t.commit();
    notifyOk("task_plan.updated", `Plan tareas #${id}`, { planId: plan.id });
    res.json({ ok: true, planId: plan.id });
  } catch (error) {
    await t.rollback();
    notifyFail("task_plan.update_failed", error.message, {
      error,
      req,
      httpStatus: 400,
      extra: { planId: id },
    });
    res.status(400).json({ message: error.message });
  }
};

export const deleteTaskPlan = async (req, res) => {
  if (!isAdminRole(req)) {
    notifyFail("task_plan.delete_failed", "No autorizado", { req, httpStatus: 403 });
    return res.status(403).json({ message: "No autorizado." });
  }
  const { id } = req.params;
  const plan = await TaskPlan.findByPk(id);
  if (!plan) {
    notifyFail("task_plan.delete_failed", `Plan #${id} no encontrado`, { req, httpStatus: 404 });
    return res.status(404).json({ message: "Plan no encontrado." });
  }
  if (plan.status === "published") {
    // Permitir borrar planes publicados (p. ej. auditorías / limpieza).
  }
  await TaskItem.destroy({ where: { planId: plan.id } });
  await plan.destroy();
  notifyOk("task_plan.deleted", `Plan tareas #${id}`, { planId: Number(id) });
  res.json({ ok: true, planId: Number(id) });
};

export const closeTaskPlan = async (req, res) => {
  if (!isAdminRole(req)) {
    notifyFail("task_plan.close_failed", "No autorizado", { req, httpStatus: 403 });
    return res.status(403).json({ message: "No autorizado." });
  }
  const { id } = req.params;
  const plan = await TaskPlan.findByPk(id);
  if (!plan) {
    notifyFail("task_plan.close_failed", `Plan #${id} no encontrado`, { req, httpStatus: 404 });
    return res.status(404).json({ message: "Plan no encontrado." });
  }
  if (plan.status === "draft") {
    return res.status(400).json({ message: "Publicá el plan antes de cerrarlo." });
  }
  if (plan.status === "closed") {
    return res.json({ ok: true, planId: Number(id), status: "closed" });
  }
  await plan.update({ status: "closed" });
  notifyOk("task_plan.closed", `Plan cerrado #${id}`, { planId: Number(id) });
  res.json({ ok: true, planId: Number(id), status: "closed" });
};

export const deleteTaskItem = async (req, res) => {
  if (!isAdminRole(req)) {
    notifyFail("task_item.delete_failed", "No autorizado", { req, httpStatus: 403 });
    return res.status(403).json({ message: "No autorizado." });
  }
  const { id } = req.params;
  const item = await TaskItem.findByPk(id, { include: [{ model: TaskPlan, as: "plan" }] });
  if (!item) {
    notifyFail("task_item.delete_failed", `Tarea #${id} no encontrada`, { req, httpStatus: 404 });
    return res.status(404).json({ message: "Tarea no encontrada." });
  }
  if (item.plan?.status !== "draft") {
    notifyFail("task_item.delete_failed", "Solo se pueden eliminar tareas de planes en borrador", {
      req,
      httpStatus: 400,
      extra: { itemId: id },
    });
    return res.status(400).json({ message: "Solo se pueden eliminar tareas de planes en borrador." });
  }
  await item.destroy();
  notifyOk("task_item.deleted", `Tarea #${id}`, { itemId: Number(id) });
  res.json({ ok: true, itemId: Number(id) });
};

export const publishTaskPlan = async (req, res) => {
  if (!isAdminRole(req)) {
    notifyFail("task_plan.publish_failed", "No autorizado", { req, httpStatus: 403 });
    return res.status(403).json({ message: "No autorizado." });
  }
  const { id } = req.params;
  const plan = await TaskPlan.findByPk(id, { include: [{ model: TaskItem, as: "items" }] });
  if (!plan) {
    notifyFail("task_plan.publish_failed", `Plan #${id} no encontrado`, { req, httpStatus: 404 });
    return res.status(404).json({ message: "Plan no encontrado." });
  }
  if ((plan.items || []).length === 0) {
    notifyFail("task_plan.publish_failed", "El plan no tiene tareas", {
      req,
      httpStatus: 400,
      extra: { planId: id },
    });
    return res.status(400).json({ message: "El plan no tiene tareas." });
  }
  await plan.update({ status: "published", publishedAt: new Date() });

  const assignedUsers = [...new Set((plan.items || []).map((i) => Number(i.assignedUserId)).filter(Boolean))];
  const created = await Promise.all(
    assignedUsers.map((userId) =>
      Notifications.create({
        userId,
        type: "reminder",
        title: "Nuevo plan de tareas",
        message: `Se publicó el plan "${plan.title}" (${plan.startDate} a ${plan.endDate}).`,
        link: "/tareas",
      }),
    ),
  );
  created.forEach((n) => sendNotificationToUser(n.userId, n.toJSON()));
  notifyOk("task_plan.published", `Plan publicado #${id}`, {
    planId: plan.id,
    notifiedUsers: assignedUsers.length,
  });
  res.json({ ok: true, planId: plan.id, notifiedUsers: assignedUsers.length });
};

export const getTaskPlans = async (req, res) => {
  const include = [
    {
      model: TaskItem,
      as: "items",
      include: [
        {
          model: Users,
          as: "assignedUser",
          attributes: ["id", "firstName", "secondName", "firstLastName", "secondLastName"],
        },
      ],
    },
  ];
  let where = {};
  if (!isAdminRole(req)) {
    where = { status: { [Op.in]: ["published", "closed"] } };
  }
  const plans = await TaskPlan.findAll({
    where,
    include,
    order: [
      ["startDate", "DESC"],
      [{ model: TaskItem, as: "items" }, "priority", "ASC"],
      [{ model: TaskItem, as: "items" }, "id", "ASC"],
    ],
  });
  res.json(plans);
};

export const getMyTaskItems = async (req, res) => {
  const userId = Number(req.user?.userId || 0);
  if (!userId) return res.status(400).json({ message: "Usuario inválido." });
  const onlyActive = String(req.query.active || "1") !== "0";
  const wherePlan = onlyActive
    ? {
        status: { [Op.in]: ["published"] },
        startDate: { [Op.lte]: todayISO() },
        endDate: { [Op.gte]: todayISO() },
      }
    : { status: { [Op.in]: ["published", "closed"] } };
  const items = await TaskItem.findAll({
    where: { assignedUserId: userId },
    include: [{ model: TaskPlan, as: "plan", where: wherePlan }],
    order: [["status", "ASC"], ["priority", "ASC"], ["id", "ASC"]],
  });
  items.sort((a, b) => {
    const wa = TASK_STATUS_PRIORITY[a.status] ?? 99;
    const wb = TASK_STATUS_PRIORITY[b.status] ?? 99;
    if (wa !== wb) return wa - wb;
    return Number(a.priority || 0) - Number(b.priority || 0);
  });
  res.json(items);
};

export const updateTaskItemStatus = async (req, res) => {
  const { id } = req.params;
  const { status, resultNote } = req.body;
  const item = await TaskItem.findByPk(id);
  if (!item) {
    notifyFail("task_item.status_update_failed", `Tarea #${id} no encontrada`, {
      req,
      httpStatus: 404,
    });
    return res.status(404).json({ message: "Tarea no encontrada." });
  }
  const userId = Number(req.user?.userId || 0);
  if (!isAdminRole(req) && Number(item.assignedUserId) !== userId) {
    notifyFail("task_item.status_update_failed", "No autorizado para esta tarea", {
      req,
      httpStatus: 403,
      extra: { itemId: id },
    });
    return res.status(403).json({ message: "No autorizado para esta tarea." });
  }
  const allowedStatus = ["pending", "in_progress", "done", "blocked"];
  if (status != null && !allowedStatus.includes(String(status))) {
    return res.status(400).json({ message: "Estado de tarea inválido" });
  }
  const nextStatus = allowedStatus.includes(String(status))
    ? String(status)
    : item.status;
  if (item.actionType === "produce" && nextStatus === "done") {
    return res.status(400).json({
      message: "Esta tarea se cumple registrando la producción, no solo con el check.",
    });
  }
  await item.update({
    status: nextStatus,
    resultNote: resultNote ?? item.resultNote,
    checkedAt: nextStatus === "done" ? new Date() : null,
    checkedByUserId: nextStatus === "done" ? userId || item.checkedByUserId : null,
  });
  notifyOk("task_item.status_updated", `Estado tarea #${id}`, { itemId: id, status: nextStatus });
  res.json(item);
};

export const executeTaskOpenBox = async (req, res) => {
  const { id } = req.params;
  const item = await TaskItem.findByPk(id);
  if (!item) {
    notifyFail("task_item.open_box_failed", `Tarea #${id} no encontrada`, { req, httpStatus: 404 });
    return res.status(404).json({ message: "Tarea no encontrada." });
  }
  const userId = Number(req.user?.userId || 0);
  if (!isAdminRole(req) && Number(item.assignedUserId) !== userId) {
    notifyFail("task_item.open_box_failed", "No autorizado para esta tarea", {
      req,
      httpStatus: 403,
      extra: { itemId: id },
    });
    return res.status(403).json({ message: "No autorizado para esta tarea." });
  }
  if (item.actionType !== "open_box") {
    notifyFail("task_item.open_box_failed", "Esta tarea no tiene acción de abrir caja", {
      req,
      httpStatus: 400,
      extra: { itemId: id },
    });
    return res.status(400).json({ message: "Esta tarea no tiene acción de abrir caja." });
  }
  const payload = parseActionPayload(item);
  const t = await sequelize.transaction();
  try {
    const exec = await openBoxForTaskPayload(payload, t, item.id);
    await item.update(
      {
        status: "done",
        checkedAt: new Date(),
        checkedByUserId: userId || item.assignedUserId,
        resultNote: `[AUTO] Abrir caja ejecutado: ${exec.boxesOpened} caja(s), ${exec.unitsAdded} unidades.`,
      },
      { transaction: t },
    );
    await t.commit();
    notifyOk("task_item.open_box_executed", `Apertura caja tarea #${id}`, {
      taskItemId: item.id,
      ...exec,
    });
    res.json({ ok: true, taskItemId: item.id, ...exec });
  } catch (error) {
    await t.rollback();
    notifyFail("task_item.open_box_failed", error.message, {
      error,
      req,
      httpStatus: 400,
      extra: { itemId: id },
    });
    res.status(400).json({ message: error.message });
  }
};

async function loadProduceTask(req, id) {
  const item = await TaskItem.findByPk(id);
  if (!item) {
    const error = new Error("Tarea no encontrada.");
    error.status = 404;
    throw error;
  }
  const userId = Number(req.user?.userId || 0);
  if (!isAdminRole(req) && Number(item.assignedUserId) !== userId) {
    const error = new Error("No autorizado para esta tarea.");
    error.status = 403;
    throw error;
  }
  if (item.actionType !== "produce") {
    const error = new Error("Esta tarea no es de producción.");
    error.status = 400;
    throw error;
  }
  const payload = parseActionPayload(item);
  const productId = Number(payload?.productId);
  const quantity = parseProductionQuantity(payload?.quantity);
  return { item, productId, quantity, userId };
}

export const previewTaskProduction = async (req, res) => {
  try {
    const { item, productId, quantity } = await loadProduceTask(req, req.params.id);
    if (item.status === "done") {
      return res.status(400).json({ message: "Esta producción ya fue registrada." });
    }
    const plan = await planProduction(productId, quantity);
    res.json(plan);
  } catch (error) {
    const status = error instanceof ProductionInputError ? error.status : error.status || 400;
    res.status(status).json({ message: error.message || "No se pudo simular la producción." });
  }
};

export const executeTaskProduction = async (req, res) => {
  try {
    const { item, productId, quantity, userId } = await loadProduceTask(req, req.params.id);
    if (item.status === "done") {
      return res.status(400).json({ message: "Esta producción ya fue registrada." });
    }
    if (req.body?.mermas || req.body?.autocompletarStock || req.body?.merma || req.body?.autocompletar) {
      return res.status(400).json({ message: "Desde la tarea solo se puede abrir el empaque indicado." });
    }
    const abrirEmpaques = Array.isArray(req.body?.abrirEmpaques) ? req.body.abrirEmpaques : [];
    if (abrirEmpaques.length && !packagingOpenEnabled()) {
      return res.status(400).json({ message: "La apertura de empaques está desactivada en Configuración" });
    }

    const opId = `PF-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
    const movementDate = new Date();
    const referenceType = `produccion_op:${opId}`;
    const resumen = await sequelize.transaction(async (t) => {
      const plan = await planProduction(productId, quantity, { transaction: t });
      const mov = async ({ productId: pid, type, reason, quantity: qty, description, price }) =>
        InventoryMovement.create(
          {
            productId: pid,
            type,
            reason,
            quantity: Number(qty),
            description,
            price: price ?? null,
            referenceType,
            referenceId: null,
            createdBy: req.user?.accountId || null,
            date: movementDate,
          },
          { transaction: t },
        );
      await applyProductionPlan(plan, {
        transaction: t,
        allowAutocomplete: false,
        opId,
        mov,
        abrirEmpaques,
        mermas: [],
        referenceType,
        accountId: req.user?.accountId || null,
        movementDate,
      });
      const stockProducto = Number(await getStoreStockQty(plan.storeId, plan.id, { transaction: t })) || 0;
      const insumos = [];
      for (const node of plan.requiere || []) {
        if (node?.kind !== "gramos" || !node.generico) continue;
        const gramos = Number(await getStoreStockQty(plan.storeId, node.id, { transaction: t })) || 0;
        insumos.push({ id: node.id, nombre: node.producto, gramos });
      }
      const queda = insumos.length
        ? insumos.map((row) => `${row.nombre}: quedan ${formatGrams(row.gramos)} g`).join(". ")
        : "Sin insumo genérico en la receta.";
      const resultNote = `Salieron ${plan.cantidadDeseada} de ${plan.producto}. Ahora hay ${formatGrams(stockProducto)}. ${queda}`;
      await item.update(
        {
          status: "done",
          checkedAt: new Date(),
          checkedByUserId: userId || item.assignedUserId,
          resultNote,
        },
        { transaction: t },
      );
      return {
        opId,
        producto: plan.producto,
        cantidad: plan.cantidadDeseada,
        stockProducto,
        insumos,
        resultNote,
        advertencias: plan.advertencias || [],
      };
    });
    notifyOk("task_item.production_executed", `Producción tarea #${item.id}`, {
      taskItemId: item.id,
      opId: resumen.opId,
    });
    res.status(201).json({ ok: true, taskItemId: item.id, ...resumen });
  } catch (error) {
    const status = error instanceof ProductionInputError ? error.status : error.status || 400;
    notifyFail("task_item.production_failed", error.message, {
      error,
      req,
      httpStatus: status,
      extra: { itemId: req.params.id },
    });
    res.status(status).json({ message: error.message || "No se pudo registrar la producción." });
  }
};
