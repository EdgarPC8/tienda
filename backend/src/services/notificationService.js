import { Op } from "sequelize";
import { Notifications } from "../models/Notifications.js";
import {
  NotificationProgram,
  NotificationDispatchLog,
} from "../models/NotificationProgram.js";
import { Users } from "../models/Users.js";
import { Account } from "../models/Account.js";
import { Roles } from "../models/Roles.js";
import { InventoryProduct, InventoryBatch } from "../models/Inventory.js";
import { sendNotificationToUser } from "../sockets/notificationSocket.js";
import { getAppTimezone, getZonedParts, nowApp } from "../utils/appDateTime.js";
import { getAppSettingsSync } from "./appSettingsService.js";

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
  force = false,
}) {
  const existing =
    !force &&
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

function daysUntilExpiry(isoDay) {
  const day = String(isoDay || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const today = todayDateOnly();
  const start = Date.parse(`${today}T00:00:00`);
  const end = Date.parse(`${day}T00:00:00`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.round((end - start) / 86400000);
}

export async function runBatchExpiryReminders({ warnDays = 30 } = {}) {
  const settings = getAppSettingsSync();
  if (!settings?.notificationsExpiryEnabled) return 0;

  try {
    const { ensureInventoryBatchesSchema } = await import(
      "../controllers/InventoryControl/BatchController.js"
    );
    await ensureInventoryBatchesSchema();
  } catch {
    return 0;
  }

  const userIds = await resolveAdminUserIds();
  if (!userIds.length) return 0;

  const days = Math.min(90, Math.max(1, Number(warnDays) || 30));
  const rows = await InventoryBatch.findAll({
    where: {
      status: "active",
      quantityRemaining: { [Op.gt]: 0 },
    },
    include: [
      {
        model: InventoryProduct,
        as: "product",
        attributes: ["id", "name"],
      },
    ],
    order: [
      ["expiresAt", "ASC"],
      ["id", "ASC"],
    ],
    limit: 200,
  });

  const expired = [];
  const expiring = [];
  for (const row of rows) {
    const plain = typeof row.toJSON === "function" ? row.toJSON() : row;
    const remaining = Number(plain.quantityRemaining || 0);
    if (remaining <= 0.0001) continue;
    const delta = daysUntilExpiry(plain.expiresAt);
    if (delta == null) continue;
    const name = plain.product?.name || `Producto #${plain.productId}`;
    const item = {
      name,
      expiresAt: String(plain.expiresAt || "").slice(0, 10),
      days: delta,
    };
    if (delta < 0) expired.push(item);
    else if (delta <= days) expiring.push(item);
  }

  if (!expired.length && !expiring.length) return 0;

  const lines = [];
  if (expired.length) {
    lines.push(
      `${expired.length} lote${expired.length === 1 ? "" : "s"} vencido${expired.length === 1 ? "" : "s"}`,
    );
  }
  if (expiring.length) {
    lines.push(
      `${expiring.length} lote${expiring.length === 1 ? "" : "s"} por vencer (≤ ${days} días)`,
    );
  }
  const samples = [...expired, ...expiring].slice(0, 4).map((item) => {
    if (item.days < 0) return `${item.name} (venció ${item.expiresAt})`;
    if (item.days === 0) return `${item.name} (vence hoy)`;
    return `${item.name} (vence ${item.expiresAt})`;
  });
  const message = `${lines.join(". ")}. ${samples.join("; ")}${
    expired.length + expiring.length > samples.length ? "…" : "."
  }`;

  let sent = 0;
  for (const userId of userIds) {
    const row = await createAndPushNotification({
      userId,
      type: "alert",
      title: "Caducidad de productos",
      message,
      link: "/inventario/lotes",
      sourceKey: `batch_expiry:digest:${todayDateOnly()}`,
    });
    if (row) sent += 1;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Demo temporal: dispara los 4 tipos para ver toasts. */
export async function sendDemoNotificationToasts(userIds) {
  const ids = (Array.isArray(userIds) ? userIds : [userIds])
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) {
    throw new Error("userId inválido");
  }
  const stamp = Date.now();
  const samples = [
    {
      type: "info",
      title: "¡Buenos días!",
      message: "Demo de saludo. Así se ve el toast de saludos.",
      link: "/inicio",
      sourceKey: `program:BUENOS_DIAS:demo:${stamp}`,
    },
    {
      type: "alert",
      title: "Stock mínimo alcanzado",
      message: "Pan de sal: quedan 2 unidades (mínimo 10).",
      link: "/inventario/productos",
      sourceKey: `stock_min:demo:${stamp}`,
    },
    {
      type: "alert",
      title: "Recordatorio de cuota: cobro a cliente",
      message: "Cliente Demo: pedido #128, cuota 2 por $45.00 vence hoy.",
      link: "/pedidos",
      sourceKey: `payment_installment:customer:demo:${stamp}`,
    },
    {
      type: "alert",
      title: "Caducidad de productos",
      message:
        "1 lote vencido y 2 por vencer (≤ 30 días). Leche Gloria (venció 2026-08-10); Yogurt Mora (vence hoy).",
      link: "/inventario/lotes",
      sourceKey: `batch_expiry:digest:demo:${stamp}`,
    },
  ];

  const sent = [];
  for (const sample of samples) {
    const rows = await Promise.all(
      ids.map((uid) =>
        createAndPushNotification({
          userId: uid,
          ...sample,
          force: true,
        }),
      ),
    );
    sent.push({
      type: sample.sourceKey.split(":")[0],
      title: sample.title,
      ids: rows.map((row) => row?.id),
    });
    await sleep(1200);
  }
  return { userIds: ids, sent };
}
