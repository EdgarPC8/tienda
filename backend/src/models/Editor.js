// models/Editor.js
import { DataTypes } from "sequelize";
import { sequelize } from "../database/connection.js";
import { Account } from "./Account.js";
     // si quieres apuntar a catalog entries

/**
 * =========================
 * 1) TEMPLATES (Plantillas)
 * =========================
 */
export const EditorTemplate = sequelize.define(
  "editor_templates",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // “Banner 16:9 EdDeli”, “Story 9:16”, etc.
    name: { type: DataTypes.STRING(160), allowNull: false },

    // para multi-app (EdDeli/SoftEd/etc)
    app: { type: DataTypes.STRING(60), allowNull: true },

    // formato lógico (16:9, 1:1, 9:16) o el que manejes
    format: { type: DataTypes.STRING(30), allowNull: true },

    canvasWidth: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1920 },
    canvasHeight: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1080 },

    backgroundSrc: { type: DataTypes.STRING(800), allowNull: true },

    // principal/default por app+format (controlado por tu lógica)
    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },

    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

    createdBy: { type: DataTypes.INTEGER, allowNull: false },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["app", "format"] },
      { fields: ["isDefault"] },
      { fields: ["isActive"] },
    ],
  }
);

/**
 * =========================
 * 2) GROUPS (Grupos)
 * =========================
 */
export const EditorTemplateGroup = sequelize.define(
  "editor_template_groups",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    templateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "editor_templates", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    // id lógico estable: group_title, group_product...
    key: { type: DataTypes.STRING(80), allowNull: false },

    x: { type: DataTypes.INTEGER, defaultValue: 0 },
    y: { type: DataTypes.INTEGER, defaultValue: 0 },

    locked: { type: DataTypes.BOOLEAN, defaultValue: false },
    visible: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  {
    timestamps: false,
    indexes: [{ unique: true, fields: ["templateId", "key"] }],
  }
);

/**
 * =========================
 * 3) LAYERS (Capas)
 * =========================
 */
export const EditorTemplateLayer = sequelize.define(
  "editor_template_layers",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    templateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "editor_templates", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    groupId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "editor_template_groups", key: "id" },
      onDelete: "SET NULL",
      onUpdate: "CASCADE",
    },

    // id lógico estable (IMPORTANTE para cambiar plantilla y reusar overrides)
    key: { type: DataTypes.STRING(120), allowNull: false },

    type: { type: DataTypes.ENUM("image", "text", "shape"), allowNull: false },

    x: { type: DataTypes.INTEGER, defaultValue: 0 },
    y: { type: DataTypes.INTEGER, defaultValue: 0 },
    w: { type: DataTypes.INTEGER, defaultValue: 100 },
    h: { type: DataTypes.INTEGER, defaultValue: 100 },

    zIndex: { type: DataTypes.INTEGER, defaultValue: 1 },

    name: { type: DataTypes.STRING(150), allowNull: true }, // etiqueta humana opcional

    visible: { type: DataTypes.BOOLEAN, defaultValue: true },
    locked: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  {
    timestamps: false,
    indexes: [
      { unique: true, fields: ["templateId", "key"] },
      { fields: ["templateId", "type"] },
      { fields: ["zIndex"] },
    ],
  }
);

/**
 * =========================
 * 4) LAYER PROPS (Props “Photoshop”)
 *    Guarda TODO en key/value (flexible)
 * =========================
 */
export const EditorLayerProp = sequelize.define(
  "editor_layer_props",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    layerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "editor_template_layers", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    // ejemplo: text, fontFamily, fontSize, color, align, src, fit, fill, borderRadius...
    propKey: { type: DataTypes.STRING(80), allowNull: false },

    // Guardamos como string + json para flexibilidad:
    // - valueText para cosas simples
    // - valueJson para estructuras (ej: gradient, shadow, stroke)
    valueText: { type: DataTypes.TEXT, allowNull: true },
    valueJson: { type: DataTypes.JSON, allowNull: true },

    // tipo sugerido (no obligatorio, pero ayuda)
    valueType: {
      type: DataTypes.ENUM("string", "number", "boolean", "json"),
      allowNull: false,
      defaultValue: "string",
    },
  },
  {
    timestamps: false,
    indexes: [{ unique: true, fields: ["layerId", "propKey"] }],
  }
);

/**
 * =========================
 * 5) BINDS (Enlaces a data)
 * =========================
 */
export const EditorLayerBind = sequelize.define(
  "editor_layer_binds",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    layerId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "editor_template_layers", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    // para text layers: ruta en data -> "data.catalog.displayName"
    textFrom: { type: DataTypes.STRING(300), allowNull: true },

    // para image layers: ruta en data -> "data.catalog.imageUrl"
    srcFrom: { type: DataTypes.STRING(300), allowNull: true },

    // prefijos y fallbacks
    srcPrefix: { type: DataTypes.STRING(400), allowNull: true },
    fallbackSrc: { type: DataTypes.STRING(800), allowNull: true },

    // utilidades
    maxLen: { type: DataTypes.INTEGER, allowNull: true },

    // si después quieres: formatter, uppercase, currency, etc.
    // ruleJson: { type: DataTypes.JSON, allowNull: true },
  },
  {
    timestamps: false,
    indexes: [{ unique: true, fields: ["layerId"] }],
  }
);

/**
 * =========================
 * 6) DESIGNS (Instancias / Proyectos)
 *    Ej: “Banner Yoyos enero”
 * =========================
 */
export const EditorDesign = sequelize.define(
  "editor_designs",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    templateId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "editor_templates", key: "id" },
      onDelete: "RESTRICT",
      onUpdate: "CASCADE",
    },

    name: { type: DataTypes.STRING(160), allowNull: false },

    // target (para enlazar al mundo ERP)
    targetType: {
      type: DataTypes.ENUM("product", "catalog", "homeProduct", "custom"),
      allowNull: false,
      defaultValue: "custom",
    },
    targetId: { type: DataTypes.INTEGER, allowNull: true },

    // data “resuelta” para binds (product/catalog/computed...)
    dataJson: { type: DataTypes.JSON, allowNull: true },

    // export final si guardas imagen
    exportedUrl: { type: DataTypes.STRING(800), allowNull: true },

    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

    createdBy: { type: DataTypes.INTEGER, allowNull: false },
    updatedBy: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["templateId"] },
      { fields: ["targetType", "targetId"] },
      { fields: ["isActive"] },
    ],
  }
);

/**
 * =========================
 * 7) OVERRIDES por capa (lo que el usuario cambia)
 * =========================
 */
export const EditorDesignLayerOverride = sequelize.define(
  "editor_design_layer_overrides",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    designId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "editor_designs", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },

    // apuntamos por KEY estable de capa (no por id numérico)
    // para que puedas cambiar de plantilla y “reusar” overrides si coincide el key.
    layerKey: { type: DataTypes.STRING(120), allowNull: false },

    // overrides: mover, resize, visible, locked, zIndex...
    x: { type: DataTypes.INTEGER, allowNull: true },
    y: { type: DataTypes.INTEGER, allowNull: true },
    w: { type: DataTypes.INTEGER, allowNull: true },
    h: { type: DataTypes.INTEGER, allowNull: true },
    zIndex: { type: DataTypes.INTEGER, allowNull: true },

    visible: { type: DataTypes.BOOLEAN, allowNull: true },
    locked: { type: DataTypes.BOOLEAN, allowNull: true },

    // props override en key/value (igual que props base)
    propsJson: { type: DataTypes.JSON, allowNull: true },

    // bind override (si el usuario cambia la referencia)
    bindJson: { type: DataTypes.JSON, allowNull: true },
  },
  {
    timestamps: false,
    indexes: [{ unique: true, fields: ["designId", "layerKey"] }],
  }
);

/**
 * =========================
 * ENLACES / ASOCIACIONES
 * =========================
 */

// Template auditoría
EditorTemplate.belongsTo(Account, { foreignKey: "createdBy", as: "creator" });
EditorTemplate.belongsTo(Account, { foreignKey: "updatedBy", as: "updater" });

// Template -> Groups / Layers
EditorTemplate.hasMany(EditorTemplateGroup, {
  foreignKey: "templateId",
  as: "groups",
  onDelete: "CASCADE",
});
EditorTemplateGroup.belongsTo(EditorTemplate, { foreignKey: "templateId", as: "template" });

EditorTemplate.hasMany(EditorTemplateLayer, {
  foreignKey: "templateId",
  as: "layers",
  onDelete: "CASCADE",
});
EditorTemplateLayer.belongsTo(EditorTemplate, { foreignKey: "templateId", as: "template" });

// Group -> Layers
EditorTemplateGroup.hasMany(EditorTemplateLayer, { foreignKey: "groupId", as: "layers" });
EditorTemplateLayer.belongsTo(EditorTemplateGroup, { foreignKey: "groupId", as: "group" });

// Layer -> Props / Bind
EditorTemplateLayer.hasMany(EditorLayerProp, { foreignKey: "layerId", as: "props" });
EditorLayerProp.belongsTo(EditorTemplateLayer, { foreignKey: "layerId", as: "layer" });

EditorTemplateLayer.hasOne(EditorLayerBind, { foreignKey: "layerId", as: "bind" });
EditorLayerBind.belongsTo(EditorTemplateLayer, { foreignKey: "layerId", as: "layer" });

// Designs
EditorDesign.belongsTo(EditorTemplate, { foreignKey: "templateId", as: "template" });
EditorTemplate.hasMany(EditorDesign, { foreignKey: "templateId", as: "designs" });

EditorDesign.belongsTo(Account, { foreignKey: "createdBy", as: "creator" });
EditorDesign.belongsTo(Account, { foreignKey: "updatedBy", as: "updater" });

EditorDesign.hasMany(EditorDesignLayerOverride, { foreignKey: "designId", as: "overrides" });
EditorDesignLayerOverride.belongsTo(EditorDesign, { foreignKey: "designId", as: "design" });

/**
 * =========================
 * OPTIONAL: si quieres enlazar targetId a tablas reales
 * (No es FK estricta porque targetType cambia)
 * =========================
 */
// Ejemplo si targetType="product":
// InventoryProduct.hasMany(EditorDesign, { foreignKey: "targetId", constraints: false });
// EditorDesign.belongsTo(InventoryProduct, { foreignKey: "targetId", constraints: false });

// Ejemplo si targetType="catalog":
// Catalog.hasMany(EditorDesign, { foreignKey: "targetId", constraints: false });
// EditorDesign.belongsTo(Catalog, { foreignKey: "targetId", constraints: false });
