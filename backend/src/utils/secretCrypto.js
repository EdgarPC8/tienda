/**
 * Cifrado simétrico para secretos en BD (ej. contraseña del certificado .p12).
 * Clave derivada de JWT_SECRET / SRI_SECRET_KEY.
 */
import crypto from "crypto";
import { JWT_SECRET } from "../libs/jwt.js";

const ALGO = "aes-256-gcm";
const PREFIX = "v1:";

function getKey() {
  const raw = process.env.SRI_SECRET_KEY || JWT_SECRET || "privateKey";
  return crypto.createHash("sha256").update(String(raw)).digest();
}

/** @param {string} plain */
export function encryptSecret(plain) {
  if (plain == null || plain === "") return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/** @param {string|null|undefined} packed */
export function decryptSecret(packed) {
  if (!packed || typeof packed !== "string") return null;
  if (!packed.startsWith(PREFIX)) return null;
  const parts = packed.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(data), decipher.final()]);
  return out.toString("utf8");
}
