/**
 * Seed mínimo Store: roles + usuario Edgar + cuenta administrador.
 * BD propia (`store`), sin datos de negocio de EdDeli.
 * Ejecutar: npm run seed
 */
import { sequelize } from "./connection.js";
import { Roles } from "../models/Roles.js";
import { Users } from "../models/Users.js";
import { Account, AccountRoles } from "../models/Account.js";

const ROLES = [
  { id: 1, name: "Programador" },
  { id: 2, name: "Administrador" },
  { id: 3, name: "Profesional" },
  { id: 4, name: "Empleado" },
];

const EDGAR_USER = {
  id: 1,
  ci: "1104661598",
  documentType: "Cedula",
  firstName: "Edgar",
  secondName: "Patricio",
  firstLastName: "Torres",
  secondLastName: "Condolo",
  birthday: "2000-07-05",
  gender: "M",
  photo: null,
};

/** Misma cuenta local que EdDeli: administrador / 12345678 */
const EDGAR_ACCOUNT = {
  id: 1,
  username: "administrador",
  password: "$2b$10$cQWP88LnQCA9M1DBv7msCOrgirHtDfq6Vfabj5LrnMPUy4MylUNzS",
  userId: 1,
};

const EDGAR_ACCOUNT_ROLES = [
  { accountId: 1, roleId: 1 },
  { accountId: 1, roleId: 2 },
  { accountId: 1, roleId: 4 },
];

async function seed() {
  await sequelize.authenticate();

  const yaExiste = await Account.findOne({ where: { username: "administrador" } });
  if (yaExiste) {
    console.log("ℹ️  Ya existe la cuenta «administrador». No se duplica el seed.");
    await sequelize.close();
    return;
  }

  const t = await sequelize.transaction();
  try {
    for (const role of ROLES) {
      await Roles.findOrCreate({
        where: { id: role.id },
        defaults: role,
        transaction: t,
      });
    }

    if (!(await Users.findByPk(1, { transaction: t }))) {
      await Users.create(EDGAR_USER, { transaction: t });
    }

    await Account.create(EDGAR_ACCOUNT, { transaction: t });
    await AccountRoles.bulkCreate(EDGAR_ACCOUNT_ROLES, { transaction: t });

    await t.commit();
    console.log("✅ Seed Store: roles + Edgar + cuenta administrador.");
    console.log("   Login: administrador / 12345678");
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
