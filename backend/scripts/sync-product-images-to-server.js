/**
 * Wrapper para el menú: sube imágenes + primaryImageUrl al servidor por SSH.
 *
 * Uso:
 *   node scripts/sync-product-images-to-server.js
 *   node scripts/sync-product-images-to-server.js --dry-run
 *   node scripts/sync-product-images-to-server.js --images-only
 *   node scripts/sync-product-images-to-server.js --db-only
 *
 * Requiere WireGuard/SSH al servidor ya activo.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sh = path.join(__dirname, "sync-product-images-to-server.sh");
const args = process.argv.slice(2);

const child = spawn("bash", [sh, ...args], {
  cwd: path.resolve(__dirname, ".."),
  stdio: "inherit",
  env: process.env,
});

child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
