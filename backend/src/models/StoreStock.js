import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { InventoryProduct, Store } from "./Inventory.js";

/**
 * Stock de un producto en un local (propia / bodega).
 * El stock general del producto = suma de filas por local.
 * exhibidorId en esta tabla NO se usa para organización (queda null);
 * la organización va en ERP_store_products.exhibidorId.
 */
export const StoreStock = sequelize.define(
  "ERP_store_stocks",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    storeId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    /** Fase 2: exhibidor dentro del local; null = stock del local sin exhibidor. */
    exhibidorId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { unique: true, fields: ["storeId", "productId"] },
      { fields: ["productId"] },
      { fields: ["storeId"] },
    ],
  },
);

StoreStock.belongsTo(Store, { foreignKey: "storeId", as: "store" });
Store.hasMany(StoreStock, { foreignKey: "storeId", as: "storeStocks" });

StoreStock.belongsTo(InventoryProduct, { foreignKey: "productId", as: "product" });
InventoryProduct.hasMany(StoreStock, { foreignKey: "productId", as: "storeStocks" });
