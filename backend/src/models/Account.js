import { sequelize } from "../database/connection.js";
import { DataTypes } from "sequelize";
import { Users } from "./Users.js";
import { Roles } from "./Roles.js";

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
  },
  {
    timestamps: false,
  }
);

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

Account.belongsToMany(Roles, {
  through: AccountRoles,
  foreignKey: "accountId",
  otherKey: "roleId",
  as: "roles",
});

Roles.belongsToMany(Account, {
  through: AccountRoles,
  foreignKey: "roleId",
  otherKey: "accountId",
  as: "accounts",
});

Users.hasMany(Account, {
  foreignKey: "userId",
  sourceKey: "id",
  as: "accounts",
});

Account.belongsTo(Users, {
  foreignKey: "userId",
  targetKey: "id",
  as: "user",
});
