import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { Account } from "./Account.js";
import { Supplier } from "./Orders.js";

export const SupplierAccount = sequelize.define(
  "ERP_supplier_accounts",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    supplierId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
  },
  {
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["supplierId", "accountId"],
        name: "uniq_supplier_account_link",
      },
    ],
  },
);

Supplier.belongsToMany(Account, {
  through: SupplierAccount,
  foreignKey: "supplierId",
  otherKey: "accountId",
  as: "ERP_accounts",
});

Account.belongsToMany(Supplier, {
  through: SupplierAccount,
  foreignKey: "accountId",
  otherKey: "supplierId",
  as: "ERP_suppliers",
});

SupplierAccount.belongsTo(Account, { foreignKey: "accountId", as: "account" });
SupplierAccount.belongsTo(Supplier, { foreignKey: "supplierId", as: "supplier" });

