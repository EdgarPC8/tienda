import { Op } from "sequelize";
import { sequelize } from "../../database/connection.js";
import { TaskPlan, TaskItem } from "../../models/Tasks.js";
import { Account } from "../../models/Account.js";
import { Users } from "../../models/Users.js";
import { Roles } from "../../models/Roles.js";
import { InventoryProduct, InventoryMovement } from "../../models/Inventory.js";
import { Notifications } from "../../models/Notifications.js";
import { sendNotificationToUser } from "../../sockets/notificationSocket.js";
import { notifyOk, notifyFail } from "../../services/notifyRaptorSolutions.js";

const ADMIN_ROLES = new Set(["Administrador", "Programador"]);
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
    return {
      title: row.title.trim(),
      description: row.description?.trim() || null,
      assignedUserId,
      status: "pending",
      priority: Number(row.priority || idx || 0),
      dueDate: row.dueDate || null,
      actionType: row.actionType === "open_box" ? "open_box" : "none",
      actionPayload: payload ? JSON.stringify(payload) : null,
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
    notifyFail("task_plan.delete_failed", "No se puede eliminar un plan publicado", {
      req,
      httpStatus: 400,
      extra: { planId: id },
    });
    return res.status(400).json({
      message: "No se puede eliminar un plan publicado. Ciérralo primero o deja de usarlo.",
    });
  }
  await TaskItem.destroy({ where: { planId: plan.id } });
  await plan.destroy();
  notifyOk("task_plan.deleted", `Plan tareas #${id}`, { planId: Number(id) });
  res.json({ ok: true, planId: Number(id) });
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
  const nextStatus = ["pending", "in_progress", "done", "blocked"].includes(String(status))
    ? String(status)
    : item.status;
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
