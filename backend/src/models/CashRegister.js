import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { Store } from "./Inventory.js";

/**
 * Caja física / punto de emisión dentro de un local propio.
 * El turno se abre por local; las ventas POS se asocian a una caja.
 */
export const CashRegister = sequelize.define(
  "ERP_cash_registers",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    storeId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(80), allowNull: false },
    /** Código corto interno (C1, C2…) */
    code: { type: DataTypes.STRING(20), allowNull: true },
    /** Punto de emisión SRI de esta caja (001, 002…) */
    emissionPointCode: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "001",
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["storeId"] },
      { fields: ["storeId", "isActive"] },
      { fields: ["storeId", "code"] },
    ],
  },
);

CashRegister.belongsTo(Store, { foreignKey: "storeId", as: "store" });
Store.hasMany(CashRegister, { foreignKey: "storeId", as: "cashRegisters" });

export function padEmissionCode(v, fallback = "001") {
  const d = String(v ?? "").replace(/\D/g, "").slice(-3);
  return d ? d.padStart(3, "0") : fallback;
}

/** Si el local propio no tiene cajas, crea "Caja 1". */
export async function ensureDefaultCashRegisters(store, { transaction } = {}) {
  if (!store?.id) return [];
  if (store.locationKind && store.locationKind !== "propia") return [];

  const existing = await CashRegister.findAll({
    where: { storeId: store.id },
    order: [
      ["position", "ASC"],
      ["id", "ASC"],
    ],
    transaction,
  });
  if (existing.length > 0) return existing;

  const created = await CashRegister.create(
    {
      storeId: store.id,
      name: "Caja 1",
      code: "C1",
      emissionPointCode: padEmissionCode(store.emissionPointCode, "001"),
      isActive: true,
      position: 0,
    },
    { transaction },
  );
  return [created];
}

/** Asegura Caja 1 en todos los locales propios activos sin cajas. */
export async function seedDefaultCashRegistersForOwnStores() {
  const stores = await Store.findAll({
    where: { locationKind: "propia" },
    attributes: ["id", "name", "emissionPointCode", "locationKind"],
  });
  for (const store of stores) {
    await ensureDefaultCashRegisters(store);
  }
}
