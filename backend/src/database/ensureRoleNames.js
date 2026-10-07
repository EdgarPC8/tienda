import { Roles } from "../models/Roles.js";
import {
  ROLE_PROGRAMMER,
  ROLE_OWNER,
  ROLE_SUPPLIER,
  ROLE_SUPPLIER_LEGACY,
} from "../utils/roleNames.js";

/**
 * El rol con todo el poder se llama Propietario.
 * Si todavía se llama Propietarios, se le quita la s.
 * Si solo existe el Programador antiguo, ese pasa a Propietario.
 * Programador queda como rol nuevo, con acceso limitado.
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
  const limited = await Roles.findOne({ where: { name: ROLE_PROGRAMMER } });
  if (!limited) {
    await Roles.create({ name: ROLE_PROGRAMMER });
  }

  const supplier = await Roles.findOne({ where: { name: ROLE_SUPPLIER } });
  if (!supplier) {
    const legacy = await Roles.findOne({ where: { name: ROLE_SUPPLIER_LEGACY } });
    if (legacy) {
      await legacy.update({ name: ROLE_SUPPLIER });
    } else {
      await Roles.create({ name: ROLE_SUPPLIER });
    }
  }
}
