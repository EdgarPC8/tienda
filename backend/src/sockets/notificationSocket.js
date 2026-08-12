import { Notifications } from "../models/Notifications.js";

let io;

export const initNotificationSocket = (ioServer) => {
  io = ioServer;

  io.on("connection", (socket) => {
    console.log("🔔 Cliente conectado al canal de notificaciones");

    socket.on("join", (userId) => {
      socket.join(`user_${userId}`);
      console.log(`🧩 Usuario unido al canal: user_${userId}`);
    });

    socket.on("disconnect", () => {
      console.log("🔕 Cliente desconectado");
    });
  });
};

export const sendNotificationToUser = (userId, notification) => {
  if (io) {
    console.log("📩 Notificación en tiempo real:", notification); // Este debe salir en backend
    io.to(`user_${userId}`).emit("newNotification", notification);
  }
};

/** Aviso global: entitlement / mantenimiento cambió (gestor push o pull). */
export const broadcastEntitlementUpdated = (payload = {}) => {
  if (!io) return;
  io.emit("entitlementUpdated", {
    maintenance: Boolean(payload.maintenance),
    subscribed: Boolean(payload.subscribed),
    at: new Date().toISOString(),
  });
};
