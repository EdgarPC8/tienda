import { normalizePath, resolveWebhookEvent } from "../events/webhookEventCatalog.js";
import { notifyRaptorSolutionsAsync } from "../services/notifyRaptorSolutions.js";

const SKIP_METHODS = new Set(["OPTIONS", "HEAD"]);

function shouldNotify(method, path) {
  if (SKIP_METHODS.has(method)) return false;
  if (method !== "GET") return true;
  return /^\/comands\/(saveBackup|reloadBD)\/?$/.test(path);
}

function hookResponse(req, res) {
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);

  const dispatch = (body) => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const path = normalizePath(req.originalUrl || req.url);
    const method = String(req.method || "").toUpperCase();
    if (!shouldNotify(method, path)) return;

    const event = resolveWebhookEvent(req, body);
    if (!event) return;

    notifyRaptorSolutionsAsync(event);
  };

  res.json = function jsonHook(payload) {
    res.json = originalJson;
    const result = originalJson(payload);
    dispatch(payload);
    return result;
  };

  res.send = function sendHook(payload) {
    res.send = originalSend;
    const result = originalSend(payload);
    let body = payload;
    if (typeof payload === "string") {
      try {
        body = JSON.parse(payload);
      } catch {
        body = { raw: payload?.slice?.(0, 500) };
      }
    }
    dispatch(body);
    return result;
  };
}

export function raptorWebhookMiddleware(req, res, next) {
  hookResponse(req, res);
  next();
}
