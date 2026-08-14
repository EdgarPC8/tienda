/**
 * Reporta el agregado de un intervalo al gestor.
 * POST /raptorsolutions/api/webhooks/app-load
 *
 * Destino por defecto: SUBSCRIPTION_API_URL (ya configurada en prod).
 * RAPTOR_WEBHOOK_* solo si querés forzar otro host/puerto.
 */
export function loadMetricsEnabled() {
  return (
    String(process.env.RAPTOR_LOAD_METRICS_ENABLED ?? "1") !== "0" &&
    Boolean(process.env.GESTOR_SYNC_SECRET)
  );
}

function resolveWebhookTarget() {
  let host = "";
  let port = "";
  let protocol = "";

  const subscriptionUrl = process.env.SUBSCRIPTION_API_URL?.trim();
  if (subscriptionUrl) {
    try {
      const parsed = new URL(subscriptionUrl);
      protocol = parsed.protocol.replace(":", "") || "http";
      host = parsed.hostname || "127.0.0.1";
      port =
        parsed.port || (parsed.protocol === "https:" ? "443" : "80");
    } catch {
      // SUBSCRIPTION_API_URL inválida: se usan defaults / overrides abajo
    }
  }

  if (process.env.RAPTOR_WEBHOOK_HOST?.trim()) {
    host = process.env.RAPTOR_WEBHOOK_HOST.trim();
  }
  if (process.env.RAPTOR_WEBHOOK_PORT?.trim()) {
    port = process.env.RAPTOR_WEBHOOK_PORT.trim();
  }
  if (process.env.RAPTOR_WEBHOOK_PROTOCOL?.trim()) {
    protocol = process.env.RAPTOR_WEBHOOK_PROTOCOL.trim();
  }

  protocol = protocol || "http";
  host = host || "127.0.0.1";
  port = port || "3002";

  // En algunos entornos Node/PM2, "localhost" cuelga por IPv6.
  if (host === "localhost") host = "127.0.0.1";

  return {
    protocol,
    host,
    port,
    url: `${protocol}://${host}:${port}/raptorsolutions/api/webhooks/app-load`,
  };
}

export async function reportLoadSample(payload) {
  if (!loadMetricsEnabled()) return false;

  const secret = process.env.GESTOR_SYNC_SECRET;
  const { url } = resolveWebhookTarget();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(
        "[load-metrics] flush falló:",
        res.status,
        url,
        text.slice(0, 180),
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      "[load-metrics] flush error:",
      url,
      err?.message || err,
    );
    return false;
  }
}
