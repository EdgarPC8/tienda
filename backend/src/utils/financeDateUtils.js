import {
  format,
  startOfWeek,
  startOfMonth,
  parseISO,
  isValid,
} from "date-fns";
import { Op } from "sequelize";
import { toAppDayKey, getAppTimezone, zonedDateTimeToUtc } from "./appDateTime.js";

const DATE_ONLY_RE = /^(\d{4}-\d{2}-\d{2})/;

/** @see toAppDayKey */
export function toFinanceDayKey(value) {
  return toAppDayKey(value);
}

export function parseFinanceDayKey(key) {
  if (!key || !DATE_ONLY_RE.test(String(key))) return null;
  const d = parseISO(String(key).slice(0, 10));
  return isValid(d) ? d : null;
}

export function financeBucketKey(value, granularity) {
  const dayKey = toAppDayKey(value);
  if (!dayKey) return null;
  const d = parseFinanceDayKey(dayKey);
  if (!d) return null;
  if (granularity === "day") return dayKey;
  if (granularity === "week") {
    return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
  }
  return format(startOfMonth(d), "yyyy-MM");
}

export function toChartBusinessDay(value) {
  const key = toAppDayKey(value);
  return key || undefined;
}

export function parseFinanceDayParam(value) {
  if (!value) return null;
  return parseFinanceDayKey(String(value).slice(0, 10));
}

function resolveDayKey(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date) return toAppDayKey(v);
  const raw = String(v).slice(0, 10);
  if (DATE_ONLY_RE.test(raw)) return raw;
  return toAppDayKey(v);
}

/** Inicio del día civil (00:00:00) en zona de la app → UTC Date. */
export function dayKeyStartUtc(dayKey) {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  if (!y || !m || !d) return null;
  return zonedDateTimeToUtc(y, m, d, 0, 0, 0);
}

/** Inicio del día siguiente (límite exclusivo) en zona de la app → UTC Date. */
export function dayKeyEndExclusiveUtc(dayKey) {
  const [y, m, d] = String(dayKey).split("-").map(Number);
  if (!y || !m || !d) return null;
  // Date.UTC maneja desborde de mes/día.
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  return zonedDateTimeToUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    0,
    0,
    0,
  );
}

/** Desplaza una clave YYYY-MM-DD por N días civiles (calendario UTC). */
export function shiftFinanceDayKey(dayKey, deltaDays) {
  const [y, m, d] = String(dayKey || "").split("-").map(Number);
  if (!y || !m || !d) return null;
  const next = new Date(Date.UTC(y, m - 1, d + Number(deltaDays || 0)));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

export function resolveFinanceDayKeyBounds(startInput, endInput) {
  const start = resolveDayKey(startInput);
  const end = resolveDayKey(endInput);
  if (!start && !end) return null;
  const startKey = start || end;
  const endKey = end || start;
  return { startKey, endKey };
}

export function financeDayKeyInInclusiveRange(dayKey, startKey, endKey) {
  if (!dayKey) return false;
  if (startKey && dayKey < startKey) return false;
  if (endKey && dayKey > endKey) return false;
  return true;
}

/**
 * Filtro por columna `date` usable con índice (sin DATE(date)).
 * Rango semiabierto civil (zona app): start 00:00 inclusive → end+1 00:00 exclusive.
 *
 * Nota: `toAppDayKey` trata medianoche UTC como día calendario UTC (date-only).
 * Ese instante queda FUERA del rango civil Guayaquil del mismo YYYY-MM-DD.
 * Usa `buildPaddedFinanceDateColumnWhere` + `filterByFinanceDayKeyRange` cuando
 * el listado/totales deben coincidir con el bucket del mirror.
 */
export function buildFinanceDateColumnWhere(startInput, endInput) {
  const start = resolveDayKey(startInput);
  const end = resolveDayKey(endInput);
  if (!start && !end) return null;

  if (start && end) {
    const from = dayKeyStartUtc(start);
    const toEx = dayKeyEndExclusiveUtc(end);
    if (!from || !toEx) return null;
    return { date: { [Op.gte]: from, [Op.lt]: toEx } };
  }
  if (start) {
    const from = dayKeyStartUtc(start);
    if (!from) return null;
    return { date: { [Op.gte]: from } };
  }
  const toEx = dayKeyEndExclusiveUtc(end);
  if (!toEx) return null;
  return { date: { [Op.lt]: toEx } };
}

/**
 * Amplía el WHERE SQL ±padDays y expone startKey/endKey para filtrar en JS
 * con toFinanceDayKey (misma regla que el gráfico Flujo).
 */
export function buildPaddedFinanceDateColumnWhere(startInput, endInput, padDays = 1) {
  const bounds = resolveFinanceDayKeyBounds(startInput, endInput);
  if (!bounds) return null;
  const fromKey = shiftFinanceDayKey(bounds.startKey, -Math.abs(padDays));
  const toKey = shiftFinanceDayKey(bounds.endKey, Math.abs(padDays));
  const where = buildFinanceDateColumnWhere(fromKey || bounds.startKey, toKey || bounds.endKey);
  if (!where) return null;
  return { where, startKey: bounds.startKey, endKey: bounds.endKey };
}

export function filterByFinanceDayKeyRange(rows, startKey, endKey, getDate = (r) => r?.date) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) =>
    financeDayKeyInInclusiveRange(toFinanceDayKey(getDate(r)), startKey, endKey)
  );
}

export function buildFinanceDateWhere(startDate, endDate) {
  const clause = buildFinanceDateColumnWhere(startDate, endDate);
  return clause ? { [Op.and]: [clause] } : {};
}

export { getAppTimezone };
