/**
 * Orígenes permitidos sin listar IPs fijas.
 * Cubre localhost, LAN (192.168.x, 10.x) y dominio institucional.
 */
const ORIGIN_PATTERNS = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https?:\/\/100\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?$/,
  /^https:\/\/(www\.)?aplicaciones\.marianosamaniego\.edu\.ec$/,
];

export function isOriginAllowed(origin) {
  if (!origin) return true;
  return ORIGIN_PATTERNS.some((re) => re.test(origin));
}

export function corsOriginCallback(origin, callback) {
  if (isOriginAllowed(origin)) callback(null, true);
  else callback(new Error(`Origen no permitido por CORS: ${origin}`));
}
