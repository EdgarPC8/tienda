import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { Users } from "./Users.js";

export const TaskPlan = sequelize.define(
  "ERP_task_plans",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(180), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "published", "closed"),
      allowNull: false,
      defaultValue: "draft",
    },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: false },
    publishedAt: { type: DataTypes.DATE, allowNull: true },
  },
  { timestamps: true },
);

export const TaskItem = sequelize.define(
  "ERP_task_items",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    planId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(220), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    assignedUserId: { type: DataTypes.INTEGER, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "in_progress", "done", "blocked"),
      allowNull: false,
      defaultValue: "pending",
    },
    priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    actionType: {
      type: DataTypes.ENUM("none", "open_box"),
      allowNull: false,
      defaultValue: "none",
    },
    actionPayload: { type: DataTypes.TEXT, allowNull: true },
    checkedAt: { type: DataTypes.DATE, allowNull: true },
    checkedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    resultNote: { type: DataTypes.TEXT, allowNull: true },
  },
  { timestamps: true },
);

TaskPlan.hasMany(TaskItem, { foreignKey: "planId", onDelete: "CASCADE", as: "items" });
TaskItem.belongsTo(TaskPlan, { foreignKey: "planId", as: "plan" });
Users.hasMany(TaskItem, { foreignKey: "assignedUserId", as: "assignedTasks" });
TaskItem.belongsTo(Users, { foreignKey: "assignedUserId", as: "assignedUser" });
