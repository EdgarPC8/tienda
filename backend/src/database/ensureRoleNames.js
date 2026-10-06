import { Roles } from "../models/Roles.js";

/**
 * El rol con todo el poder se llama Propietario.
 * Si todavía se llama Propietarios, se le quita la s.
 * Si solo existe el Programador antiguo, ese pasa a Propietario.
 * Programador queda como rol nuevo, con acceso limitado.
 */
export async function ensureOwnerAndProgrammerRoles() {
  let owner = await Roles.findOne({ where: { name: "Propietario" } });
  if (!owner) {
    const plural = await Roles.findOne({ where: { name: "Propietarios" } });
    if (plural) {
      await plural.update({ name: "Propietario" });
      owner = plural;
    }
  }
  if (!owner) {
    const previous = await Roles.findOne({ where: { name: "Programador" } });
    if (previous) {
      await previous.update({ name: "Propietario" });
    } else {
      await Roles.create({ name: "Propietario" });
    }
  }
  const limited = await Roles.findOne({ where: { name: "Programador" } });
  if (!limited) {
    await Roles.create({ name: "Programador" });
  }
}
