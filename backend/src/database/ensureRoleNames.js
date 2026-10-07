import { Roles } from "../models/Roles.js";
import { AccountRoles } from "../models/Account.js";
import {
  ROLE_PROGRAMMER,
  ROLE_OWNER,
  ROLE_ADMIN,
  ROLE_EMPLOYEE,
  ROLE_SUPPLIER,
  ROLE_SUPPLIER_LEGACY,
} from "../utils/roleNames.js";

const ROLE_PROFESSIONAL_LEGACY = "Profesional";

async function ensureRoleByName(name) {
  let role = await Roles.findOne({ where: { name } });
  if (!role) {
    role = await Roles.create({ name });
  }
  return role;
}

/** Mueve AccountRoles de un rol viejo al destino y elimina el rol viejo (o lo renombra). */
async function retireRoleInto(oldName, targetName) {
  const old = await Roles.findOne({ where: { name: oldName } });
  if (!old) return;

  let target = await Roles.findOne({ where: { name: targetName } });
  if (!target) {
    await old.update({ name: targetName });
    return;
  }
  if (old.id === target.id) return;

  const links = await AccountRoles.findAll({ where: { roleId: old.id } });
  for (const link of links) {
    const already = await AccountRoles.findOne({
      where: { accountId: link.accountId, roleId: target.id },
    });
    if (already) {
      await link.destroy();
    } else {
      await link.update({ roleId: target.id });
    }
  }
  await old.destroy();
}

/**
 * Roles canónicos: Propietario, Administrador, Empleado, Programador, Proveedor.
 * - Propietarios → Propietario
 * - Programador antiguo (único poder) → Propietario + Programador nuevo
 * - Proovedor / Profesional → Proveedor
 */
export async function ensureOwnerAndProgrammerRoles() {
  let owner = await Roles.findOne({ where: { name: ROLE_OWNER } });
  if (!owner) {
    const plural = await Roles.findOne({ where: { name: "Propietarios" } });
    if (plural) {
      await plural.update({ name: ROLE_OWNER });
      owner = plural;
    }
  }
  if (!owner) {
    const previous = await Roles.findOne({ where: { name: ROLE_PROGRAMMER } });
    if (previous) {
      await previous.update({ name: ROLE_OWNER });
    } else {
      await Roles.create({ name: ROLE_OWNER });
    }
  }

  await ensureRoleByName(ROLE_PROGRAMMER);
  await ensureRoleByName(ROLE_ADMIN);
  await ensureRoleByName(ROLE_EMPLOYEE);

  await retireRoleInto(ROLE_SUPPLIER_LEGACY, ROLE_SUPPLIER);
  await retireRoleInto(ROLE_PROFESSIONAL_LEGACY, ROLE_SUPPLIER);
  await ensureRoleByName(ROLE_SUPPLIER);
}
