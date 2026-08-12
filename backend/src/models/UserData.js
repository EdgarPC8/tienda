import { sequelize } from "../database/connection.js";
import { DataTypes } from "sequelize";
import { Users } from "./Users.js";

/**
 * Datos adicionales del usuario (dirección, teléfonos, tipo de sangre, correos).
 * Una fila por usuario; se enlaza con users.id.
 */
export const UserData = sequelize.define(
  "user_data",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    idUser: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
    },
    direction: {
      type: DataTypes.STRING(250),
      defaultValue: null,
    },
    placeResidence: {
      type: DataTypes.STRING(150),
      defaultValue: null,
    },
    phone: {
      type: DataTypes.STRING(20),
      defaultValue: null,
    },
    cellPhone: {
      type: DataTypes.STRING(20),
      defaultValue: null,
    },
    bloodType: {
      type: DataTypes.STRING(10),
      defaultValue: null,
    },
    personalEmail: {
      type: DataTypes.STRING(120),
      defaultValue: null,
    },
    institutionalEmail: {
      type: DataTypes.STRING(120),
      defaultValue: null,
    },
  },
  { timestamps: false }
);

Users.hasOne(UserData, { foreignKey: "idUser", onDelete: "CASCADE" });
UserData.belongsTo(Users, { foreignKey: "idUser" });
