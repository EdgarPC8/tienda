import { getAppSettingsSync } from "../services/appSettingsService.js";

export const DEFAULT_APP_TIMEZONE = "America/Guayaquil";

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** Zona horaria IANA de la instalación (AppSettings → env → Ecuador). */
export function getAppTimezone() {
  const tz = getAppSettingsSync()?.timezone;
  const s = String(tz || "").trim();
  if (s) return s;
  const envTz = String(process.env.APP_TIMEZONE || "").trim();
  return envTz || DEFAULT_APP_TIMEZONE;
}

/** Partes de fecha/hora en la zona de la app para un instante UTC. */
export function getZonedParts(instant = new Date(), timeZone = getAppTimezone()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(instant)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
  const hourRaw = parts.hour === "24" ? "0" : parts.hour;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(hourRaw),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function getTimezoneOffsetMinutes(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
  }).formatToParts(at);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value || "GMT";
  const match = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] || 0));
}

/** Convierte fecha+hora civil en zona de la app a instante UTC (Date). */
export function zonedDateTimeToUtc(y, mo, d, h, mi, s, timeZone = getAppTimezone()) {
  const ref = new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
  const offsetMin = getTimezoneOffsetMinutes(timeZone, ref);
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60 * 1000);
}

export function nowApp() {
  return new Date();
}

/**
 * Normaliza cualquier valor a Date con hora.
 * Si solo llega yyyy-MM-dd, usa la hora actual en la zona de la app.
 */
export function toAppDateTime(value) {
  if (value == null || value === "") return nowApp();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? nowApp() : value;
  }

  const s = String(value).trim();
  if (!s) return nowApp();

  const dateOnlyMatch = s.match(DATE_ONLY_RE);
  const hasTime = s.includes("T") || /\d{2}:\d{2}/.test(s.slice(10));

  if (dateOnlyMatch && !hasTime) {
    const y = Number(dateOnlyMatch[1]);
    const mo = Number(dateOnlyMatch[2]);
    const d = Number(dateOnlyMatch[3]);
    const nowParts = getZonedParts(nowApp());
    return zonedDateTimeToUtc(y, mo, d, nowParts.hour, nowParts.minute, nowParts.second);
  }

  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? nowApp() : parsed;
}

/** Día civil YYYY-MM-DD en la zona de la app (gráficos, calendario, filtros). */
export function toAppDayKey(value, timeZone = getAppTimezone()) {
  if (value == null) return null;

  if (typeof value === "string") {
    const m = value.trim().match(DATE_ONLY_RE);
    if (m) return m[1];
  }

  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;

  const isUtcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0;

  if (isUtcMidnight) {
    const y = d.getUTCFullYear();
    const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }

  const p = getZonedParts(d, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function formatAppDateTime(value, options = {}) {
  const {
    timeZone = getAppTimezone(),
    showSeconds = true,
    dateStyle,
    timeStyle,
    fallback = "—",
  } = options;

  if (value == null || value === "") return fallback;
  const instant = toAppDateTime(value);
  if (Number.isNaN(instant.getTime())) return fallback;

  if (dateStyle || timeStyle) {
    return instant.toLocaleString("es-EC", { timeZone, dateStyle, timeStyle });
  }

  return instant.toLocaleString("es-EC", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    ...(showSeconds ? { second: "2-digit" } : {}),
    hour12: true,
  });
}

/** Valor para input HTML datetime-local en zona de la app. */
export function toAppDateTimeInput(value, timeZone = getAppTimezone()) {
  const instant = value == null ? nowApp() : toAppDateTime(value);
  const p = getZonedParts(instant, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

export function nowAppDateTimeInput(timeZone = getAppTimezone()) {
  return toAppDateTimeInput(nowApp(), timeZone);
}

/** @deprecated Usar toAppDateTime */
export const toFinanceDateTime = toAppDateTime;
