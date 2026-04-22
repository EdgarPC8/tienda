/**
 * Datos iniciales de Tienda (roles + usuario admin).
 * Ejecutar: npm run seed
 */
import { sequelize } from "./connection.js";
import "../models/index.js";
import { Roles } from "../models/Roles.js";
import { Users } from "../models/Users.js";
import { Account, AccountRoles } from "../models/Account.js";
import { MeasureUnit, ProductCategory } from "../models/Tienda.js";

/** Roles base solicitados para tienda */
const ROLES_TIENDA = [
  { id: 1, name: "Programador" },
  { id: 2, name: "Administrador" },
  { id: 3, name: "Empleado" },
];

/** Usuario base admin */
const ADMIN_USER = {
  id: 1,
  ci: "0000000001",
  documentType: "Cedula",
  firstName: "Admin",
  secondName: "",
  firstLastName: "Tienda",
  secondLastName: "",
  birthday: "2000-01-01",
  gender: "M",
  photo: null,
};

/** Cuenta base admin */
const ADMIN_ACCOUNT = {
  id: 1,
  username: "admin",
  password: "$2b$10$cQWP88LnQCA9M1DBv7msCOrgirHtDfq6Vfabj5LrnMPUy4MylUNzS",
  userId: 1,
};

/** account 1 con todos los roles base */
const ADMIN_ACCOUNT_ROLES = [
  { accountId: 1, roleId: 1 },
  { accountId: 1, roleId: 2 },
  { accountId: 1, roleId: 3 },
];

/**
 * Unidades base sugeridas para tienda.
 * Con esto ya puedes registrar compras tipo:
 * - 1 quintal = 100 libras
 * - 1 arroba = 25 libras
 */
const DEFAULT_UNITS = [
  { id: 1, name: "Libra", abbreviation: "lb", groupName: "peso", factorToBase: 1, isBase: true },
  { id: 2, name: "Arroba", abbreviation: "arroba", groupName: "peso", factorToBase: 25, isBase: false },
  { id: 3, name: "Quintal", abbreviation: "qq", groupName: "peso", factorToBase: 100, isBase: false },
  { id: 4, name: "Gramo", abbreviation: "g", groupName: "masa_g", factorToBase: 1, isBase: true },
  { id: 5, name: "Hectogramo", abbreviation: "hg", groupName: "masa_g", factorToBase: 100, isBase: false },
  { id: 6, name: "Kilogramo", abbreviation: "kg", groupName: "masa_g", factorToBase: 1000, isBase: false },
  { id: 7, name: "Mililitro", abbreviation: "ml", groupName: "volumen", factorToBase: 1, isBase: true },
  { id: 8, name: "Litro", abbreviation: "L", groupName: "volumen", factorToBase: 1000, isBase: false },
  { id: 9, name: "Unidad", abbreviation: "u", groupName: "unit", factorToBase: 1, isBase: true },
];

/**
 * Categorías = agrupaciones de catálogo. Cada producto real (marca, peso, sabor)
 * se crea aparte y se asigna a la subcategoría que corresponda.
 */
const DEFAULT_CATEGORIES = [
  { id: 1, name: "Abarrotes", slug: "abarrotes", parentId: null, sortOrder: 1, isActive: true },
  { id: 2, name: "Arroz", slug: "arroz", parentId: 1, sortOrder: 1, isActive: true },
  { id: 3, name: "Bebidas", slug: "bebidas", parentId: null, sortOrder: 2, isActive: true },
  { id: 4, name: "Aguas", slug: "aguas", parentId: 3, sortOrder: 1, isActive: true },
  { id: 5, name: "Jugos", slug: "jugos", parentId: 3, sortOrder: 2, isActive: true },
  { id: 6, name: "Gaseosas y refrescos", slug: "gaseosas-y-refrescos", parentId: 3, sortOrder: 3, isActive: true },
  { id: 7, name: "Lácteos", slug: "lacteos", parentId: null, sortOrder: 3, isActive: true },
  { id: 8, name: "Leches", slug: "leches", parentId: 7, sortOrder: 1, isActive: true },
  { id: 9, name: "Yogures", slug: "yogures", parentId: 7, sortOrder: 2, isActive: true },
  { id: 10, name: "Plásticos y desechables", slug: "plasticos-y-desechables", parentId: null, sortOrder: 4, isActive: true },
  { id: 11, name: "Servilletas", slug: "servilletas", parentId: 10, sortOrder: 1, isActive: true },
  { id: 12, name: "Platos y vasos desechables", slug: "platos-y-vasos-desechables", parentId: 10, sortOrder: 2, isActive: true },
  { id: 13, name: "Cubiertos desechables", slug: "cubiertos-desechables", parentId: 10, sortOrder: 3, isActive: true },
  { id: 14, name: "Snacks", slug: "snacks", parentId: null, sortOrder: 5, isActive: true },
  { id: 15, name: "Galletas", slug: "galletas", parentId: 14, sortOrder: 1, isActive: true },
  { id: 16, name: "Papitas y snacks salados", slug: "papitas-y-snacks-salados", parentId: 14, sortOrder: 2, isActive: true },
];

async function seed() {
  await sequelize.authenticate();
  await sequelize.sync();

  const yaExiste = await Account.findOne({ where: { username: "admin" } });
  if (yaExiste) {
    console.log("ℹ️  Ya existe la cuenta «admin». No se duplica el seed.");
    await sequelize.close();
    return;
  }

  const t = await sequelize.transaction();
  try {
    if ((await Roles.count({ transaction: t })) === 0) {
      await Roles.bulkCreate(ROLES_TIENDA, { transaction: t });
    }
    if ((await MeasureUnit.count({ transaction: t })) === 0) {
      await MeasureUnit.bulkCreate(DEFAULT_UNITS, { transaction: t });
    }
    if ((await ProductCategory.count({ transaction: t })) === 0) {
      await ProductCategory.bulkCreate(DEFAULT_CATEGORIES, { transaction: t });
    }
    if (!(await Users.findByPk(1, { transaction: t }))) {
      await Users.create(ADMIN_USER, { transaction: t });
    }
    await Account.create(ADMIN_ACCOUNT, { transaction: t });
    await AccountRoles.bulkCreate(ADMIN_ACCOUNT_ROLES, { transaction: t });

    await t.commit();
    console.log("✅ Roles base, cuenta admin, unidades y categorías iniciales de tienda creadas.");
    console.log("   Login: admin | contraseña: misma del hash cargado en seed/backup.");
  } catch (e) {
    await t.rollback();
    throw e;
  }

  await sequelize.close();
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
