/**
 * Publicidad — campañas y piezas de playlist (persistencia en BD + backup.json).
 */
import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { repairJsonFieldValue } from "../utils/jsonFieldUtils.js";

function defineJsonArrayField(fieldName, { emptyTo = [] } = {}) {
  return {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: emptyTo,
    get() {
      const v = repairJsonFieldValue(this.getDataValue(fieldName), { emptyArrayToNull: false });
      return Array.isArray(v) ? v : emptyTo;
    },
    set(value) {
      const v = repairJsonFieldValue(value, { emptyArrayToNull: false });
      this.setDataValue(fieldName, Array.isArray(v) ? v : emptyTo);
    },
  };
}

function defineJsonArrayFieldNullable(fieldName) {
  return {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      const v = repairJsonFieldValue(this.getDataValue(fieldName));
      return Array.isArray(v) ? v : null;
    },
    set(value) {
      this.setDataValue(fieldName, repairJsonFieldValue(value));
    },
  };
}

export const PublicidadCampaign = sequelize.define(
  "ERP_publicidad_campaigns",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("draft", "scheduled", "active", "paused", "ended"),
      allowNull: false,
      defaultValue: "draft",
    },
    screenIds: defineJsonArrayField("screenIds"),
    loop: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    /** none | single_loop | playlist_loop — música de fondo mientras la campaña está activa */
    musicMode: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "none" },
    /** Lista de pistas: [{ id, title, mediaPath, durationSeconds, order }] */
    musicTracks: defineJsonArrayField("musicTracks"),
    createdByAccountId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { timestamps: true },
);

/** Cada fila = una pieza de la lista de reproducción */
export const PublicidadPlaylistItem = sequelize.define(
  "ERP_publicidad_playlist_items",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    campaignId: { type: DataTypes.INTEGER, allowNull: false },
    /** ID estable del cliente (slide_xxx) para edición */
    slideKey: { type: DataTypes.STRING(64), allowNull: true },
    contentType: {
      type: DataTypes.ENUM("product", "image", "video", "menu", "text"),
      allowNull: false,
    },
    /** Productos del tablero menú (contentType = menu) */
    menuItems: defineJsonArrayFieldNullable("menuItems"),
    contentId: { type: DataTypes.STRING(120), allowNull: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    subtitle: { type: DataTypes.STRING(300), allowNull: true },
    mediaPath: { type: DataTypes.STRING(500), allowNull: true },
    price: { type: DataTypes.DECIMAL(14, 6), allowNull: true },
    /** Tamaño del título en px (nombre producto / mensaje texto). */
    titleFontSize: { type: DataTypes.INTEGER, allowNull: true },
    /** Estilo tipográfico: default, rounded, outline, shadow3d, rounded3d */
    titleFontStyle: { type: DataTypes.STRING(32), allowNull: true },
    durationSeconds: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 8 },
    transitionIn: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "fade" },
    transitionOut: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "fade" },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { timestamps: true },
);

PublicidadCampaign.hasMany(PublicidadPlaylistItem, {
  foreignKey: "campaignId",
  as: "playlistItems",
  onDelete: "CASCADE",
});
PublicidadPlaylistItem.belongsTo(PublicidadCampaign, {
  foreignKey: "campaignId",
  as: "campaign",
});

/** Dispositivos TV/APK registrados (ID local configurado en cada pantalla). */
export const PublicidadDevice = sequelize.define(
  "ERP_publicidad_devices",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    /** Identificador local del dispositivo (ej. tv-lobby-1). */
    deviceId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    label: { type: DataTypes.STRING(160), allowNull: true },
    status: {
      type: DataTypes.ENUM("pending", "approved", "rejected", "disabled"),
      allowNull: false,
      defaultValue: "pending",
    },
    lastSeenAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    /** Campaña que debe reproducir este dispositivo (asignación directa desde el panel). */
    campaignId: { type: DataTypes.INTEGER, allowNull: true },
  },
  { timestamps: true },
);

PublicidadDevice.belongsTo(PublicidadCampaign, {
  foreignKey: "campaignId",
  as: "campaign",
});
