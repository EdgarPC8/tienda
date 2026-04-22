let io;

export const initNotificationSocket = (ioServer) => {
  io = ioServer;

  io.on("connection", (socket) => {
    console.log("🔔 Cliente conectado al canal de notificaciones (tienda)");

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
    io.to(`user_${userId}`).emit("newNotification", notification);
  }
};
