/**
 * JWT — tokens de sesión (eddeli / store / tienda)
 *
 * IMPORTANTE (seguridad):
 * - Definir JWT_SECRET en el entorno del servidor (ver backend/.env.example).
 * - El fallback "privateKey" solo es para desarrollo local sin .env.
 * - Cada token lleva `app` (eddeli|store|tienda) para no reutilizar sesión entre apps
 *   del mismo dominio (mismo localStorage de origen).
 */
import jwt from "jsonwebtoken";

const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error(
    "JWT_SECRET es obligatorio en producción. Defínelo en backend/.env (ver .env.example).",
  );
}

/** Secreto HS256. En desarrollo sin .env se usa fallback local (nunca en producción). */
const JWT_SECRET = process.env.JWT_SECRET || "privateKey";

const APP_KEY_BY_PREFIX = {
  eddeliapi: "eddeli",
  storeapi: "store",
  tiendaapi: "tienda",
};

const APP_KEY_BY_DB = {
  softed: "eddeli",
  eddeli: "eddeli",
  store: "store",
  tienda: "tienda",
};

/** Identidad de esta instalación (debe coincidir con el claim `app` del JWT). */
export function getJwtAppKey() {
  const prefix = String(process.env.API_PREFIX || "")
    .trim()
    .toLowerCase();
  if (APP_KEY_BY_PREFIX[prefix]) return APP_KEY_BY_PREFIX[prefix];
  const db = String(process.env.DB_NAME || "")
    .trim()
    .toLowerCase();
  if (APP_KEY_BY_DB[db]) return APP_KEY_BY_DB[db];
  return "eddeli";
}

function createAccessToken({ payload }) {
  const body = {
    ...(payload && typeof payload === "object" ? payload : {}),
    app: getJwtAppKey(),
  };
  return new Promise((resolve, reject) => {
    jwt.sign(
      body,
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: "1d" },
      (err, token) => {
        if (err) return reject(err);
        resolve(token);
      },
    );
  });
}

/**
 * Extrae el token del header Authorization: Bearer <token>
 * @returns {string|null}
 */
function getHeaderToken(req) {
  const auth = req.headers?.authorization;
  if (!auth || typeof auth !== "string") return null;
  const parts = auth.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") return null;
  return parts[1] || null;
}

function verifyJWT(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
      if (err) return reject(err);
      const expected = getJwtAppKey();
      const tokenApp = decoded?.app != null ? String(decoded.app).trim().toLowerCase() : "";
      // Tokens viejos sin `app`: rechazar (fuerza re-login una vez; evita cruzar apps).
      if (!tokenApp || tokenApp !== expected) {
        const e = new Error(
          tokenApp
            ? `Token de otra aplicación (${tokenApp}); esta es ${expected}`
            : `Token sin marca de app; iniciá sesión de nuevo en ${expected}`,
        );
        e.code = "JWT_APP_MISMATCH";
        return reject(e);
      }
      resolve(decoded);
    });
  });
}

function createLicenseToken({ payload }) {
  return new Promise((resolve, reject) => {
    jwt.sign(
      payload,
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: payload.time },
      (err, token) => {
        if (err) return reject(err);
        resolve(token);
      },
    );
  });
}

export { createAccessToken, getHeaderToken, verifyJWT, createLicenseToken, JWT_SECRET };
