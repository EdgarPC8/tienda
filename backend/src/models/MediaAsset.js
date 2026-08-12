/**
 * Registro escalable de medios (video, audio, imagen en files/).
 * Reutilizable por Publicidad y futuros módulos.
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

export const MEDIA_TYPES = ["video", "audio", "image"];
export const MEDIA_STORAGE = ["files", "img"];

export const MediaAsset = sequelize.define(
  "ERP_media_assets",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    /** Módulo dueño: publicidad, general, inventario, etc. */
    module: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "general" },
    mediaType: {
      type: DataTypes.ENUM(...MEDIA_TYPES),
      allowNull: false,
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    /** Ruta relativa dentro de src/files o src/img */
    relativePath: { type: DataTypes.STRING(500), allowNull: false },
    storage: {
      type: DataTypes.ENUM(...MEDIA_STORAGE),
      allowNull: false,
      defaultValue: "files",
    },
    folder: { type: DataTypes.STRING(200), allowNull: true },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: true },
    mimeType: { type: DataTypes.STRING(120), allowNull: true },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: true },
    metadata: { type: DataTypes.JSON, allowNull: true },
    createdByAccountId: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["module", "mediaType"] },
      { fields: ["relativePath"], unique: true },
    ],
  },
);
