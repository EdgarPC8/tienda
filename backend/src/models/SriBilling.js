import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";

/**
 * Configuración fiscal / SRI de la instalación (una fila, id=1).
 * La emisión de comprobantes vendrá después; aquí solo se preparan datos y firma.
 */
export const SriBillingSettings = sequelize.define(
  "sri_billing_settings",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      defaultValue: 1,
    },
    /** Si false, el POS sigue solo con comprobantes internos. */
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Ambiente SRI: pruebas | produccion */
    environment: {
      type: DataTypes.ENUM("pruebas", "produccion"),
      allowNull: false,
      defaultValue: "pruebas",
    },
    ruc: { type: DataTypes.STRING(13), allowNull: true },
    legalName: { type: DataTypes.STRING(300), allowNull: true },
    tradeName: { type: DataTypes.STRING(300), allowNull: true },
    matrixAddress: { type: DataTypes.STRING(300), allowNull: true },
    establishmentAddress: { type: DataTypes.STRING(300), allowNull: true },
    establishmentCode: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "001",
    },
    emissionPointCode: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "001",
    },
    phone: { type: DataTypes.STRING(40), allowNull: true },
    email: { type: DataTypes.STRING(120), allowNull: true },
    /** Obligado a llevar contabilidad */
    accountingRequired: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    /** Nro. resolución contribuyente especial (vacío = no aplica) */
    specialTaxpayerResolution: { type: DataTypes.STRING(40), allowNull: true },
    /**
     * Régimen simplificado / tipificación libre (RIMPE, general, etc.)
     * Texto corto para uso futuro en XML.
     */
    taxRegime: { type: DataTypes.STRING(80), allowNull: true },
    /** Próximo secuencial solo de facturas electrónicas tipo 01 (no pedidos/notas de venta) */
    nextInvoiceSequential: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    /** Ruta relativa bajo backend/src/private (nunca pública) */
    certificateRelativePath: { type: DataTypes.STRING(255), allowNull: true },
    /** Contraseña del .p12 cifrada (nunca se expone al cliente) */
    certificatePasswordEnc: { type: DataTypes.TEXT, allowNull: true },
    certificateFileName: { type: DataTypes.STRING(255), allowNull: true },
    certificateUploadedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },

    /** Envío automático de factura al correo del cliente al autorizar */
    enableSendInvoiceEmail: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    smtpHost: { type: DataTypes.STRING(200), allowNull: true },
    smtpPort: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 587 },
    smtpSecure: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    smtpUser: { type: DataTypes.STRING(200), allowNull: true },
    smtpPassEnc: { type: DataTypes.TEXT, allowNull: true },
    /** Remitente visible (From). Suele ser el mismo correo SMTP. */
    smtpFrom: { type: DataTypes.STRING(200), allowNull: true },
    invoiceEmailDailyLimit: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 80,
    },
    invoiceEmailsSentDate: { type: DataTypes.DATEONLY, allowNull: true },
    invoiceEmailsSentCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  { timestamps: true },
);

/**
 * Bandeja futura de comprobantes electrónicos.
 * Hoy no se emiten; la tabla queda lista para autorización SRI.
 */
export const ElectronicInvoice = sequelize.define(
  "electronic_invoices",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    environment: {
      type: DataTypes.ENUM("pruebas", "produccion"),
      allowNull: false,
      defaultValue: "pruebas",
    },
    /** 01 factura, 04 nota crédito, etc. */
    documentType: {
      type: DataTypes.STRING(2),
      allowNull: false,
      defaultValue: "01",
    },
    establishmentCode: { type: DataTypes.STRING(3), allowNull: false },
    emissionPointCode: { type: DataTypes.STRING(3), allowNull: false },
    sequential: { type: DataTypes.INTEGER, allowNull: false },
    accessKey: { type: DataTypes.STRING(49), allowNull: true },
    authorizationNumber: { type: DataTypes.STRING(49), allowNull: true },
    authorizedAt: { type: DataTypes.DATE, allowNull: true },
    status: {
      type: DataTypes.ENUM(
        "draft",
        "signed",
        "sent",
        "authorized",
        "rejected",
        "cancelled",
      ),
      allowNull: false,
      defaultValue: "draft",
    },
    customerId: { type: DataTypes.INTEGER, allowNull: true },
    orderId: { type: DataTypes.INTEGER, allowNull: true },
    customerIdentType: { type: DataTypes.STRING(2), allowNull: true },
    customerIdent: { type: DataTypes.STRING(20), allowNull: true },
    customerName: { type: DataTypes.STRING(300), allowNull: true },
    customerEmail: { type: DataTypes.STRING(120), allowNull: true },
    subtotal: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    /** Impuesto a consumos especiales (ICE); 0 si no aplica */
    iceTotal: {
      type: DataTypes.DECIMAL(14, 4),
      allowNull: false,
      defaultValue: 0,
    },
    taxTotal: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    total: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: "USD",
    },
    xmlRelativePath: { type: DataTypes.STRING(255), allowNull: true },
    ridePdfRelativePath: { type: DataTypes.STRING(255), allowNull: true },
    invoiceEmailSentAt: { type: DataTypes.DATE, allowNull: true },
    sriMessage: { type: DataTypes.TEXT, allowNull: true },
    payloadJson: { type: DataTypes.JSON, allowNull: true },
  },
  { timestamps: true },
);
