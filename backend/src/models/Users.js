import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

export const Users = sequelize.define(
  "users",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    ci: {
      type: DataTypes.STRING,
      unique: true,
    },
    documentType: {
      type: DataTypes.STRING,
    },
    firstName: {
      type: DataTypes.STRING,
    },
    secondName: {
      type: DataTypes.STRING,
    },
    firstLastName: {
      type: DataTypes.STRING,
    },
    secondLastName: {
      type: DataTypes.STRING,
    },
    birthday: {
      type: DataTypes.DATEONLY,
    },
    gender: {
      type: DataTypes.STRING,
    },
    photo: {
      type: DataTypes.TEXT,
    },
  },
  {
    timestamps: false,
  }
);
