import {
  runScheduledNotificationPrograms,
  seedDefaultNotificationPrograms,
} from "./notificationService.js";
import { syncRecurringExpenseReminders } from "../controllers/InventoryControl/RecurringExpenseController.js";

let started = false;
let tickTimer = null;

export async function startNotificationScheduler() {
  if (started) return;
  started = true;

  try {
    await seedDefaultNotificationPrograms();
    console.log("🔔 Programas de notificación listos (saludos + stock mínimo).");
  } catch (err) {
    console.error("Error al sembrar programas de notificación:", err?.message || err);
  }

  const tick = async () => {
    try {
      await runScheduledNotificationPrograms();
      await syncRecurringExpenseReminders();
    } catch (err) {
      console.error("Error en scheduler de notificaciones:", err?.message || err);
    }
  };

  await tick();
  tickTimer = setInterval(tick, 60 * 1000);
}

export function stopNotificationScheduler() {
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  started = false;
}
