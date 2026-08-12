import { Op } from "sequelize";
import { Notifications } from "../models/Notifications.js";
import {
  NotificationProgram,
  NotificationDispatchLog,
} from "../models/NotificationProgram.js";
import { Users } from "../models/Users.js";
import { Account } from "../models/Account.js";
import { Roles } from "../models/Roles.js";
import { InventoryProduct } from "../models/Inventory.js";
import { sendNotificationToUser } from "../sockets/notificationSocket.js";
import { getAppTimezone, getZonedParts, nowApp } from "../utils/appDateTime.js";

const ADMIN_ROLE_NAMES = ["Administrador", "Programador"];

function nowInBusinessTz() {
  return nowApp();
}

function todayDateOnly() {
  const p = getZonedParts(nowApp(), getAppTimezone());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

function currentHm() {
  const p = getZonedParts(nowApp(), getAppTimezone());
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function parseRoleIds(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map(Number).filter((n) => Number.isFinite(n));
  if (typeof raw === "string") {
    try {
      const v = JSON.parse(raw);
      return Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function createAndPushNotification({
  userId,
  type = "info",
  title,
  message,
  link = null,
  sourceKey = null,
}) {
  const existing =
    sourceKey &&
    (await Notifications.findOne({
      where: {
        userId,
        sourceKey,
        deleted: false,
        createdAt: { [Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      order: [["createdAt", "DESC"]],
    }));

  if (existing) return existing;

  const row = await Notifications.create({
    userId,
    type,
    title,
    message,
    link,
    sourceKey,
  });
  const json = row.toJSON();
  sendNotificationToUser(userId, json);
  return row;
}

export async function resolveTargetUserIds(program) {
  if (program.handlerType === "stock_min" && program.targetType !== "by_role") {
    return resolveAdminUserIds();
  }

  if (program.targetType === "all_users") {
    const users = await Users.findAll({ attributes: ["id"] });
    return users.map((u) => u.id);
  }

  const roleIds = parseRoleIds(program.targetRoleIds);
  if (!roleIds.length) return [];

  const accounts = await Account.findAll({
    attributes: ["userId"],
    include: [
      {
        model: Roles,
        where: { id: { [Op.in]: roleIds } },
        attributes: [],
        through: { attributes: [] },
      },
    ],
  });

  return [...new Set(accounts.map((a) => a.userId).filter(Boolean))];
}

export async function resolveAdminUserIds() {
  const accounts = await Account.findAll({
    attributes: ["userId"],
    include: [
      {
        model: Roles,
        where: { name: { [Op.in]: ADMIN_ROLE_NAMES } },
        attributes: [],
        through: { attributes: [] },
      },
    ],
  });
  return [...new Set(accounts.map((a) => a.userId).filter(Boolean))];
}

async function wasDispatchedToday(programId, userId) {
  const count = await NotificationDispatchLog.count({
    where: { programId, userId, dispatchDate: todayDateOnly() },
  });
  return count > 0;
}

async function markDispatched(programId, userId) {
  await NotificationDispatchLog.findOrCreate({
    where: { programId, userId, dispatchDate: todayDateOnly() },
    defaults: { programId, userId, dispatchDate: todayDateOnly() },
  });
}

export async function dispatchProgramToUsers(program, { force = false } = {}) {
  const userIds = await resolveTargetUserIds(program);
  if (!userIds.length) return { sent: 0, userIds: [] };

  if (program.handlerType === "stock_min") {
    const sent = await runStockMinimumCheck(userIds);
    await program.update({ lastRunAt: new Date() });
    return { sent, userIds, mode: "stock_min" };
  }

  let sent = 0;
  for (const userId of userIds) {
    if (!force && program.scheduleType === "daily") {
      const already = await wasDispatchedToday(program.id, userId);
      if (already) continue;
    }

    await createAndPushNotification({
      userId,
      type: program.notificationType || "info",
      title: program.title,
      message: program.message,
      link: program.link,
      sourceKey: force ? null : `program:${program.code}:${todayDateOnly()}:${userId}`,
    });

    if (program.scheduleType === "daily") {
      await markDispatched(program.id, userId);
    }
    sent += 1;
  }

  await program.update({ lastRunAt: new Date() });
  return { sent, userIds, mode: "static" };
}

export async function runStockMinimumCheck(targetUserIds = null) {
  const userIds = targetUserIds?.length ? targetUserIds : await resolveAdminUserIds();
  if (!userIds.length) return 0;

  const products = await InventoryProduct.findAll({
    where: {
      isActive: true,
      minStock: { [Op.gt]: 0 },
    },
    attributes: ["id", "name", "stock", "minStock"],
  });

  let sent = 0;
  for (const p of products) {
    const stock = Number(p.stock ?? 0);
    const minStock = Number(p.minStock ?? 0);
    if (stock > minStock) continue;

    const title = "Stock mínimo alcanzado";
    const message = `${p.name}: quedan ${stock} unidades (mínimo ${minStock}).`;
    const sourceKey = `stock_min:${p.id}`;

    for (const userId of userIds) {
      const row = await createAndPushNotification({
        userId,
        type: "alert",
        title,
        message,
        link: "/inventory/products",
        sourceKey,
      });
      if (row) sent += 1;
    }
  }
  return sent;
}

export async function onInventoryStockChanged(productId) {
  const p = await InventoryProduct.findByPk(productId, {
    attributes: ["id", "name", "stock", "minStock", "isActive"],
  });
  if (!p?.isActive) return;

  const stock = Number(p.stock ?? 0);
  const minStock = Number(p.minStock ?? 0);
  if (minStock <= 0 || stock > minStock) return;

  const program = await NotificationProgram.findOne({
    where: { code: "SYSTEM_STOCK_MIN", active: true },
  });
  const userIds = program
    ? await resolveTargetUserIds(program)
    : await resolveAdminUserIds();

  for (const userId of userIds) {
    await createAndPushNotification({
      userId,
      type: "alert",
      title: "Stock mínimo alcanzado",
      message: `${p.name}: quedan ${stock} unidades (mínimo ${minStock}).`,
      link: "/inventory/products",
      sourceKey: `stock_min:${p.id}`,
    });
  }
}

export async function runScheduledNotificationPrograms() {
  const hm = currentHm();
  const programs = await NotificationProgram.findAll({ where: { active: true } });

  for (const program of programs) {
    try {
      if (program.scheduleType === "daily") {
        const target = (program.scheduleTime || "08:00").slice(0, 5);
        if (target !== hm) continue;
        await dispatchProgramToUsers(program);
      } else if (program.scheduleType === "interval") {
        const mins = Number(program.scheduleIntervalMinutes) || 60;
        const last = program.lastRunAt ? new Date(program.lastRunAt).getTime() : 0;
        if (Date.now() - last < mins * 60 * 1000) continue;
        await dispatchProgramToUsers(program);
      }
    } catch (err) {
      console.error(`notification program ${program.code}:`, err?.message || err);
    }
  }
}

const DEFAULT_PROGRAMS = [
  {
    code: "BUENOS_DIAS",
    title: "¡Buenos días!",
    message: "Que tengas un excelente inicio de jornada. ☀️",
    link: "/inicio",
    notificationType: "info",
    scheduleType: "daily",
    scheduleTime: "07:00",
    targetType: "all_users",
    handlerType: "static",
    active: true,
  },
  {
    code: "BUENAS_TARDES",
    title: "¡Buenas tardes!",
    message: "Esperamos que tu día vaya muy bien. 🌤️",
    link: "/inicio",
    notificationType: "info",
    scheduleType: "daily",
    scheduleTime: "13:00",
    targetType: "all_users",
    handlerType: "static",
    active: true,
  },
  {
    code: "BUENAS_NOCHES",
    title: "¡Buenas noches!",
    message: "Gracias por tu trabajo hoy. Descansa pronto. 🌙",
    link: "/inicio",
    notificationType: "info",
    scheduleType: "daily",
    scheduleTime: "19:00",
    targetType: "all_users",
    handlerType: "static",
    active: true,
  },
  {
    code: "SYSTEM_STOCK_MIN",
    title: "Alerta de stock mínimo",
    message: "Revisa productos con stock en o por debajo del mínimo.",
    link: "/inventory/products",
    notificationType: "alert",
    scheduleType: "interval",
    scheduleIntervalMinutes: 60,
    targetType: "by_role",
    targetRoleIds: [],
    handlerType: "stock_min",
    active: true,
  },
];

export async function seedDefaultNotificationPrograms() {
  for (const def of DEFAULT_PROGRAMS) {
    const exists = await NotificationProgram.findOne({ where: { code: def.code } });
    if (exists) continue;
    await NotificationProgram.create(def);
  }

  const stockProg = await NotificationProgram.findOne({ where: { code: "SYSTEM_STOCK_MIN" } });
  if (stockProg && !parseRoleIds(stockProg.targetRoleIds).length) {
    const roles = await Roles.findAll({
      where: { name: { [Op.in]: ADMIN_ROLE_NAMES } },
      attributes: ["id"],
    });
    if (roles.length) {
      await stockProg.update({ targetRoleIds: roles.map((r) => r.id) });
    }
  }
}
