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

const MAX_ERROR_ROWS = 25;

function errorKind(status) {
  if (status === 400) return "Petición inválida";
  if (status === 401) return "No autenticado";
  if (status === 403) return "Sin permiso";
  if (status === 404) return "No encontrado";
  if (status === 408) return "Tiempo agotado";
  if (status === 409) return "Conflicto";
  if (status === 413) return "Cuerpo demasiado grande";
  if (status === 415) return "Formato no soportado";
  if (status === 422) return "Datos no válidos";
  if (status === 429) return "Demasiadas peticiones";
  if (status === 500) return "Error interno del servidor";
  if (status === 502) return "Error de pasarela";
  if (status === 503) return "Servicio no disponible";
  if (status === 504) return "Tiempo agotado del servidor";
  if (status >= 400 && status < 500) return "Error del cliente";
  if (status >= 500) return "Error del servidor";
  return `HTTP ${status}`;
}

function sanitizePath(req) {
  let path = String(req.originalUrl || req.url || "").split("?")[0];
  path = path.replace(/\/{2,}/g, "/") || "/";
  path = path.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    ":id",
  );
  return path.slice(0, 160);
}

function sanitizeMessage(raw) {
  let s = String(raw || "")
    .replace(/\s+/g, " ")
    .trim();
  s = s.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]");
  s = s.replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9._-]{8,}/g, "[token]");
  return s.slice(0, 180);
}

function attachErrorMessageCapture(res) {
  let message = "";
  const pick = (body) => {
    if (body == null || message) return;
    if (typeof body === "string") {
      const t = body.trim();
      if (!t) return;
      if (t.startsWith("{")) {
        try {
          pick(JSON.parse(t));
        } catch {
          /* ignore */
        }
        return;
      }
      if (t[0] !== "<") message = t;
      return;
    }
    if (typeof body === "object") {
      message = String(body.message || body.error || body.msg || "").trim();
    }
  };
  const origJson = res.json;
  res.json = function json(body) {
    pick(body);
    return origJson.call(this, body);
  };
  return () => message;
}

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
      errorsDetail: new Map(),
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

function attachOutgoingByteCounter(res) {
  let bytes = 0;
  const originalWrite = res.write;
  const originalEnd = res.end;
  res.write = function write(chunk, encoding, callback) {
    if (chunk && typeof chunk !== "function") {
      try {
        bytes += Buffer.byteLength(
          chunk,
          typeof encoding === "string" ? encoding : undefined,
        );
      } catch {
        /* ignore */
      }
    }
    return originalWrite.call(this, chunk, encoding, callback);
  };
  res.end = function end(chunk, encoding, callback) {
    if (chunk && typeof chunk !== "function") {
      try {
        bytes += Buffer.byteLength(
          chunk,
          typeof encoding === "string" ? encoding : undefined,
        );
      } catch {
        /* ignore */
      }
    }
    return originalEnd.call(this, chunk, encoding, callback);
  };
  return () => bytes;
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
      error_breakdown: [...bucket.errorsDetail.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, MAX_ERROR_ROWS),
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
  const outgoingBytes = attachOutgoingByteCounter(res);
  const getErrorMessage = attachErrorMessageCapture(res);

  res.on("finish", () => {
    const bucket = bucketFor();
    if (!bucket.errorsDetail) bucket.errorsDetail = new Map();
    bucket.requests += 1;
    bucket.bytes_in += toBytes(req.headers["content-length"]);
    bucket.bytes_out += toBytes(res.getHeader("content-length")) || outgoingBytes();
    const usage = classifyUsage(req);
    const method = String(req.method || "GET").toUpperCase();
    const usageKey = `${usage.module}::${usage.section}::${method}`;
    const usageRow = bucket.usage.get(usageKey) || { ...usage, method, requests: 0 };
    usageRow.requests += 1;
    bucket.usage.set(usageKey, usageRow);
    const status = Number(res.statusCode) || 0;
    if (status >= 400) {
      bucket.errors += 1;
      const path = sanitizePath(req);
      const message = sanitizeMessage(getErrorMessage() || res.statusMessage || "");
      const kind = errorKind(status);
      const errKey = `${status}::${method}::${path}::${message}`;
      const prev = bucket.errorsDetail.get(errKey) || {
        status,
        kind,
        method,
        path,
        message: message || kind,
        module: usage.module,
        section: usage.section,
        count: 0,
      };
      prev.count += 1;
      bucket.errorsDetail.set(errKey, prev);
    }
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
