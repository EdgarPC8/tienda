import crypto from "crypto";
import { getAppSettingsSync } from "./appSettingsService.js";

const fails = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 5;

export function passwordPolicyOn() {
  return getAppSettingsSync()?.passwordPolicyEnabled === true;
}

export function loginAttemptLimitOn() {
  return getAppSettingsSync()?.loginAttemptLimitEnabled === true;
}

export function passwordPolicyError(password) {
  if (!passwordPolicyOn()) return null;
  if (String(password || "").length < 8) {
    return "La contraseña debe tener al menos 8 caracteres";
  }
  return null;
}

export function temporaryPassword() {
  if (!passwordPolicyOn()) return "12345678";
  return crypto.randomBytes(6).toString("base64url");
}

export function loginBlockedMessage(key) {
  if (!loginAttemptLimitOn()) return null;
  const row = fails.get(key);
  if (!row) return null;
  if (Date.now() - row.at > WINDOW_MS) {
    fails.delete(key);
    return null;
  }
  if (row.count >= MAX_FAILS) {
    return "Demasiados intentos. Esperá unos minutos e intentá de nuevo.";
  }
  return null;
}

export function noteLoginFail(key) {
  if (!loginAttemptLimitOn()) return;
  const row = fails.get(key);
  if (!row || Date.now() - row.at > WINDOW_MS) {
    fails.set(key, { count: 1, at: Date.now() });
    return;
  }
  row.count += 1;
  row.at = Date.now();
}

export function noteLoginOk(key) {
  fails.delete(key);
}
