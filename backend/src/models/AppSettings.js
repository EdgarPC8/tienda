import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

/** Configuración global de la instalación (una fila, id=1). */
export const AppSettings = sequelize.define(
  "app_settings",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    name: { type: DataTypes.STRING(255), allowNull: false },
    alias: { type: DataTypes.STRING(80), allowNull: false },
    version: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "1.0.0" },
    description: { type: DataTypes.TEXT, allowNull: true },
    author: { type: DataTypes.STRING(120), allowNull: true },
    logoPath: { type: DataTypes.STRING(255), allowNull: true },
    /** Icono / favicon (emblema), distinto del logo de marca. */
    iconPath: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    socialWhatsapp: { type: DataTypes.STRING(255), allowNull: true },
    socialFacebook: { type: DataTypes.STRING(255), allowNull: true },
    socialInstagram: { type: DataTypes.STRING(255), allowNull: true },
    socialTiktok: { type: DataTypes.STRING(255), allowNull: true },
    socialEmail: { type: DataTypes.STRING(120), allowNull: true },
    /** Prefijo de carpetas en src/img y src/files (ej. sistema). */
    mediaFolderPrefix: { type: DataTypes.STRING(80), allowNull: false, defaultValue: "sistema" },
    /** Subcadena para filtrar categoría en accesos rápidos de caja (ej. panader). */
    cajaQuickCategoryMatch: { type: DataTypes.STRING(80), allowNull: true },
    walkInCustomerLabel: {
      type: DataTypes.STRING(80),
      allowNull: false,
      defaultValue: "Consumidor Final",
    },
    /** Zona horaria IANA (ej. America/Guayaquil) para fechas del sistema. */
    timezone: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "America/Guayaquil",
    },
    /** Vista pública: mostrar catálogo (/catalogo y carrusel home). */
    showPublicCatalog: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Vista pública: mostrar sucursales propias (puntos de venta). */
    showPublicStoresPropia: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Vista pública: mostrar vitrinas (locales de entrega). */
    showPublicStoresVitrina: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /**
     * Stock por local (bodega / sucursales).
     * Store arranca en stock general; multistock se activa por config.
     */
    multiStockEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** En selects de producto: mostrar chip de costo (precio proveedor del catálogo). */
    showProductCostInSelect: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /**
     * Decimales a mostrar en pantalla para montos (0–6).
     * En BD se guardan hasta 6; esto solo afecta visualización.
     */
    moneyDisplayDecimals: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 2,
    },
    /** Redondeo al mostrar: up | down | nearest */
    moneyRoundingMode: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "up",
    },
    /**
     * Autocompletar stock: en caja (cobrar) y pedidos (entregar), si falta stock
     * Admin/Programador puede registrar un ajuste y completar.
     */
    ordersAllowDeliverStockAdjust: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    /**
     * Caja: si falta stock al cobrar y el producto es destino de un empaque enlazado
     * con stock, sugerir abrir el empaque antes de bloquear o autocompletar.
     */
    suggestOpenPackOnPosShortage: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Caja: botón + al lado del buscador para crear producto (formulario completo). */
    cajaAllowCreateProductFromSelect: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Caja: si el escáner no encuentra el código, ofrece crear producto (nombre + precio). */
    cajaAllowCreateProductFromScan: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Caja: lápiz en el carrito para editar el producto del catálogo. */
    cajaAllowEditProductFromCart: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /**
     * Caja: al cobrar, si el precio del carrito no coincide con el del catálogo,
     * sugerir actualizar el precio del producto. Apagado por defecto.
     */
    cajaSuggestUpdateProductPrice: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notificationsToastGreeting: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notificationsToastStock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notificationsToastCredit: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notificationsToastExpiry: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    notificationsCreditEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    notificationsExpiryEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /**
     * Formato del detalle de productos en factura / nota de venta (JSON).
     * Ej: mayúsculas, código, número de línea, etc.
     */
    receiptDetailSettings: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    /**
     * Paleta de colores del sistema (JSON): light / dark / neon.
     * Si es null, el frontend usa los defaults de Raptor.
     */
    themePalette: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  { timestamps: true },
);
