import { getAppTimezone, getZonedParts, nowApp } from "./appDateTime.js";

const CATEGORY_EXPENSE = {
  arriendo: "Arriendo",
  servicios: "Servicios públicos",
  permisos: "Permisos y licencias",
  otros: "Gastos fijos",
};

export const CATEGORY_LABELS = {
  arriendo: "Arriendo",
  servicios: "Servicios (luz, agua)",
  permisos: "Permisos anuales",
  otros: "Otros",
};

export const FREQUENCY_LABELS = {
  monthly: "Mensual",
  quarterly: "Trimestral",
  annual: "Anual",
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

export function buildPeriodKey(frequency, date = nowBusiness()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  if (frequency === "monthly") return `${y}-${pad2(m)}`;
  if (frequency === "quarterly") return `${y}-Q${getQuarter(m)}`;
  return String(y);
}

export function computeDueDate(template, periodKey) {
  const day = Number(template.dueDayOfMonth) || 1;

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

export function periodKeysToEnsure(template, refDate = nowBusiness()) {
  const keys = new Set();
  keys.add(buildPeriodKey(template.frequency, refDate));

  const next = new Date(refDate);
  if (template.frequency === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else if (template.frequency === "quarterly") {
    next.setMonth(next.getMonth() + 3);
  } else {
    next.setFullYear(next.getFullYear() + 1);
  }
  keys.add(buildPeriodKey(template.frequency, next));
  return [...keys];
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
