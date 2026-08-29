/**
 * Noticia local sincronizada desde Raptor Solutions (gestor).
 * La app lee esta tabla sin depender del gestor en runtime.
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

export const AppNews = sequelize.define(
  "app_news",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    /** id de NewsItem en el gestor */
    gestorNewsId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: "gestor_news_id",
    },
    title: {
      type: DataTypes.STRING(220),
      allowNull: false,
    },
    subtitle: {
      type: DataTypes.STRING(400),
      allowNull: true,
    },
    body: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    kind: {
      type: DataTypes.ENUM(
        "portada",
        "interior",
        "breve",
        "editorial",
        "proximamente",
      ),
      allowNull: false,
      defaultValue: "interior",
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "published_at",
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: "sort_order",
    },
    syncedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "synced_at",
    },
  },
  {
    timestamps: true,
    indexes: [{ fields: ["kind"] }, { fields: ["sort_order"] }],
  },
);
