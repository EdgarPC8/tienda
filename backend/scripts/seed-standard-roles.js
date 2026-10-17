/**
 * Seed / normaliza roles canónicos:
 *   Propietario, Administrador, Empleado, Programador, Proveedor
 *
 * - Quita tipazo Proovedor → Proveedor
 * - Quita Profesional → Proveedor (cuentas migradas)
 * - Corre al arrancar el backend (ensureOwnerAndProgrammerRoles)
 *
 * Uso (desde AppsWeb/eddeli/backend):
 *   node scripts/seed-standard-roles.js
 *   node scripts/seed-standard-roles.js --dry-run
 *   npm run db:seed:roles
 *   npm run db:seed:roles:dry
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { Roles } from "../src/models/Roles.js";
import { AccountRoles } from "../src/models/Account.js";
import { ensureOwnerAndProgrammerRoles } from "../src/database/ensureRoleNames.js";

const EXPECTED = [
  "Propietario",
  "Administrador",
  "Empleado",
  "Programador",
  "Proveedor",
];

const dryRun = process.argv.includes("--dry-run");

async function listRoles(label) {
  const rows = await Roles.findAll({ order: [["id", "ASC"]] });
  console.log(`\n${label}`);
  for (const r of rows) {
    const links = await AccountRoles.count({ where: { roleId: r.id } });
    const mark = EXPECTED.includes(r.name) ? "✓" : "!";
    console.log(`  ${mark} id=${r.id}  ${r.name}  (cuentas: ${links})`);
  }
  return rows;
}

async function main() {
  console.log(dryRun ? "🔎 Modo dry-run (no escribe)" : "🌱 Seed roles canónicos…");
  await sequelize.authenticate();
  console.log(
    `BD: ${process.env.DB_NAME || "softed"} @ ${process.env.DB_HOST || "localhost"}`,
  );

  await listRoles("Antes:");

  if (dryRun) {
    for (const name of EXPECTED) {
      const found = await Roles.findOne({ where: { name } });
      console.log(
        found
          ? `[dry-run] ${name} ya existe (id=${found.id})`
          : `[dry-run] crearía ${name}`,
      );
    }
    for (const legacy of ["Proovedor", "Profesional", "Propietarios"]) {
      const found = await Roles.findOne({ where: { name: legacy } });
      if (found) {
        console.log(
          `[dry-run] retiraría "${legacy}" (id=${found.id}) → rol canónico`,
        );
      }
    }
  } else {
    await ensureOwnerAndProgrammerRoles();
    console.log("\n✅ ensureOwnerAndProgrammerRoles OK");
    await listRoles("Después:");
  }

  console.log("\nResumen esperado:");
  for (const name of EXPECTED) {
    const found = await Roles.findOne({ where: { name } });
    console.log(`  ${name}: ${found ? `id=${found.id}` : "NO"}`);
  }
  console.log(dryRun ? "\n(dry-run: nada guardado)" : "\nListo.");
}

main()
  .catch((e) => {
    console.error("❌", e.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await sequelize.close();
    } catch {
      /* ignore */
    }
  });
