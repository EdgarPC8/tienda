import { DataTypes } from 'sequelize';
import { sequelize } from '../database/connection.js';
import { Account } from './Account.js';
import { repairJsonFieldValue } from '../utils/jsonFieldUtils.js';

function defineJsonField(fieldName) {
  return {
    type: DataTypes.JSON,
    allowNull: true,
    get() {
      return repairJsonFieldValue(this.getDataValue(fieldName));
    },
    set(value) {
      this.setDataValue(fieldName, repairJsonFieldValue(value));
    },
  };
}

// models/Catalog.js



export const InventoryMovement = sequelize.define('ERP_inventory_movements', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  productId: { type: DataTypes.INTEGER, allowNull: false },
  quantity: { type: DataTypes.FLOAT, allowNull: false },

  description: { type: DataTypes.TEXT },

  // costo unitario (para entradas/producción y para valorar pérdidas)
  price: { type: DataTypes.DECIMAL(14, 6), allowNull: true },

  type: { type: DataTypes.ENUM("entrada", "salida", "ajuste", "produccion"), allowNull: false },

  // NUEVO: motivo específico
  reason: {
    type: DataTypes.ENUM(
      "ENTRADA_PRODUCCION",
      "ENTRADA_COMPRA",
      "ENTRADA_DEVOLUCION",
      "ENTRADA_OTRA",
      "SALIDA_VENTA",
      "SALIDA_YAPA",
      "SALIDA_DANIADO",
      "SALIDA_CADUCADO",
      "SALIDA_CONSUMO_INTERNO",
      "SALIDA_CONSUMO",
      "SALIDA_MERMA",
      "SALIDA_OTRA",
      "SALIDA_REEMPLAZO",
      "AJUSTE_ENTRADA",
      "AJUSTE_SALIDA",
      "PRODUCCION_FINAL",
    ),
    allowNull: true,
  },
  referenceType: { type: DataTypes.STRING, allowNull: true }, // "order", "purchase", "production", etc.
  referenceId: { type: DataTypes.INTEGER, allowNull: true },

  date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  createdBy: { type: DataTypes.INTEGER, allowNull: false }
});



// Tabla de recetas: define qué productos (insumos) componen un producto final
export const InventoryRecipe = sequelize.define('ERP_inventory_recipes', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  productFinalId: { type: DataTypes.INTEGER, allowNull: false }, // Producto final
  productRawId: { type: DataTypes.INTEGER, allowNull: false },   // Insumo
  quantity: { type: DataTypes.FLOAT, allowNull: false },         // Cantidad del insumo
  isQuantityInGrams: { type: DataTypes.BOOLEAN,defaultValue:false},       // Cantidad del insumo
  itemType: { 
    type: DataTypes.ENUM('insumo', 'material'), 
    allowNull: false, 
    defaultValue: 'insumo' 
  }
}, {
  timestamps: false
});

export const InventoryCategory = sequelize.define("ERP_inventory_categories", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: { type: DataTypes.TEXT },
  isPublic: {            // 👈 nueva columna
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  /** Tramos compartidos en caja: ej. 4 panes (cualquier variedad) = $0.50 */
  packageTiers: defineJsonField("packageTiers"),
  /** Etiqueta en caja para la canasta surtido (ej. "Pan surtido") */
  mixMatchLabel: { type: DataTypes.STRING(120), allowNull: true },
  /** IDs de productos que entran en el surtido/tramo (JSON array) */
  mixMatchProductIds: defineJsonField("mixMatchProductIds"),
  /** Categoría padre (null = categoría principal) */
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "ERP_inventory_categories", key: "id" },
  },

}, {
  timestamps: false
});

export const InventoryUnit = sequelize.define('ERP_inventory_units', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  abbreviation: { type: DataTypes.STRING, allowNull: false }, // Ej: kg, l, un
  description: { type: DataTypes.STRING },
  factor: { type: DataTypes.FLOAT, defaultValue: 0 },

}, {
  timestamps: false
});
export const InventoryProduct = sequelize.define('ERP_inventory_products', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  desc: { type: DataTypes.TEXT, defaultValue: null },
  type: {
    type: DataTypes.ENUM('raw', 'intermediate', 'final'),
    defaultValue: 'raw',
    allowNull: false,
  },
  unitId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'ERP_inventory_units', key: 'id' },
  },

  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'ERP_inventory_categories', key: 'id' },
  },

  standardWeightGrams: { type: DataTypes.FLOAT, defaultValue: 0 },
  netWeight: { type: DataTypes.FLOAT, defaultValue: 0 },

  stock: { type: DataTypes.FLOAT, defaultValue: 0 },
  minStock: { type: DataTypes.FLOAT, defaultValue: 0 },

  // 💰 Precios (hasta 6 decimales en BD; pantalla según config de la app)
  /** Precio de venta al público (lo que normalmente vale). */
  price: { type: DataTypes.DECIMAL(14, 6), defaultValue: 0 },
  /** Precio al que el proveedor vende a la panadería. */
  supplierPrice: { type: DataTypes.DECIMAL(14, 6), defaultValue: 0 },
  wholesaleRules: defineJsonField("wholesaleRules"),
  /** Tramos opcionales: [{ qty, totalPrice }] — ej. 2 pans = $0.25 */
  packageTiers: defineJsonField("packageTiers"),
  /** Precio para que distribuidores revendan. */
  distributorPrice: { type: DataTypes.DECIMAL(14, 6), defaultValue: 0 },
  taxRate: { type: DataTypes.DECIMAL(5,2), defaultValue: 0 }, // % IVA
  // 📦 Identificadores
  sku: { type: DataTypes.STRING(64), unique: true, allowNull: true },
  barcode: { type: DataTypes.STRING(64), unique: true, allowNull: true },

  // 🏷️ Estado y metadatos
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  primaryImageUrl: { type: DataTypes.STRING(500), allowNull: true }, // imagen rápida para listado
  /** Insumo genérico de receta (Harina, Aceite…). No es compra por marca. */
  isGenericIngredient: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  /** Si no es null, este producto es presentación/marca del insumo genérico indicado. */
  genericProductId: { type: DataTypes.INTEGER, allowNull: true },
  /**
   * Unidades que entrega una presentación al abrirse.
   * El destino puede ser un insumo genérico o un producto final unitario.
   */
  unitsPerPack: { type: DataTypes.INTEGER, allowNull: true },
  /** Detalle de presentación: "Funda 900ml", "Quintal Pani Plus", etc. */
  purchasePresentation: { type: DataTypes.STRING(200), allowNull: true },
}, {
  timestamps: true,
  indexes: [
    { fields: ['categoryId'] },
    { fields: ['type'] },
    { fields: ['isActive'] },
    { unique: true, fields: ['sku'] },
  ],
});



export const HomeProduct = sequelize.define("ERP_home_products", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  // FK al producto "real" del inventario (puede ser NULL si es puramente visual)
  productId: { type: DataTypes.INTEGER, allowNull: true },

  // Campos “desacoplados” para mostrar en el Home (pueden diferir del producto base)
  name: { type: DataTypes.STRING, allowNull: false },          // título que se muestra
  description: { type: DataTypes.TEXT, allowNull: true },      // descripción corta
  imageUrl: { type: DataTypes.STRING(500), allowNull: true },  // imagen para el home
  priceOverride: { type: DataTypes.DECIMAL(14, 6), allowNull: true },   // precio opcional para mostrar (si difiere)

  // Meta para vitrina
  section: {
    type: DataTypes.ENUM("home", "offers", "recommended", "new"),
    allowNull: false,
    defaultValue: "home",
  },
  badge: { type: DataTypes.STRING(50), allowNull: true },      // ej. “-20%”, “Nuevo”
  position: { type: DataTypes.INTEGER, defaultValue: 0 },      // orden en la sección
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },   // visible en el home

  // Auditoría opcional
  createdBy: { type: DataTypes.INTEGER, allowNull: true },
}, {
  timestamps: true,
});
// models/Store.js


export const Catalog = sequelize.define("ERP_catalog", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  productId: { type: DataTypes.INTEGER, allowNull: false },

section: {
  type: DataTypes.ENUM(
    "home",           // sección principal de portada
    "ofertas",         // ofertas y promociones activas
    "recomendados",    // recomendados por el sistema o el panadero 😄
    "bajo_pedido",    // productos hechos solo bajo pedido
    "novedades",      // nuevos productos o lanzamientos
    "descuentos",     // artículos con rebaja temporal
    "populares",      // más vendidos o con mejores valoraciones
    "temporada",      // productos de temporada (Navidad, Día del Padre, etc.)
    "especiales",     // combinaciones, cajas o paquetes únicos
    "limitados"       // productos con stock limitado o edición especial
  ),
  allowNull: false,
  defaultValue: "home",
},


  // Personalización visual de la tarjeta del producto
  title: { type: DataTypes.STRING(150), allowNull: true },
  subtitle: { type: DataTypes.STRING(250), allowNull: true },
  imageUrl: { type: DataTypes.STRING(500), allowNull: true },
  badge: { type: DataTypes.STRING(50), allowNull: true },

  // Orden y visibilidad
  position: { type: DataTypes.INTEGER, defaultValue: 0 },
  minOrderQty: { type: DataTypes.INTEGER, allowNull: true },

  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

  priceOverride: { type: DataTypes.DECIMAL(14, 6), allowNull: true },
  wholesaleOverrideRules: { type: DataTypes.JSON, allowNull: true },

  // Control temporal y sucursal (opcional)
  storeId: { type: DataTypes.INTEGER, allowNull: true },
  startsAt: { type: DataTypes.DATE, allowNull: true },
  endsAt: { type: DataTypes.DATE, allowNull: true },
}, {
  timestamps: true,
  indexes: [
    { fields: ["section", "isActive"] },
    { fields: ["position"] },
    { fields: ["productId"] },
    { unique: true, fields: ["productId", "section", "storeId"] },
  ],
});

export const Store = sequelize.define(
  "ERP_stores",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    // Datos visibles en la vitrina
    name: { type: DataTypes.STRING(120), allowNull: false },       // Ej: "Sucursal Centro"
    address: { type: DataTypes.STRING(250), allowNull: false },    // Dirección corta/mostrable
    description: { type: DataTypes.TEXT, allowNull: true },        // (opcional) texto ampliado
    imageUrl: { type: DataTypes.STRING(500), allowNull: true },    // Imagen de portada (StoresPanel usa este campo)

    // Contacto (opcional)
    phone: { type: DataTypes.STRING(40), allowNull: true },        // Ej: "+593 99 999 9999"
    email: { type: DataTypes.STRING(120), allowNull: true },

    // Ubicación (opcional, útil si luego quieres mapa)
    city: { type: DataTypes.STRING(100), allowNull: true },
    province: { type: DataTypes.STRING(100), allowNull: true },
    latitude: { type: DataTypes.FLOAT, allowNull: true, defaultValue: null },
    longitude: { type: DataTypes.FLOAT, allowNull: true, defaultValue: null },

    // Meta UI / ordenamiento y visibilidad
    position: { type: DataTypes.INTEGER, defaultValue: 0 },        // orden en lista
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },     // operativo (turno, stock, movimientos)
    /** Vitrina pública (home / punto de venta). Si isActive=false → forzar false. */
    isVisible: { type: DataTypes.BOOLEAN, defaultValue: true },

    /**
     * propia = sucursal con turno/caja
     * vitrina = local ajeno (sin stock inventariable)
     * bodega = almacén (stock, sin turno/caja)
     */
    locationKind: {
      type: DataTypes.ENUM("propia", "vitrina", "bodega"),
      allowNull: false,
      defaultValue: "vitrina",
    },

    /**
     * Códigos fiscales SRI del local (mismo RUC, otro establecimiento).
     * Relevantes sobre todo en sucursales propias.
     */
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

    // Auditoría
    createdBy: { type: DataTypes.INTEGER, allowNull: true },       // FK -> Account.id
  },
  {
    timestamps: true, // createdAt, updatedAt
    indexes: [
      { fields: ["isActive"] },
      { fields: ["isVisible"] },
      { fields: ["position"] },
      { fields: ["city"] },
      { fields: ["province"] },
      { fields: ["locationKind"] },
      { fields: ["establishmentCode", "emissionPointCode"] },
    ],
  }
);

// Tabla principal de productos o insumos


export const StoreProduct = sequelize.define("ERP_store_products", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

  storeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'ERP_stores', key: 'id' },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'ERP_inventory_products', key: 'id' },
    onDelete: 'CASCADE',
    onUpdate: 'CASCADE',
  },

  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },

  /** Organización visual dentro del local (no afecta stock). */
  exhibidorId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Exhibidor del local; null = sin asignar. El stock sigue siendo por local.",
  },
}, {
  timestamps: true,
  indexes: [
    { unique: true, fields: ["storeId", "productId"] },
    { fields: ["isActive"] },
    { fields: ["exhibidorId"] },
  ],
});

/**
 * Exhibidor = zona/estante del local solo para organizar productos.
 * No lleva cantidad de stock (el stock es StoreStock por local).
 */
export const StoreExhibidor = sequelize.define(
  "ERP_store_exhibidores",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    storeId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "ERP_stores", key: "id" },
      onDelete: "CASCADE",
      onUpdate: "CASCADE",
    },
    name: { type: DataTypes.STRING(120), allowNull: false },
    position: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["storeId", "position"] },
      { fields: ["storeId", "isActive"] },
    ],
  },
);


Store.belongsToMany(InventoryProduct, {
  through: StoreProduct,
  foreignKey: 'storeId',
  otherKey: 'productId',
});

InventoryProduct.belongsToMany(Store, {
  through: StoreProduct,
  foreignKey: 'productId',
  otherKey: 'storeId',
});

// StoreProduct ↔ InventoryProduct
StoreProduct.belongsTo(InventoryProduct, { foreignKey: 'productId' });
InventoryProduct.hasMany(StoreProduct, { foreignKey: 'productId' });

Store.hasMany(StoreExhibidor, { foreignKey: "storeId", as: "exhibidores", onDelete: "CASCADE" });
StoreExhibidor.belongsTo(Store, { foreignKey: "storeId", as: "store" });

StoreExhibidor.hasMany(StoreProduct, { foreignKey: "exhibidorId", as: "storeProducts" });
StoreProduct.belongsTo(StoreExhibidor, { foreignKey: "exhibidorId", as: "exhibidor" });

// InventoryProduct ↔ Category / Unit
InventoryProduct.belongsTo(InventoryCategory, { foreignKey: 'categoryId' });
InventoryProduct.belongsTo(InventoryUnit, { foreignKey: 'unitId' });




// Asociaciones
Catalog.belongsTo(InventoryProduct, { foreignKey: "productId", as: "product" });
InventoryProduct.hasMany(Catalog, { foreignKey: "productId", as: "catalogEntries" });



// === Asociaciones ===
Store.belongsTo(Account, { foreignKey: "createdBy" });
// (Si luego quieres relación con pedidos o inventario, aquí añades más asociaciones)

// === Asociaciones ===
HomeProduct.belongsTo(InventoryProduct, {
  foreignKey: "productId",
  as: "product",
  onDelete: "SET NULL",
  onUpdate: "CASCADE",
});
InventoryProduct.hasMany(HomeProduct, {
  foreignKey: "productId",
  as: "homeEntries",
});


InventoryCategory.hasMany(InventoryProduct, {
  foreignKey: "categoryId",
  onDelete: "SET NULL"
});
InventoryProduct.belongsTo(InventoryCategory, {
  foreignKey: "categoryId"
});

InventoryCategory.belongsTo(InventoryCategory, {
  as: "parent",
  foreignKey: "parentId",
});
InventoryCategory.hasMany(InventoryCategory, {
  as: "children",
  foreignKey: "parentId",
});


// Relación para producto final → receta
InventoryProduct.hasMany(InventoryRecipe, { foreignKey: 'productFinalId', as: 'recipe' });
InventoryRecipe.belongsTo(InventoryProduct, { foreignKey: 'productFinalId', as: 'finalProduct' });

// Relación para insumo en receta
InventoryProduct.hasMany(InventoryRecipe, { foreignKey: 'productRawId', as: 'usedInRecipes' });
InventoryRecipe.belongsTo(InventoryProduct, { foreignKey: 'productRawId', as: 'rawProduct' });

InventoryProduct.hasMany(InventoryMovement, { foreignKey: 'productId', onDelete: 'CASCADE' });
InventoryMovement.belongsTo(InventoryProduct, { foreignKey: 'productId' });
InventoryUnit.hasMany(InventoryProduct, { foreignKey: 'unitId' });
InventoryProduct.belongsTo(InventoryUnit, { foreignKey: 'unitId' });

/** Lotes de inventario con fecha de vencimiento (stock por lote + historial). */
export const InventoryBatch = sequelize.define(
  "ERP_inventory_batches",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "ERP_inventory_products", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "CASCADE",
    },
    /** Local / bodega del lote (multistock). Null = sin asignar o modo un local. */
    storeId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "ERP_stores", key: "id" },
      onUpdate: "CASCADE",
      onDelete: "SET NULL",
    },
    code: { type: DataTypes.STRING(80), allowNull: true },
    quantityInitial: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    quantityRemaining: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
    /** Fecha de vencimiento / caducidad (obligatoria). */
    expiresAt: { type: DataTypes.DATEONLY, allowNull: false },
    /** Fecha de elaboración (opcional; sirve para calcular vida útil). */
    manufacturedAt: { type: DataTypes.DATEONLY, allowNull: true },
    /** Cuándo se recibió / registró el lote. */
    receivedAt: { type: DataTypes.DATE, allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    status: {
      type: DataTypes.ENUM("active", "depleted"),
      allowNull: false,
      defaultValue: "active",
    },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
  },
  {
    timestamps: true,
    indexes: [
      { fields: ["productId"] },
      { fields: ["expiresAt"] },
      { fields: ["status"] },
      { fields: ["productId", "expiresAt"] },
    ],
  },
);

InventoryProduct.hasMany(InventoryBatch, {
  foreignKey: "productId",
  as: "batches",
  onDelete: "CASCADE",
});
InventoryBatch.belongsTo(InventoryProduct, {
  foreignKey: "productId",
  as: "product",
});
InventoryBatch.belongsTo(Store, {
  foreignKey: "storeId",
  as: "store",
});
Store.hasMany(InventoryBatch, {
  foreignKey: "storeId",
  as: "batches",
});
InventoryBatch.belongsTo(Account, { foreignKey: "createdBy", as: "creator" });

// Insumo genérico ↔ presentaciones / marcas
InventoryProduct.belongsTo(InventoryProduct, {
  as: 'genericProduct',
  foreignKey: 'genericProductId',
});
InventoryProduct.hasMany(InventoryProduct, {
  as: 'brandedPresentations',
  foreignKey: 'genericProductId',
});

InventoryMovement.belongsTo(Account, { foreignKey: "createdBy" });

// Grupos comparativos de productos (vitrina: pasteles vainilla/chocolate × tamaño × humedad)
export const ProductCompareGroup = sequelize.define("ERP_product_compare_groups", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  subtitle: { type: DataTypes.STRING(250), allowNull: true },
  imageUrl: { type: DataTypes.STRING(500), allowNull: true },
  section: {
    type: DataTypes.ENUM(
      "home",
      "ofertas",
      "recomendados",
      "bajo_pedido",
      "novedades",
      "descuentos",
      "populares",
      "temporada",
      "especiales",
      "limitados"
    ),
    allowNull: false,
    defaultValue: "home",
  },
  fillings: { type: DataTypes.JSON, allowNull: true },
  rowLabel: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "Tamaño" },
  columnLabel: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "Tipo" },
  variantLabel: { type: DataTypes.STRING(80), allowNull: true, defaultValue: "Sabor" },
  position: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  hideMemberProducts: { type: DataTypes.BOOLEAN, defaultValue: true },
}, {
  timestamps: true,
  indexes: [
    { fields: ["section", "isActive"] },
    { fields: ["position"] },
  ],
});

export const ProductCompareGroupItem = sequelize.define("ERP_product_compare_group_items", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "ERP_product_compare_groups", key: "id" },
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: "ERP_inventory_products", key: "id" },
    onDelete: "CASCADE",
    onUpdate: "CASCADE",
  },
  rowKey: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
  rowSort: { type: DataTypes.INTEGER, defaultValue: 0 },
  rowMeta: { type: DataTypes.STRING(120), allowNull: true },
  columnKey: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
  columnSort: { type: DataTypes.INTEGER, defaultValue: 0 },
  variantKey: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "default" },
  variantSort: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  timestamps: true,
  indexes: [
    { fields: ["groupId"] },
    { fields: ["productId"] },
    { unique: true, fields: ["groupId", "productId"] },
  ],
});

ProductCompareGroup.hasMany(ProductCompareGroupItem, {
  foreignKey: "groupId",
  as: "items",
  onDelete: "CASCADE",
});
ProductCompareGroupItem.belongsTo(ProductCompareGroup, {
  foreignKey: "groupId",
  as: "group",
});
ProductCompareGroupItem.belongsTo(InventoryProduct, {
  foreignKey: "productId",
  as: "product",
});
InventoryProduct.hasMany(ProductCompareGroupItem, {
  foreignKey: "productId",
  as: "compareGroupItems",
});

/** Grupos de tramos en caja: vincula categoría + productos + precios por cantidad (canasta surtido). */
export const PricingTierGroup = sequelize.define("ERP_pricing_tier_groups", {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(150), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  /** Subcategoría de referencia para filtrar productos en el formulario */
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: "ERP_inventory_categories", key: "id" },
    onUpdate: "CASCADE",
    onDelete: "SET NULL",
  },
  packageTiers: defineJsonField("packageTiers"),
  productIds: defineJsonField("productIds"),
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  position: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  timestamps: true,
  indexes: [
    { fields: ["categoryId"] },
    { fields: ["isActive"] },
    { fields: ["position"] },
  ],
});

PricingTierGroup.belongsTo(InventoryCategory, {
  foreignKey: "categoryId",
  as: "category",
});
InventoryCategory.hasMany(PricingTierGroup, {
  foreignKey: "categoryId",
  as: "pricingTierGroups",
});


