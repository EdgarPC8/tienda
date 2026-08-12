import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { CashShift } from "./CashShift.js";
import { Users } from "./Users.js";

/** Movimiento de efectivo durante un turno de caja (salida o entrada). */
export const CashShiftMovement = sequelize.define(
  "ERP_cash_shift_movements",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shiftId: { type: DataTypes.INTEGER, allowNull: false },
    accountId: { type: DataTypes.INTEGER, allowNull: false },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    direction: {
      type: DataTypes.ENUM("out", "in"),
      allowNull: false,
    },
    category: {
      type: DataTypes.ENUM(
        "gasto_operativo",
        "compra_mercancia",
        "retiro",
        "entrada",
        "otro",
      ),
      allowNull: false,
    },
    amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    concept: { type: DataTypes.STRING, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    productId: { type: DataTypes.INTEGER, allowNull: true },
    quantity: { type: DataTypes.FLOAT, allowNull: true },
    inventoryMovementId: { type: DataTypes.INTEGER, allowNull: true },
    expenseId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["shiftId"] },
      { fields: ["accountId"] },
    ],
  },
);

CashShiftMovement.belongsTo(CashShift, { foreignKey: "shiftId", as: "shift" });
CashShift.hasMany(CashShiftMovement, { foreignKey: "shiftId", as: "movements" });

CashShiftMovement.belongsTo(Users, { foreignKey: "userId", as: "user" });
Users.hasMany(CashShiftMovement, { foreignKey: "userId", as: "cashShiftMovements" });
