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

export const DURATION_LABELS = {
  indefinite: "Indefinida",
  limited: "Plazos definidos",
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

export function isLimitedDuration(template) {
  const mode = String(template?.durationMode || "").toLowerCase();
  if (mode === "limited") return true;
  if (mode === "indefinite") return false;
  // Legacy: endDate u occurrenceCount sin durationMode
  return Boolean(template?.endDate) || Number(template?.occurrenceCount) > 0;
}

function roundMoney(x) {
  return Number(Number(x || 0).toFixed(2));
}

/**
 * Plan tipo préstamos: Entrada + N cuotas (última marcada final).
 * - totalAmount: total del plan
 * - entryAmount: pago inicial (puede ser 0)
 * - occurrenceCount: cuotas mensuales DESPUÉS de la entrada (o totales si no hay entrada)
 * - firstInstallmentSameMonth: si true, entrada + 1ª cuota en el mes de inicio;
 *   si false (default) y hay entrada, la 1ª cuota arranca el mes siguiente.
 */
export function buildLimitedPaymentPlan(template) {
  const start = dateOnly(template.startDate) || dateOnly(nowBusiness());
  if (!start) return [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const day = Number(template.dueDayOfMonth) || 5;
  const n = Math.max(1, Math.floor(Number(template.occurrenceCount) || 1));
  const total = Math.max(0, roundMoney(template.totalAmount));
  const entry = Math.max(0, roundMoney(template.entryAmount));
  const hasEntry = entry > 0.009;
  const sameMonth = Boolean(template.firstInstallmentSameMonth);

  const rows = [];
  let seq = 1;

  if (hasEntry) {
    rows.push({
      sequence: seq++,
      kind: "entry",
      periodKey: "entrada",
      dueDate: toDateAtNoon(sy, sm, sd),
      expectedAmount: entry,
      label: "Entrada",
    });
  }

  // Monto a repartir en cuotas
  let pot;
  if (total > 0.009) {
    pot = roundMoney(Math.max(0, total - entry));
  } else {
    pot = roundMoney(Number(template.baseAmount || 0) * n);
  }
  const each = n > 0 ? Math.floor((pot * 100) / n) / 100 : 0;
  let allocated = 0;

  // Por defecto con entrada: cuotas desde el mes SIGUIENTE.
  // Con firstInstallmentSameMonth: entrada + 1ª cuota el mismo mes de inicio.
  let firstOffset = 0;
  if (hasEntry && !sameMonth) {
    firstOffset = 1;
  } else if (!hasEntry && day < sd) {
    firstOffset = 1;
  }

  for (let i = 0; i < n; i += 1) {
    const { year, month } = addMonths(sy, sm, firstOffset + i);
    const isLast = i === n - 1;
    const amt = isLast ? roundMoney(pot - allocated) : each;
    allocated = roundMoney(allocated + amt);
    rows.push({
      sequence: seq++,
      kind: isLast ? "final" : "installment",
      periodKey: `${year}-${pad2(month)}`,
      dueDate: toDateAtNoon(year, month, day),
      expectedAmount: amt,
      label: isLast ? `Cuota final (${i + 1}/${n})` : `Cuota ${i + 1}/${n}`,
    });
  }

  return rows;
}

export function usesPaymentPlan(template) {
  if (!isLimitedDuration(template)) return false;
  const total = Number(template.totalAmount) || 0;
  const entry = Number(template.entryAmount) || 0;
  return total > 0.009 || entry > 0.009;
}

export const OCCURRENCE_KIND_LABELS = {
  entry: "Entrada",
  installment: "Cuota",
  final: "Cuota final",
  recurring: "Recurrente",
};

/** YYYY-MM comparable for monthly-like periods. */
function periodSortKey(frequency, periodKey) {
  if (frequency === "weekly") {
    const m = String(periodKey).match(/^(\d{4})-W(\d{2})$/);
    if (!m) return periodKey;
    return `${m[1]}-W${m[2]}`;
  }
  if (frequency === "monthly" || frequency === "bimonthly") {
    const m = String(periodKey).match(/^(\d{4})-B?(\d{2})$/);
    if (m) return `${m[1]}-${m[2]}`;
  }
  if (frequency === "quarterly") {
    const m = String(periodKey).match(/^(\d{4})-Q(\d)$/);
    if (m) {
      const month = (Number(m[2]) - 1) * 3 + 1;
      return `${m[1]}-${pad2(month)}`;
    }
  }
  if (frequency === "annual") return `${periodKey}-01`;
  if (frequency === "span") return String(periodKey).slice(0, 10);
  return String(periodKey);
}

function addMonths(year, month, delta) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/**
 * Calcula endDate (DATEONLY) a partir de startDate + N plazos según frecuencia.
 */
export function computeEndDateFromCount(template, startDate, count) {
  const start = dateOnly(startDate);
  const n = Math.max(1, Math.floor(Number(count) || 1));
  if (!start) return null;
  const [sy, sm] = start.split("-").map(Number);
  const day = Number(template.dueDayOfMonth) || 1;
  const frequency = template.frequency || "monthly";

  if (frequency === "weekly") {
    const last = new Date(`${start}T12:00:00`);
    last.setDate(last.getDate() + 7 * (n - 1));
    return dateOnly(last);
  }
  if (frequency === "bimonthly") {
    const { year, month } = addMonths(sy, sm, (n - 1) * 2);
    return dateOnly(toDateAtNoon(year, month, day));
  }
  if (frequency === "quarterly") {
    const { year, month } = addMonths(sy, sm, (n - 1) * 3);
    return dateOnly(toDateAtNoon(year, month, day));
  }
  if (frequency === "annual") {
    const dueMonth = Number(template.dueMonth) || sm;
    return dateOnly(toDateAtNoon(sy + (n - 1), dueMonth, day));
  }
  if (frequency === "span") {
    return start;
  }
  // monthly (default)
  const { year, month } = addMonths(sy, sm, n - 1);
  return dateOnly(toDateAtNoon(year, month, day));
}

export function resolveTemplateWindow(template) {
  if (!isLimitedDuration(template)) return { limited: false, start: null, end: null, count: null };
  const start = dateOnly(template.startDate) || dateOnly(nowBusiness());
  const count = Number(template.occurrenceCount) > 0 ? Math.floor(Number(template.occurrenceCount)) : null;
  let end = dateOnly(template.endDate);
  if (!end && count) {
    end = computeEndDateFromCount(template, start, count);
  }
  return { limited: true, start, end, count };
}

export function periodInTemplateWindow(template, periodKey, _dueDate) {
  const win = resolveTemplateWindow(template);
  if (!win.limited) return true;
  const freq = template.frequency || "monthly";
  if (win.start) {
    const startYm = win.start.slice(0, 7);
    if (periodSortKey(freq, periodKey) < startYm) return false;
  }
  if (win.end) {
    const endYm = win.end.slice(0, 7);
    if (periodSortKey(freq, periodKey) > endYm) return false;
  }
  return true;
}

/** Todos los periodKeys de una plantilla limited (para generar las N cuotas de una vez). */
export function allPeriodKeysInWindow(template) {
  const win = resolveTemplateWindow(template);
  if (!win.limited || !win.start) return [];
  const frequency = template.frequency || "monthly";
  const count = win.count || 1;
  const [sy, sm] = win.start.split("-").map(Number);
  const keys = [];

  if (frequency === "weekly") {
    let cursor = new Date(`${win.start}T12:00:00`);
    const end = win.end ? new Date(`${win.end}T23:59:59`) : null;
    let guard = 0;
    while (guard < count * 2 + 8) {
      const key = buildPeriodKey("weekly", cursor);
      const due = computeDueDate(template, key);
      if (periodInTemplateWindow(template, key, due) && !keys.includes(key)) {
        keys.push(key);
        if (keys.length >= count) break;
      }
      cursor.setDate(cursor.getDate() + 1);
      if (end && cursor > end) break;
      guard += 1;
    }
    return keys.slice(0, count);
  }

  if (frequency === "span") {
    return [win.start];
  }

  for (let i = 0; i < count; i += 1) {
    let step = i;
    if (frequency === "bimonthly") step = i * 2;
    if (frequency === "quarterly") step = i * 3;
    if (frequency === "annual") {
      keys.push(String(sy + i));
      continue;
    }
    const { year, month } = addMonths(sy, sm, step);
    const ref = new Date(year, month - 1, 12, 12);
    const key = buildPeriodKey(frequency === "bimonthly" ? "bimonthly" : frequency === "quarterly" ? "quarterly" : "monthly", ref);
    if (frequency === "bimonthly" && !BIMONTHLY_MONTHS.includes(month)) {
      // snap to next bimonthly month
      let m = month;
      let y = year;
      while (!BIMONTHLY_MONTHS.includes(m)) {
        ({ year: y, month: m } = addMonths(y, m, 1));
      }
      keys.push(buildPeriodKey("bimonthly", new Date(y, m - 1, 12, 12)));
    } else if (frequency === "quarterly" && !QUARTERLY_MONTHS.includes(month)) {
      let m = month;
      let y = year;
      while (!QUARTERLY_MONTHS.includes(m)) {
        ({ year: y, month: m } = addMonths(y, m, 1));
      }
      keys.push(buildPeriodKey("quarterly", new Date(y, m - 1, 12, 12)));
    } else {
      keys.push(key);
    }
  }
  return [...new Set(keys)].slice(0, count);
}

export function periodKeysToEnsure(template, refDate = nowBusiness(), { generateAllLimited = false } = {}) {
  const frequency = template.frequency || "monthly";

  if (isLimitedDuration(template) && generateAllLimited) {
    return allPeriodKeysInWindow(template);
  }

  const year = refDate.getFullYear();
  const month = refDate.getMonth() + 1;
  let keys = [];

  if (frequency === "weekly") {
    const weekday = weekdayOfTemplate(template);
    const cursor = new Date(year, month - 1, 1, 12);
    const last = new Date(year, month, 0, 12);
    while (cursor <= last) {
      const jsDay = cursor.getDay() || 7;
      if (jsDay === weekday) keys.push(buildPeriodKey("weekly", cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    keys = [...new Set(keys)];
  } else if (frequency === "monthly") {
    keys = [buildPeriodKey("monthly", refDate)];
  } else if (frequency === "bimonthly") {
    if (BIMONTHLY_MONTHS.includes(month)) keys = [buildPeriodKey("bimonthly", refDate)];
  } else if (frequency === "quarterly") {
    if (QUARTERLY_MONTHS.includes(month)) keys = [buildPeriodKey("quarterly", refDate)];
  } else if (frequency === "annual") {
    const dueMonth = Number(template.dueMonth) || 1;
    if (month === dueMonth) keys = [String(year)];
  } else if (frequency === "span") {
    const start = dateOnly(template.startDate);
    if (start && start.startsWith(`${year}-${pad2(month)}`)) keys = [start];
  }

  return keys.filter((periodKey) => {
    const due = computeDueDate(template, periodKey);
    return periodInTemplateWindow(template, periodKey, due);
  });
}

/** Tras el fin de plazos limited, la plantilla ya no debe generar más. */
export function shouldAutoDeactivateLimited(template, refDate = nowBusiness()) {
  const win = resolveTemplateWindow(template);
  if (!win.limited || !win.end) return false;
  const today = dateOnly(refDate) || dateOnly(nowBusiness());
  return Boolean(today && win.end && today > win.end);
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
