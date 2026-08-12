import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { Account } from "./Account.js";

export const DOCUMENT_ENTITY_TYPES = [
  "movement_batch",
  "movement",
  "expense",
  "supplier_order",
  "order",
];

export const DocumentAttachment = sequelize.define(
  "ERP_document_attachments",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    entityType: {
      type: DataTypes.ENUM(...DOCUMENT_ENTITY_TYPES),
      allowNull: false,
    },
    /** ID numérico del registro (gasto, pedido, movimiento individual, etc.) */
    entityId: { type: DataTypes.INTEGER, allowNull: true },
    /** UUID de lote de movimientos de compra */
    batchKey: { type: DataTypes.STRING(36), allowNull: true },
    /** Ruta relativa dentro de src/files */
    filePath: { type: DataTypes.STRING(500), allowNull: false },
    originalName: { type: DataTypes.STRING(255), allowNull: true },
    mimeType: { type: DataTypes.STRING(120), allowNull: true },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: true },
    label: { type: DataTypes.STRING(200), allowNull: true },
    /** Nº de factura / documento del proveedor (ej. 001-001-000000123). */
    invoiceNumber: { type: DataTypes.STRING(80), allowNull: true },
    uploadedBy: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["entityType", "entityId"] },
      { fields: ["entityType", "batchKey"] },
      { fields: ["filePath"] },
    ],
  },
);

DocumentAttachment.belongsTo(Account, { foreignKey: "uploadedBy", as: "uploader" });
