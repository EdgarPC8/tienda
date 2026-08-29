import { AppNews } from "../models/AppNews.js";

/** Crea la tabla app_news si no existe (sync sin alter agresivo). */
export async function ensureAppNewsTable({ alter = false } = {}) {
  await AppNews.sync(alter ? { alter: true } : undefined);
}
