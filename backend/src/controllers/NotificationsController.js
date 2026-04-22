import { Notifications } from "../models/Notifications.js";
import { sendNotificationToUser } from "../sockets/notificationSocket.js";

export const getUnreadCountByUser = async (req, res) => {
  const { userId } = req.params;

  try {
    const count = await Notifications.count({
      where: {
        userId,
        seen: false,
        deleted: false,
      },
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getNotificationsByUser = async (req, res) => {
  const { userId } = req.params;
  try {
    const notifications = await Notifications.findAll({
      where: {
        userId,
        deleted: false,
      },
      order: [["createdAt", "DESC"]],
    });
    res.status(200).json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const createNotification = async (req, res) => {
  const { userId, type, title, message, link } = req.body;
  try {
    const notification = await Notifications.create({
      userId,
      type,
      title,
      message,
      link,
    });
    sendNotificationToUser(userId, notification.toJSON());
    res.status(201).json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const markAsSeen = async (req, res) => {
  const { id } = req.params;
  try {
    const notification = await Notifications.findByPk(id);
    if (!notification) return res.status(404).json({ message: "No encontrada" });
    notification.seen = true;
    await notification.save();
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteNotification = async (req, res) => {
  const { id } = req.params;
  try {
    const notification = await Notifications.findByPk(id);
    if (!notification) return res.status(404).json({ message: "No encontrada" });

    notification.deleted = true;
    await notification.save();
    res.json({ message: "Notificación marcada como eliminada" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
