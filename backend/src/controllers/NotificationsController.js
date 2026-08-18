import { Notifications } from "../models/Notifications.js";
import {
  createAndPushNotification,
  resolveAdminUserIds,
  sendDemoNotificationToasts,
} from "../services/notificationService.js";
import { notifyOk, notifyFail } from "../services/notifyRaptorSolutions.js";

export const getUnreadCountByUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const count = await Notifications.count({
      where: {
        userId,
        seen: false,
        deleted: false
      }
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


export const getNotificationsByUser = async (req, res) => {
  const { userId } = req.params;
  console.log(userId)
  try {
    const notifications = await Notifications.findAll({
      where: {
        userId,
        deleted: false
      },
      order: [['createdAt', 'DESC']]
    });
    res.status(201).json(notifications);

    
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createNotification = async (req, res) => {
  const { userId, type, title, message, link } = req.body;
  try {
    const notification = await createAndPushNotification({
      userId,
      type: type || "info",
      title,
      message,
      link,
    });
    notifyOk("notification.created", "Notificación creada", { notificationId: notification?.id });
    res.status(201).json(notification);
  } catch (error) {
    notifyFail("notification.create_failed", "Error al crear notificación", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

/** Demo temporal: 4 avisos (saludo, stock, crédito, caducidad) para ver toasts. */
export const demoNotificationToasts = async (req, res) => {
  try {
    const fromAuth = Number(req.user?.userId);
    const fromBody = Number(req.body?.userId);
    let ids;
    if (Number.isFinite(fromAuth) && fromAuth > 0) {
      ids = [fromAuth];
    } else if (Number.isFinite(fromBody) && fromBody > 0) {
      ids = [fromBody];
    } else {
      ids = await resolveAdminUserIds();
    }
    if (!ids.length) {
      return res.status(400).json({ message: "No hay usuario destino para la demo" });
    }
    const result = await sendDemoNotificationToasts(ids);
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markAsSeen = async (req, res) => {
  const { id } = req.params;
  try {
    const notification = await Notifications.findByPk(id);
    if (!notification) {
      notifyFail("notification.mark_seen_failed", `Notificación #${id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "No encontrada" });
    }
    notification.seen = true;
    await notification.save();
    notifyOk("notification.mark_seen", `Notificación leída #${id}`, { notificationId: id });
    res.json(notification);
  } catch (error) {
    notifyFail("notification.mark_seen_failed", `Error al marcar notificación #${id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

export const deleteNotification = async (req, res) => {
  const { id } = req.params;
  try {
    const notification = await Notifications.findByPk(id);
    if (!notification) {
      notifyFail("notification.delete_failed", `Notificación #${id} no encontrada`, {
        req,
        httpStatus: 404,
      });
      return res.status(404).json({ message: "No encontrada" });
    }

    notification.deleted = true;
    await notification.save();
    notifyOk("notification.deleted", `Notificación #${id}`, { notificationId: id });
    res.json({ message: "Notificación marcada como eliminada" });
  } catch (error) {
    notifyFail("notification.delete_failed", `Error al eliminar notificación #${id}`, {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

export const markManyAsSeen = async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    notifyFail("notification.mark_bulk_seen_failed", "Sin ids", { req, httpStatus: 400 });
    return res.status(400).json({ message: "Sin ids" });
  }
  try {
    await Notifications.update(
      { seen: true },
      { where: { id: ids, deleted: false } }
    );
    notifyOk("notification.mark_bulk_seen", "Notificaciones marcadas leídas", { count: ids.length });
    res.json({ message: "Marcadas como leídas", count: ids.length });
  } catch (error) {
    notifyFail("notification.mark_bulk_seen_failed", "Error al marcar notificaciones", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

export const deleteManyNotifications = async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter(Boolean) : [];
  if (ids.length === 0) {
    notifyFail("notification.bulk_delete_failed", "Sin ids", { req, httpStatus: 400 });
    return res.status(400).json({ message: "Sin ids" });
  }
  try {
    await Notifications.update(
      { deleted: true },
      { where: { id: ids } }
    );
    notifyOk("notification.bulk_deleted", "Notificaciones eliminadas", { count: ids.length });
    res.json({ message: "Eliminadas", count: ids.length });
  } catch (error) {
    notifyFail("notification.bulk_delete_failed", "Error al eliminar notificaciones", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

export const markAllAsSeenByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const [count] = await Notifications.update(
      { seen: true },
      { where: { userId, seen: false, deleted: false } }
    );
    notifyOk("notification.mark_all_seen", "Todas las notificaciones leídas", { userId, count });
    res.json({ message: "Todas marcadas como leídas", count });
  } catch (error) {
    notifyFail("notification.mark_all_seen_failed", "Error al marcar todas como leídas", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};

export const deleteReadByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const [count] = await Notifications.update(
      { deleted: true },
      { where: { userId, seen: true, deleted: false } }
    );
    notifyOk("notification.read_deleted", "Notificaciones leídas eliminadas", { userId, count });
    res.json({ message: "Leídas eliminadas", count });
  } catch (error) {
    notifyFail("notification.read_delete_failed", "Error al eliminar notificaciones leídas", {
      error,
      req,
      httpStatus: 500,
    });
    res.status(500).json({ message: error.message });
  }
};
