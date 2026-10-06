/**
 * Asegura roles Propietario + Programador (y tipazos raros).
 * Misma lógica que al arrancar el backend (ensureOwnerAndProgrammerRoles).
 *
 * Uso (desde AppsWeb/tienda/backend):
 *   node scripts/fix-owner-programmer-roles.js
 *   node scripts/fix-owner-programmer-roles.js --dry-run
 *   npm run db:fix:owner-roles
 *   npm run db:fix:owner-roles:dry
 */
import "dotenv/config";
import { sequelize } from "../src/database/connection.js";
import { Roles } from "../src/models/Roles.js";
import { AccountRoles } from "../src/models/Account.js";
import { ensureOwnerAndProgrammerRoles } from "../src/database/ensureRoleNames.js";

const dryRun = process.argv.includes("--dry-run");

async function listRoles(label) {
  const rows = await Roles.findAll({ order: [["id", "ASC"]] });
  console.log(`\n${label}`);
  for (const r of rows) {
    const links = await AccountRoles.count({ where: { roleId: r.id } });
    console.log(`  id=${r.id}  ${r.name}  (cuentas: ${links})`);
  }
  return rows;
}

/** Tipazo histórico: Proovedor → no se usa; solo avisa o renombra si pedís --fix-typos */
async function maybeFixProovedorTypo() {
  const typo = await Roles.findOne({ where: { name: "Proovedor" } });
  if (!typo) return;
  const links = await AccountRoles.count({ where: { roleId: typo.id } });
  if (!process.argv.includes("--fix-typos")) {
    console.log(
      `\nℹ️  Rol tipazo "Proovedor" (id=${typo.id}, cuentas=${links}). ` +
        `Para renombrarlo a "Proveedor": agregá --fix-typos`,
    );
    return;
  }
  if (dryRun) {
    console.log(`[dry-run] renombraría Proovedor → Proveedor (id=${typo.id})`);
    return;
  }
  await typo.update({ name: "Proveedor" });
  console.log(`✅ Renombrado Proovedor → Proveedor (id=${typo.id})`);
}

async function ensureAdminAndEmployee() {
  for (const name of ["Administrador", "Empleado"]) {
    const found = await Roles.findOne({ where: { name } });
    if (found) continue;
    if (dryRun) {
      console.log(`[dry-run] crearía rol ${name}`);
      continue;
    }
    const created = await Roles.create({ name });
    console.log(`✅ Creado rol ${name} (id=${created.id})`);
  }
}

async function main() {
  console.log(dryRun ? "🔎 Modo dry-run (no escribe)" : "🔧 Aplicando roles…");
  await sequelize.authenticate();
  console.log(`BD: ${process.env.DB_NAME || "softed"} @ ${process.env.DB_HOST || "localhost"}`);

  await listRoles("Antes:");

  if (dryRun) {
    const owner = await Roles.findOne({ where: { name: "Propietario" } });
    const prog = await Roles.findOne({ where: { name: "Programador" } });
    if (!owner && prog) {
      console.log(
        `\n[dry-run] renombraría Programador (id=${prog.id}) → Propietario y crearía Programador nuevo`,
      );
    } else if (!owner) {
      console.log("\n[dry-run] crearía Propietario");
    } else {
      console.log("\n[dry-run] Propietario ya existe");
    }
    if (owner && !prog) {
      console.log("[dry-run] crearía Programador (limitado)");
    }
  } else {
    await ensureOwnerAndProgrammerRoles();
    console.log("\n✅ ensureOwnerAndProgrammerRoles OK");
  }

  await ensureAdminAndEmployee();
  await maybeFixProovedorTypo();

  if (!dryRun) await listRoles("Después:");

  const owner = await Roles.findOne({ where: { name: "Propietario" } });
  const prog = await Roles.findOne({ where: { name: "Programador" } });
  console.log("\nResumen:");
  console.log(`  Propietario: ${owner ? `id=${owner.id}` : "NO"}`);
  console.log(`  Programador: ${prog ? `id=${prog.id}` : "NO"}`);
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
