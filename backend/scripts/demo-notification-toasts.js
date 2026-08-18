/**
 * Dispara los 4 toasts de demo contra el backend que ya está corriendo.
 * La app tiene que estar abierta (socket vivo) y los 4 switches Toast prendidos.
 *
 * Uso:
 *   npm run demo:toasts
 *   npm run demo:toasts -- 1
 */
import "dotenv/config";
import { PORT, API_PREFIX } from "../src/config/serverEnv.js";

const userId = Number(process.argv[2] || process.env.DEMO_TOAST_USER_ID || 0);
const url = `http://127.0.0.1:${PORT}/${API_PREFIX}/notifications/demo-toasts-local`;

console.log(`Disparando toasts de demo → ${url}`);
console.log(
  userId > 0
    ? `Destino: userId ${userId}`
    : "Destino: administradores (o pasá un userId: npm run demo:toasts -- 1)",
);
console.log("Tené la app abierta y los 4 switches de Toast prendidos.\n");

try {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(userId > 0 ? { userId } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Falló:", res.status, data);
    process.exit(1);
  }
  console.log("Enviado:", JSON.stringify(data, null, 2));
} catch (err) {
  console.error(
    "No se pudo conectar al backend. ¿Está corriendo? (npm run dev)",
    err?.message || err,
  );
  process.exit(1);
}
