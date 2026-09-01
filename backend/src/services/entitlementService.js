/**
 * Suscripción local: leída por el frontend; escrita por el gestor (push) o pull manual.
 */
import axios from "axios";
import { AppEntitlement } from "../models/AppEntitlement.js";
import { subscription as gestorConfig } from "../config/subscription-api.js";
import { updateAppSettings } from "./appSettingsService.js";

const GESTOR_SYNC_SECRET = process.env.GESTOR_SYNC_SECRET || "";

const EMPTY = {
  maintenance: false,
  subscribed: false,
  features: [],
  subscription: null,
};

/** MySQL/SQLite a veces devuelve JSON como string. */
function coerceJson(value) {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (typeof value === "object") return value;
  return null;
}

function normalizeFeatures(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f) => f && typeof f === "object" && f.key)
    .map((f) => ({
      key: String(f.key),
      name: f.name != null ? String(f.name) : String(f.key),
      status: f.status != null ? String(f.status) : "planned",
    }));
}

function normalizePayload(body) {
  const parsed = coerceJson(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const subscribed = Boolean(parsed.subscribed);
  const maintenance = Boolean(parsed.maintenance);
  const subscription = parsed.subscription ?? null;
  const features = normalizeFeatures(parsed.features);
  return { maintenance, subscribed, subscription, features };
}

/** Quita módulos/secciones ocultos antes de exponer al frontend. */
function stripHiddenFromSubscription(subscription) {
  if (!subscription || typeof subscription !== "object") return subscription;
  const modules = Array.isArray(subscription.modules)
    ? subscription.modules
    : [];
  const filtered = modules
    .filter((m) => m && m.status !== "hidden")
    .map((m) => ({
      ...m,
      sections: Array.isArray(m.sections)
        ? m.sections.filter((s) => s && s.status !== "hidden")
        : [],
    }));
  return { ...subscription, modules: filtered };
}

function stripHiddenFeatures(features) {
  if (!Array.isArray(features)) return [];
  return features.filter((f) => f && f.status !== "hidden");
}

function featureIsUnlocked(status) {
  return status === "active" || status === "developer";
}

/**
 * Side-effects: el gestor BLOQUEA / DESBLOQUEA; no enciende la opción por el cliente.
 * - multi_stock bloqueado → fuerza multiStockEnabled=false
 * - multi_stock desbloqueado → no toca el flag (el cliente lo activa en Configuración)
 */
async function applyFeatureSideEffects(features) {
  if (!Array.isArray(features)) return;

  const multi = features.find((f) => f && f.key === "multi_stock");
  if (!multi) return;

  if (!featureIsUnlocked(multi.status)) {
    await updateAppSettings({ multiStockEnabled: false });
  }
}

export async function getEntitlementResponse() {
  const row = await AppEntitlement.findByPk(1);
  if (!row?.payload) return { ...EMPTY };

  const payload = coerceJson(row.payload) || EMPTY;
  const out = {
    maintenance: Boolean(payload.maintenance),
    subscribed: Boolean(payload.subscribed),
    features: stripHiddenFeatures(normalizeFeatures(payload.features)),
    subscription: stripHiddenFromSubscription(payload.subscription ?? null),
    meta: {
      source: row.source,
      syncedAt: row.syncedAt,
    },
  };

  if (out.subscription?.expires_at) {
    const expired = new Date(out.subscription.expires_at) < new Date();
    if (expired && out.subscription.status === "ACTIVE") {
      out.subscribed = false;
    }
  }

  return out;
}

export async function saveEntitlement(rawPayload, source = "gestor_push") {
  const payload = normalizePayload(rawPayload);
  if (!payload) {
    throw Object.assign(new Error("Payload de suscripción inválido"), {
      status: 400,
    });
  }

  const [row] = await AppEntitlement.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      payload,
      source,
      syncedAt: new Date(),
    },
  });

  await row.update({
    payload,
    source,
    syncedAt: new Date(),
  });

  try {
    await applyFeatureSideEffects(payload.features);
  } catch (err) {
    console.error("[entitlement] applyFeatureSideEffects:", err?.message || err);
  }

  return getEntitlementResponse();
}

/** Al arrancar: reaplica bloqueos del gestor (Store/Tienda = un solo local salvo multi_stock activo). */
export async function enforceEntitlementSideEffectsOnBoot() {
  try {
    const row = await AppEntitlement.findByPk(1);
    const payload = coerceJson(row?.payload) || EMPTY;
    const features = normalizeFeatures(payload.features);
    const multi = features.find((f) => f && f.key === "multi_stock");
    if (!multi || !featureIsUnlocked(multi.status)) {
      await updateAppSettings({ multiStockEnabled: false });
    }
  } catch (err) {
    console.error("[entitlement] enforceEntitlementSideEffectsOnBoot:", err?.message || err);
  }
}

/** Trae del gestor y guarda localmente (bootstrap / refresh manual). */
export async function pullEntitlementFromGestor() {
  if (!GESTOR_SYNC_SECRET) {
    throw Object.assign(
      new Error("GESTOR_SYNC_SECRET no configurado en el backend"),
      { status: 500 },
    );
  }

  const url = `${String(gestorConfig.api).replace(/\/$/, "")}/subscriptions/check`;
  const { data } = await axios.get(url, {
    headers: { Authorization: `Bearer ${GESTOR_SYNC_SECRET}` },
    timeout: 15000,
  });

  return saveEntitlement(data, "gestor_pull");
}

export async function ensureEntitlementTable({ alter = false } = {}) {
  await AppEntitlement.sync(alter ? { alter: true } : undefined);
  // Fila singleton: el gestor escribe encima con PUT /subscription/entitlement.
  await AppEntitlement.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      payload: { ...EMPTY },
      source: "bootstrap",
      syncedAt: null,
    },
  });
}

/** Gate de feature desde el payload crudo (incluye hidden). */
export async function getFeatureGate(key) {
  const row = await AppEntitlement.findByPk(1);
  const payload = coerceJson(row?.payload) || EMPTY;
  const features = normalizeFeatures(payload.features);
  const f = features.find((x) => x.key === key);
  if (!f) {
    return { present: false, status: "hidden", unlocked: false };
  }
  return {
    present: true,
    status: f.status,
    unlocked: featureIsUnlocked(f.status),
  };
}
