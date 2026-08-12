/**
 * Muestra si backup.json existe y cuántos datos tiene.
 * Uso: npm run db:check-backup
 */
import { readBackupFileSummary, backupFilePath } from "../src/database/insertData.js";

const summary = await readBackupFileSummary();
console.log("Ruta:", backupFilePath);

if (!summary.exists) {
  console.error("❌ No existe backup.json");
  console.error("   Cópialo desde tu PC:");
  console.error(
    "   scp backend/src/database/backup.json root@SERVIDOR:/var/www/html/eddeli/backend/src/database/",
  );
  process.exit(1);
}

console.log(`✅ Existe · ${summary.sizeMB} MB · ${summary.totalRows} filas`);
console.log("Por tabla:", summary.counts);

if ((summary.counts.Users ?? 0) === 0) {
  console.error("❌ Sin usuarios — no podrás iniciar sesión tras el reset");
  process.exit(1);
}
