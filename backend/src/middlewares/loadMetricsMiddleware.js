import { loadMetricsEnabled, reportLoadSample } from "../services/loadMetricsReporter.js";

const SKIP_PREFIXES = ["/socket.io"];
const MAX_LATENCIES = 2000;
const SAMPLE_SECONDS = Math.max(
  10,
  Math.min(300, Number(process.env.RAPTOR_LOAD_METRICS_INTERVAL_SECONDS || 10) || 10),
);
const SAMPLE_MS = SAMPLE_SECONDS * 1000;

const buckets = new Map();
let flushTimer = null;

function classifyUsage(req) {
  const path = String(req.originalUrl || req.url || "")
    .split("?")[0]
    .toLowerCase();
  const route = path.replace(/^\/[^/]+api\b/, "");

  if (route.includes("/orders/pos") || route.includes("/cash") || route.includes("/turno")) {
    return { module: "Operación", section: "Caja y turnos" };
  }
  if (route.includes("/orders") || route.includes("/customers") || route.includes("/suppliers")) {
    return { module: "Ventas y compras", section: "Pedidos y contactos" };
  }
  if (route.includes("/finance") || route.includes("/collections") || route.includes("/loans")) {
    return { module: "Finanzas", section: "Movimientos y cobranzas" };
  }
  if (
    route.includes("/recipes") ||
    route.includes("/production") ||
    route.includes("/generic-ingredients") ||
    route.includes("/movements/open-presentation")
  ) {
    return { module: "Producción", section: "Insumos, recetas y fabricación" };
  }
  if (
    route.includes("/products") ||
    route.includes("/inventory") ||
    route.includes("/movements") ||
    route.includes("/categories") ||
    route.includes("/batches")
  ) {
    return { module: "Inventario", section: "Productos y existencias" };
  }
  if (route.includes("/sri") || route.includes("/electronic")) {
    return { module: "Comprobantes electrónicos", section: "Facturación electrónica" };
  }
  if (route.includes("/marketing") || route.includes("/promociones")) {
    return { module: "Marketing", section: "Promociones" };
  }
  if (route.includes("/publicidad") || route.includes("/campaign")) {
    return { module: "Marketing", section: "Publicidad" };
  }
  if (route.includes("/diseno-promocional") || route.includes("/editor")) {
    return { module: "Marketing", section: "Diseño promocional" };
  }
  if (route.includes("/users") || route.includes("/roles") || route.includes("/settings")) {
    return { module: "Sistema", section: "Usuarios y configuración" };
  }
  return { module: "Sistema", section: "Otros servicios" };
}

function sampleStart(date = new Date()) {
  const d = new Date(date);
  d.setTime(Math.floor(d.getTime() / SAMPLE_MS) * SAMPLE_MS);
  return d;
}

function bucketFor(date = new Date()) {
  const start = sampleStart(date);
  const key = start.toISOString();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = {
      interval_start: key,
      requests: 0,
      bytes_in: 0,
      bytes_out: 0,
      errors: 0,
      latencies: [],
      usage: new Map(),
    };
    buckets.set(key, bucket);
  }
  return bucket;
}

function percentile95(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return sorted[Math.max(0, idx)];
}

function shouldSkip(req) {
  const path = String(req.originalUrl || req.url || "");
  if (req.method === "OPTIONS" || req.method === "HEAD") return true;
  return SKIP_PREFIXES.some((prefix) => path.startsWith(prefix) || path.includes(prefix));
}

function toBytes(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function flushClosedSamples(forceAll = false) {
  if (!loadMetricsEnabled()) {
    buckets.clear();
    return;
  }
  const currentKey = sampleStart().toISOString();
  for (const [key, bucket] of [...buckets.entries()]) {
    if (!forceAll && key === currentKey) continue;
    await reportLoadSample({
      interval_start: bucket.interval_start,
      requests: bucket.requests,
      bytes_in: bucket.bytes_in,
      bytes_out: bucket.bytes_out,
      errors: bucket.errors,
      latency_p95_ms: percentile95(bucket.latencies),
      usage_breakdown: [...bucket.usage.values()],
    });
    buckets.delete(key);
  }
}

function ensureTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushClosedSamples(false);
  }, SAMPLE_MS);
  flushTimer.unref?.();
}

export function loadMetricsMiddleware(req, res, next) {
  if (!loadMetricsEnabled() || shouldSkip(req)) return next();

  ensureTimer();
  const started = Date.now();

  res.on("finish", () => {
    const bucket = bucketFor();
    bucket.requests += 1;
    bucket.bytes_in += toBytes(req.headers["content-length"]);
    bucket.bytes_out += toBytes(res.getHeader("content-length"));
    if (res.statusCode >= 400) bucket.errors += 1;
    const usage = classifyUsage(req);
    const method = String(req.method || "GET").toUpperCase();
    const usageKey = `${usage.module}::${usage.section}::${method}`;
    const usageRow = bucket.usage.get(usageKey) || { ...usage, method, requests: 0 };
    usageRow.requests += 1;
    bucket.usage.set(usageKey, usageRow);
    if (bucket.latencies.length < MAX_LATENCIES) {
      bucket.latencies.push(Date.now() - started);
    }
  });

  next();
}

export async function flushLoadMetricsNow() {
  await flushClosedSamples(true);
}

process.on("beforeExit", () => {
  void flushClosedSamples(true);
});
