import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

/** Plantillas de notificaciones programadas (saludos, avisos de sistema, etc.). */
export const NotificationProgram = sequelize.define(
  "notification_programs",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(255), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    link: { type: DataTypes.STRING(255), allowNull: true },
    /** info | alert | reminder → notifications.type */
    notificationType: {
      type: DataTypes.ENUM("info", "alert", "reminder"),
      allowNull: false,
      defaultValue: "info",
    },
    /** manual | daily | interval */
    scheduleType: {
      type: DataTypes.ENUM("manual", "daily", "interval"),
      allowNull: false,
      defaultValue: "manual",
    },
    /** HH:mm para daily */
    scheduleTime: { type: DataTypes.STRING(5), allowNull: true },
    /** Minutos para interval (ej. revisión de stock) */
    scheduleIntervalMinutes: { type: DataTypes.INTEGER, allowNull: true },
    scopeType: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "user" },
    targetType: {
      type: DataTypes.ENUM("all_users", "by_role"),
      allowNull: false,
      defaultValue: "all_users",
    },
    targetRoleIds: { type: DataTypes.JSON, allowNull: true },
    /** static = usa title/message; stock_min = revisa inventario */
    handlerType: {
      type: DataTypes.ENUM("static", "stock_min"),
      allowNull: false,
      defaultValue: "static",
    },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    lastRunAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["code"] }, { fields: ["active", "scheduleType"] }],
  },
);

export const NotificationDispatchLog = sequelize.define(
  "notification_dispatch_logs",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    programId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    dispatchDate: { type: DataTypes.DATEONLY, allowNull: false },
  },
  {
    timestamps: true,
    updatedAt: false,
    indexes: [
      { unique: true, fields: ["programId", "userId", "dispatchDate"] },
    ],
  },
);

NotificationProgram.hasMany(NotificationDispatchLog, {
  foreignKey: "programId",
  onDelete: "CASCADE",
});
NotificationDispatchLog.belongsTo(NotificationProgram, { foreignKey: "programId" });
