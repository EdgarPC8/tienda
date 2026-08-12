import { createRaptorClient } from "@raptorsolutions/webhook-client";

const enabled =
  String(process.env.RAPTOR_WEBHOOK_ENABLED ?? "1") !== "0" &&
  Boolean(process.env.GESTOR_SYNC_SECRET);

/** Cliente singleton hacia Raptor Solutions (webhook app-events). */
export const raptor = createRaptorClient({
  host: process.env.RAPTOR_WEBHOOK_HOST || "localhost",
  port: process.env.RAPTOR_WEBHOOK_PORT || 3000,
  protocol: process.env.RAPTOR_WEBHOOK_PROTOCOL || "http",
  secret: process.env.GESTOR_SYNC_SECRET || "disabled",
});

export const raptorEnabled = enabled;
