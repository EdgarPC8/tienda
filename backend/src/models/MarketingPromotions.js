/**
 * Marketing → Promociones: un grupo, un beneficio y clientes (1 cliente = 1 grupo).
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { InventoryProduct } from "./Inventory.js";
import { Customer } from "./Orders.js";

export const PromoGroup = sequelize.define(
  "ERP_promo_groups",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { timestamps: true },
);

export const PromoBenefit = sequelize.define(
  "ERP_promo_benefits",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    groupId: { type: DataTypes.INTEGER, allowNull: false },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1 },
    price: { type: DataTypes.DECIMAL(14, 6), allowNull: false, defaultValue: 0 },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { timestamps: true },
);

export const PromoMember = sequelize.define(
  "ERP_promo_members",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    groupId: { type: DataTypes.INTEGER, allowNull: false },
    customerId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  },
  { timestamps: true },
);

PromoGroup.hasMany(PromoBenefit, {
  foreignKey: "groupId",
  as: "benefits",
  onDelete: "CASCADE",
});
PromoBenefit.belongsTo(PromoGroup, { foreignKey: "groupId", as: "group" });
PromoBenefit.belongsTo(InventoryProduct, {
  foreignKey: "productId",
  as: "product",
});

PromoGroup.hasMany(PromoMember, {
  foreignKey: "groupId",
  as: "members",
  onDelete: "CASCADE",
});
PromoMember.belongsTo(PromoGroup, { foreignKey: "groupId", as: "group" });
PromoMember.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });
