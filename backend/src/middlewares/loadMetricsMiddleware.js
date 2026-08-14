import { loadMetricsEnabled, reportLoadMinute } from "../services/loadMetricsReporter.js";

const SKIP_PREFIXES = ["/socket.io"];
const MAX_LATENCIES = 2000;

const buckets = new Map();
let flushTimer = null;

function minuteStart(date = new Date()) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMilliseconds(0);
  return d;
}

function bucketFor(date = new Date()) {
  const start = minuteStart(date);
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

async function flushClosedMinutes(forceAll = false) {
  if (!loadMetricsEnabled()) {
    buckets.clear();
    return;
  }
  const currentKey = minuteStart().toISOString();
  for (const [key, bucket] of [...buckets.entries()]) {
    await reportLoadMinute({
      interval_start: bucket.interval_start,
      requests: bucket.requests,
      bytes_in: bucket.bytes_in,
      bytes_out: bucket.bytes_out,
      errors: bucket.errors,
      latency_p95_ms: percentile95(bucket.latencies),
    });
    if (forceAll || key !== currentKey) buckets.delete(key);
  }
}

function ensureTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    void flushClosedMinutes(false);
  }, 60_000);
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
    if (bucket.latencies.length < MAX_LATENCIES) {
      bucket.latencies.push(Date.now() - started);
    }
  });

  next();
}

export async function flushLoadMetricsNow() {
  await flushClosedMinutes(true);
}

process.on("beforeExit", () => {
  void flushClosedMinutes(true);
});
