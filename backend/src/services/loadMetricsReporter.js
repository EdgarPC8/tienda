/**
 * Reporta el agregado de un intervalo al gestor.
 * POST /raptorsolutions/api/webhooks/app-load
 */
export function loadMetricsEnabled() {
  return (
    String(process.env.RAPTOR_LOAD_METRICS_ENABLED ?? "1") !== "0" &&
    Boolean(process.env.GESTOR_SYNC_SECRET)
  );
}

export async function reportLoadSample(payload) {
  if (!loadMetricsEnabled()) return false;

  const host = process.env.RAPTOR_WEBHOOK_HOST || "localhost";
  const port = process.env.RAPTOR_WEBHOOK_PORT || "3000";
  const protocol = process.env.RAPTOR_WEBHOOK_PROTOCOL || "http";
  const secret = process.env.GESTOR_SYNC_SECRET;
  const url = `${protocol}://${host}:${port}/raptorsolutions/api/webhooks/app-load`;

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
      console.warn("[load-metrics] flush falló:", res.status, text.slice(0, 180));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[load-metrics] flush error:", err?.message || err);
    return false;
  }
}
