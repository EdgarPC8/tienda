import { sequelize } from "../database/connection.js";
import { DataTypes } from "sequelize";
import { Users } from "./Users.js";
import { Roles } from "./Roles.js";

// MODELO PRINCIPAL DE CUENTA
export const Account = sequelize.define(
  "account",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    username: {
      type: DataTypes.STRING,
    },
    password: {
      type: DataTypes.STRING,
    },
    userId: {
      type: DataTypes.INTEGER,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    timestamps: false,
  }
);

// MODELO INTERMEDIO PARA MÚLTIPLES ROLES
export const AccountRoles = sequelize.define(
  "accountRoles",
  {
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    timestamps: false,
  }
);

// RELACIÓN Account ⇄ Roles (Muchos a muchos)
Account.belongsToMany(Roles, {
  through: AccountRoles,
  foreignKey: "accountId",
});

Roles.belongsToMany(Account, {
  through: AccountRoles,
  foreignKey: "roleId",
});

// RELACIÓN Account ⇄ Users (Uno a muchos)
Users.hasMany(Account, {
  foreignKey: "userId",
  sourceKey: "id",
});

Account.belongsTo(Users, {
  foreignKey: "userId",
  targetKey: "id",
});
