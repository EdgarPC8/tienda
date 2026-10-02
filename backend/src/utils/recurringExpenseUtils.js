import { getAppTimezone, getZonedParts, nowApp } from "./appDateTime.js";

const CATEGORY_EXPENSE = {
  arriendo: "Arriendo",
  servicios: "Servicios públicos",
  permisos: "Permisos y licencias",
  otros: "Egresos fijos",
};

export const CATEGORY_LABELS = {
  arriendo: "Arriendo",
  servicios: "Servicios (luz, agua)",
  permisos: "Permisos anuales",
  otros: "Otros",
};

export const FREQUENCY_LABELS = {
  weekly: "Semanal",
  monthly: "Mensual",
  bimonthly: "Bimestral",
  quarterly: "Trimestral",
  annual: "Anual",
  span: "Fecha a fecha",
};

export const AMOUNT_TYPE_LABELS = {
  fixed: "Fijo",
  variable: "Variable (estimado)",
};

export function expenseCategoryFor(templateCategory) {
  return CATEGORY_EXPENSE[templateCategory] || CATEGORY_EXPENSE.otros;
}

function nowBusiness() {
  return nowApp();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function clampDay(year, month, day) {
  const max = daysInMonth(year, month);
  return Math.min(Math.max(1, day), max);
}

function toDateAtNoon(year, month, day) {
  const d = clampDay(year, month, day);
  return new Date(`${year}-${pad2(month)}-${pad2(d)}T12:00:00`);
}

export function getQuarter(month) {
  return Math.ceil(month / 3);
}

function dateOnly(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isoWeekParts(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return { year: d.getUTCFullYear(), week };
}

export function buildPeriodKey(frequency, date = nowBusiness()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  if (frequency === "weekly") {
    const { year, week } = isoWeekParts(date);
    return `${year}-W${pad2(week)}`;
  }
  if (frequency === "span") return dateOnly(date) || `${y}-${pad2(m)}-${pad2(date.getDate())}`;
  if (frequency === "bimonthly") return `${y}-B${pad2(m)}`;
  if (frequency === "monthly") return `${y}-${pad2(m)}`;
  if (frequency === "quarterly") return `${y}-Q${getQuarter(m)}`;
  return String(y);
}

function weekdayOfTemplate(template) {
  const raw = Number(template.dueDayOfMonth);
  if (raw >= 1 && raw <= 7) return raw;
  return 1;
}

export function computeDueDate(template, periodKey) {
  const day = Number(template.dueDayOfMonth) || 1;

  if (template.frequency === "weekly") {
    const match = String(periodKey).match(/^(\d{4})-W(\d{2})$/);
    if (!match) return toDateAtNoon(nowBusiness().getFullYear(), nowBusiness().getMonth() + 1, 1);
    const year = Number(match[1]);
    const week = Number(match[2]);
    const weekday = weekdayOfTemplate(template);
    const jan4 = new Date(year, 0, 4, 12);
    const jan4Dow = jan4.getDay() || 7;
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - (jan4Dow - 1) + (week - 1) * 7);
    const due = new Date(monday);
    due.setDate(monday.getDate() + (weekday - 1));
    return due;
  }

  if (template.frequency === "span") {
    const start = dateOnly(template.startDate) || dateOnly(periodKey);
    if (!start) return toDateAtNoon(nowBusiness().getFullYear(), nowBusiness().getMonth() + 1, day);
    const [y, m, d] = start.split("-").map(Number);
    return toDateAtNoon(y, m, d);
  }

  if (template.frequency === "bimonthly") {
    const match = String(periodKey).match(/^(\d{4})-B(\d{2})$/);
    if (!match) return toDateAtNoon(nowBusiness().getFullYear(), nowBusiness().getMonth() + 1, day);
    return toDateAtNoon(Number(match[1]), Number(match[2]), day);
  }

  if (template.frequency === "monthly") {
    const [y, m] = periodKey.split("-").map(Number);
    return toDateAtNoon(y, m, day);
  }

  if (template.frequency === "quarterly") {
    const [yPart, qPart] = periodKey.split("-Q");
    const year = Number(yPart);
    const quarter = Number(qPart);
    const month = (quarter - 1) * 3 + 1;
    return toDateAtNoon(year, month, day);
  }

  const year = Number(periodKey);
  const month = Number(template.dueMonth) || 1;
  return toDateAtNoon(year, month, day);
}

const BIMONTHLY_MONTHS = [1, 3, 5, 7, 9, 11];
const QUARTERLY_MONTHS = [1, 4, 7, 10];

export function periodKeysToEnsure(template, refDate = nowBusiness()) {
  const frequency = template.frequency || "monthly";
  const year = refDate.getFullYear();
  const month = refDate.getMonth() + 1;

  if (frequency === "weekly") {
    const weekday = weekdayOfTemplate(template);
    const keys = [];
    const cursor = new Date(year, month - 1, 1, 12);
    const last = new Date(year, month, 0, 12);
    while (cursor <= last) {
      const jsDay = cursor.getDay() || 7;
      if (jsDay === weekday) keys.push(buildPeriodKey("weekly", cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return [...new Set(keys)];
  }

  if (frequency === "monthly") return [buildPeriodKey("monthly", refDate)];

  if (frequency === "bimonthly") {
    if (!BIMONTHLY_MONTHS.includes(month)) return [];
    return [buildPeriodKey("bimonthly", refDate)];
  }

  if (frequency === "quarterly") {
    if (!QUARTERLY_MONTHS.includes(month)) return [];
    return [buildPeriodKey("quarterly", refDate)];
  }

  if (frequency === "annual") {
    const dueMonth = Number(template.dueMonth) || 1;
    if (month !== dueMonth) return [];
    return [String(year)];
  }

  if (frequency === "span") {
    const start = dateOnly(template.startDate);
    if (!start || !start.startsWith(`${year}-${pad2(month)}`)) return [];
    return [start];
  }

  return [];
}

export function daysUntil(dueDate, refDate = nowBusiness()) {
  const due = new Date(dueDate);
  const start = new Date(refDate);
  start.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return Math.round((due - start) / (24 * 60 * 60 * 1000));
}

export function monthBounds(refDate = nowBusiness()) {
  const y = refDate.getFullYear();
  const m = refDate.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

export function daysLeftInMonth(refDate = nowBusiness()) {
  const { end } = monthBounds(refDate);
  const today = new Date(refDate);
  today.setHours(0, 0, 0, 0);
  const last = new Date(end);
  last.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((last - today) / (24 * 60 * 60 * 1000)) + 1);
}
