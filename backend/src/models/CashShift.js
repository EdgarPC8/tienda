import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { Users } from "./Users.js";
import { Store } from "./Inventory.js";
import { CashRegister } from "./CashRegister.js";

/** Turno de caja: apertura con capital inicial y cierre con arqueo. */
export const CashShift = sequelize.define(
  "ERP_cash_shifts",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accountId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    /** Local / panadería desde la que opera este turno */
    storeId: { type: DataTypes.INTEGER, allowNull: true },
    /** Caja activa del local para ventas POS en este turno */
    activeCashRegisterId: { type: DataTypes.INTEGER, allowNull: true },
    /** Snapshot SRI al abrir (por si el Store cambia después) */
    establishmentCode: { type: DataTypes.STRING(3), allowNull: true },
    emissionPointCode: { type: DataTypes.STRING(3), allowNull: true },
    status: {
      type: DataTypes.ENUM("open", "closed"),
      allowNull: false,
      defaultValue: "open",
    },
    openedAt: { type: DataTypes.DATE, allowNull: false },
    closedAt: { type: DataTypes.DATE, allowNull: true },
    openingCashCounts: { type: DataTypes.JSON, allowNull: false },
    openingCashTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
    closingCashCounts: { type: DataTypes.JSON, allowNull: true },
    closingCashTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    expectedCashTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    cashDifference: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    salesCashTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    salesTransferTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    salesCardTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    salesTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    cashOutTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    cashInTotal: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    openingNotes: { type: DataTypes.TEXT, allowNull: true },
    closingNotes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["accountId", "status"] },
      { fields: ["userId"] },
      { fields: ["openedAt"] },
      { fields: ["storeId"] },
    ],
  },
);

CashShift.belongsTo(Users, { foreignKey: "userId", as: "user" });
Users.hasMany(CashShift, { foreignKey: "userId", as: "cashShifts" });

CashShift.belongsTo(Store, { foreignKey: "storeId", as: "store" });
Store.hasMany(CashShift, { foreignKey: "storeId", as: "cashShifts" });

CashShift.belongsTo(CashRegister, {
  foreignKey: "activeCashRegisterId",
  as: "activeCashRegister",
});
CashRegister.hasMany(CashShift, {
  foreignKey: "activeCashRegisterId",
  as: "activeShifts",
});
