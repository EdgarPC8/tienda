import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";

import { sequelize } from "./src/database/connection.js";
import { loggerMiddleware } from "./src/middlewares/loggerMiddleware.js";
import "./src/models/index.js";

import UsersRoutes from "./src/routes/UsersRoutes.js";
import AuthRoutes from "./src/routes/AuthRoutes.js";
import AccountsRoutes from "./src/routes/AccountsRoutes.js";
import NotificationsRoutes from "./src/routes/NotificationsRoutes.js";
import ComandsRoutes from "./src/routes/ComandsRoutes.js";
import TiendaRoutes from "./src/routes/TiendaRoutes.js";
import ImgRoutes from "./src/routes/ImgRoutes.js";
import { initNotificationSocket } from "./src/sockets/notificationSocket.js";
import { insertData } from "./src/database/insertData.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const httpServer = createServer(app);
const api = "tiendaapi";
const PORT = Number(process.env.TIENDA_API_PORT || 3006);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://192.168.137.250:5173",
  "http://192.168.137.250:4173",
  "https://aplicaciones.marianosamaniego.edu.ec",
  "https://www.aplicaciones.marianosamaniego.edu.ec",
  "http://192.168.1.100:5173",
  "http://192.168.1.100:4173",
  "https://aplicaciones.marianosamaniego.edu.ec",
  "https://www.aplicaciones.marianosamaniego.edu.ec",
];

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.use(express.json());
app.use(loggerMiddleware);

const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) callback(null, true);
    else callback(new Error("Acceso no permitido por CORS"));
  },
  optionsSuccessStatus: 200,
  credentials: true,
};
app.use(cors(corsOptions));
app.use(`/${api}/img`, ImgRoutes);
app.use(`/${api}/img`, express.static(path.join(__dirname, "src", "img")));

app.set("tiendaApiPrefix", api);

app.use(`/${api}/users`, UsersRoutes);
app.use(`/${api}`, AuthRoutes);
app.use(`/${api}`, AccountsRoutes);
app.use(`/${api}/notifications`, NotificationsRoutes);
app.use(`/${api}/comands`, ComandsRoutes);
app.use(`/${api}/tienda`, TiendaRoutes);
app.get(`/${api}/health`, (_, res) => res.json({ ok: true, service: "tienda" }));

initNotificationSocket(io);

async function main() {
  try {
    await sequelize.authenticate();
    console.log("✅ Conexión a MySQL (tienda) correcta.");

    // Reinicia tablas y las vuelve a crear desde modelos
   //await sequelize.sync({ force: true });
   //await insertData();

    httpServer.listen(PORT, () => {
      console.log(`🟢 tienda backend + Socket.IO en http://localhost:${PORT} (prefijo /${api})`);
    });
  } catch (error) {
    console.error("❌ Error de base de datos:", error.message);
  }
}

main();
