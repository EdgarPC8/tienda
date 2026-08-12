/**
 * Arranque del API Tienda (SoftEd / Raptor).
 * Carga variables de entorno desde backend/.env (JWT_SECRET, DB_*, etc.).
 * Ver backend/.env.example — API_PREFIX=tiendaapi, DB_NAME=tienda.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { sequelize } from "./src/database/connection.js";
import "./src/database/registerEdDeliModels.js";
import { recreateDatabaseFromBackup } from "./src/database/insertData.js";
import { loggerMiddleware } from "./src/middlewares/loggerMiddleware.js";

import UsersRoutes from "./src/routes/UsersRoutes.js";
import AuthRoutes from "./src/routes/AuthRoutes.js";
import AccountsRoutes from "./src/routes/AccountsRoutes.js";
import NotificationsRoutes from "./src/routes/NotificationsRoutes.js";
import InventoryControlRoutes from "./src/routes/InventoryControlRoutes.js";
import OrderRoutes from "./src/routes/OrderRoutes.js";
import FinanceRoutes from "./src/routes/FinanceRoutes.js";
import ShiftRoutes from "./src/routes/ShiftRoutes.js";
import TaskRoutes from "./src/routes/TaskRoutes.js";
import PublicidadRoutes from "./src/routes/PublicidadRoutes.js";
import MediaRoutes from "./src/routes/MediaRoutes.js";
import ImgRoutes from "./src/routes/ImgRoutes.js";
import FilesRoutes from "./src/routes/FilesRoutes.js";
import DocumentRoutes from "./src/routes/DocumentRoutes.js";
import EditorRoutes from "./src/routes/EditorRoutes.js";
import ComandsRoutes from "./src/routes/ComandsRoutes.js";
import AppSettingsRoutes from "./src/routes/AppSettingsRoutes.js";
import SubscriptionRoutes from "./src/routes/SubscriptionRoutes.js";
import SriBillingRoutes from "./src/routes/SriBillingRoutes.js";
import { loadAppSettings, getAppSettingsSync } from "./src/services/appSettingsService.js";
import { loadSriBillingSettings } from "./src/services/sriBillingService.js";
import { ensureEntitlementTable } from "./src/services/entitlementService.js";
import { seedDefaultCashRegistersForOwnStores } from "./src/models/CashRegister.js";
import {
  ensureBodegaStore,
  ensureSingleLocalOwnStore,
  migrateGlobalStockToBodega,
} from "./src/services/storeStockService.js";

import NotificationProgramRoutes from "./src/routes/NotificationProgramRoutes.js";
import { startNotificationScheduler } from "./src/services/notificationScheduler.js";
import { initNotificationSocket } from "./src/sockets/notificationSocket.js";
import { initPublicidadSocket } from "./src/sockets/publicidadSocket.js";
import { Server } from "socket.io";
import { createServer } from "http";
import {
  corsOriginCallback,
  isOriginAllowed,
} from "./src/utils/corsOrigins.js";
import {
  errorMiddleware,
  notFoundMiddleware,
} from "./src/middlewares/errorMiddleware.js";
import { PORT, API_PREFIX } from "./src/config/serverEnv.js";

// ✅ __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const api = API_PREFIX;

const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) callback(null, true);
      else callback(new Error(`Origen no permitido: ${origin}`));
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// Middleware
app.use(express.json());
app.use(loggerMiddleware);

// CORS — localhost, LAN 192.168/10.x y dominio institucional (sin IPs fijas)
app.use(
  cors({
    origin: corsOriginCallback,
    optionsSuccessStatus: 200,
    credentials: true,
  }),
);

app.use(`/${api}/img`, ImgRoutes);

app.use(`/${api}/img`, express.static(path.resolve(__dirname, "src/img")));
app.use(`/${api}/files`, FilesRoutes);
app.use(`/${api}/documents`, DocumentRoutes);

// Sirve los archivos guardados en src/files
app.use(`/${api}/files`, express.static(path.resolve(__dirname, "src/files")));

// ================================
app.use(`/${api}`, AppSettingsRoutes);
app.use(`/${api}`, SubscriptionRoutes);
app.use(`/${api}/sri`, SriBillingRoutes);
app.use(`/${api}/comands`, ComandsRoutes);
app.use(`/${api}/editor`, EditorRoutes);
app.use(`/${api}/users`, UsersRoutes);
app.use(`/${api}`, AuthRoutes);
app.use(`/${api}`, AccountsRoutes);
app.use(`/${api}/notifications`, NotificationsRoutes);
app.use(`/${api}/notification-programs`, NotificationProgramRoutes);
app.use(`/${api}/inventory`, InventoryControlRoutes);
app.use(`/${api}/orders`, OrderRoutes);
app.use(`/${api}/finance`, FinanceRoutes);
app.use(`/${api}/shifts`, ShiftRoutes);
app.use(`/${api}/tasks`, TaskRoutes);
app.use(`/${api}/publicidad`, PublicidadRoutes);
app.use(`/${api}/media`, MediaRoutes);

// Socket para notificaciones y signage publicidad
initNotificationSocket(io);
initPublicidadSocket(io);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export async function main() {
  try {
    await sequelize.authenticate();
    await loadAppSettings();
    await loadSriBillingSettings();
    // Sin sync({ alter }) en arranque: el esquema se alinea a mano con `npm run db:sync`.
    await ensureEntitlementTable({ alter: false });
    // Multistock: Bodega + migración. Un solo local: asegurar un local «propia» para turno.
    if (getAppSettingsSync()?.multiStockEnabled) {
      await ensureBodegaStore();
      await migrateGlobalStockToBodega();
    } else {
      await ensureSingleLocalOwnStore();
    }
    await seedDefaultCashRegistersForOwnStores();

    // ═══════════════════════════════════════════════════════════════════
    // ⚠️  SOLO DESARROLLO — Reset total (borra tablas y carga backup.json)
    // Descomenta las 2 líneas siguientes. Cada reinicio de nodemon repetirá el reset.
    // Alternativa sin tocar código: npm run db:reset
    // ═══════════════════════════════════════════════════════════════════
    // await recreateDatabaseFromBackup();

    console.log(
      "✅ Conexión a la base de datos OK (esquema: npm run db:sync o db:reset).",
    );

    httpServer.listen(PORT, async () => {
      console.log(`🟢 Backend + Socket.IO · puerto ${PORT} · API /${api}`);
      await startNotificationScheduler();
    });
  } catch (error) {
    console.error("❌ Error en la conexión a la base de datos:", error);
  }
}

main();
