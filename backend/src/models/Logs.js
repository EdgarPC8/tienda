import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";


export const Logs = sequelize.define(
  "logs",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    httpMethod: {
      type: DataTypes.TEXT,
    },
    action: {
      type: DataTypes.TEXT,
    },
    endPoint: {
      type: DataTypes.TEXT,
    },
    description: {
      type: DataTypes.TEXT,
    },
    system: {
      type: DataTypes.TEXT,
    },
    date: {
      type: DataTypes.DATE,
      defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
    },
  },
  {
    timestamps: false,
  }
);
