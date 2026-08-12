/**
 * Renombra el rol "Estudiante" → "Empleado" (EdDeli no usa Estudiante).
 * Uso: node scripts/fix-estudiante-to-empleado-role.js
 *      node scripts/fix-estudiante-to-empleado-role.js --backup
 */
import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { sequelize } from "../src/database/connection.js";
import { Roles } from "../src/models/Roles.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backupPath = resolve(__dirname, "../src/database/backup.json");

function fixBackupJson() {
  const data = JSON.parse(readFileSync(backupPath, "utf8"));
  const roles = data.Roles || [];
  let changed = 0;

  for (const role of roles) {
    if (role.name === "Estudiante") {
      role.name = "Empleado";
      changed += 1;
    }
  }

  if (!roles.some((r) => r.name === "Empleado") && changed === 0) {
    const nextId = roles.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
    roles.push({ id: nextId, name: "Empleado" });
    changed += 1;
  }

  data.Roles = roles;
  writeFileSync(backupPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`✅ backup.json: ${changed} rol(es) actualizado(s) a Empleado`);
}

async function fixDatabase() {
  await sequelize.authenticate();

  const estudiante = await Roles.findOne({ where: { name: "Estudiante" } });
  const empleado = await Roles.findOne({ where: { name: "Empleado" } });

  if (estudiante && empleado && estudiante.id !== empleado.id) {
    console.log(
      "⚠️  Existen Estudiante y Empleado como roles distintos; revisa AccountRoles manualmente.",
    );
    return;
  }

  if (estudiante) {
    estudiante.name = "Empleado";
    await estudiante.save();
    console.log(`✅ BD: rol id=${estudiante.id} renombrado a Empleado`);
    return;
  }

  if (!empleado) {
    const created = await Roles.create({ name: "Empleado" });
    console.log(`✅ BD: rol Empleado creado (id=${created.id})`);
    return;
  }

  console.log("ℹ️  BD: ya existe el rol Empleado y no hay Estudiante.");
}

async function main() {
  const backupOnly = process.argv.includes("--backup");

  try {
    if (backupOnly) {
      fixBackupJson();
    } else {
      await fixDatabase();
      fixBackupJson();
    }
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exitCode = 1;
  } finally {
    try {
      await sequelize.close();
    } catch {
      /* ignore */
    }
  }
}

main();
