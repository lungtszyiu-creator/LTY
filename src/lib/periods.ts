// Period math for weekly / monthly reports.
// - Weekly: Monday 00:00 → Sunday 23:59:59; due Sunday 23:59:59 (same day).
// - Monthly: 1st 00:00 → last-day 23:59:59; due is the LAST WORKING DAY of
//   the month at 23:59:59 (skip Sat/Sun). This matches the user's rule:
//   "周报每周日提交 / 月报每月最后工作日提交".
//
// All math is in CN timezone (UTC+8). The server may run in UTC so we
// convert explicitly when needed. For simplicity we treat "now" as a
// Date and compute with local time; the DATABASE_URL's tz is not used.

const TZ_OFFSET_MINUTES = 8 * 60;

function toCN(d: Date) {
  // Create a Date whose getUTC* methods reflect CN wall-clock time.
  return new Date(d.getTime() + (TZ_OFFSET_MINUTES - d.getTimezoneOffset() * -1) * 0);
  // Simpler: use getUTC* + offset in callers. We'll do that.
}

// Return the Monday of the week containing `ref` at 00:00 (CN time).
export function weekStart(ref: Date = new Date()): Date {
  // getDay: 0=Sun..6=Sat. Monday is 1. If Sunday, back up 6 days.
  const d = new Date(ref);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function weekEnd(ref: Date = new Date()): Date {
  const start = weekStart(ref);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

// For weekly reports, the cut-off is the same day as end (Sunday 23:59:59).
export function weeklyDueAt(ref: Date = new Date()): Date {
  return weekEnd(ref);
}

export function monthStart(ref: Date = new Date()): Date {
  const d = new Date(ref);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function monthEnd(ref: Date = new Date()): Date {
  const d = new Date(ref);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // last day of prev month
  d.setHours(23, 59, 59, 999);
  return d;
}

// Last working day = last day of month, but if that day is Sat/Sun, back up.
export function monthlyDueAt(ref: Date = new Date()): Date {
  const d = monthEnd(ref);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  d.setHours(23, 59, 59, 999);
  return d;
}

export function formatPeriod(type: 'WEEKLY' | 'MONTHLY', start: Date, end: Date) {
  if (type === 'WEEKLY') {
    // "2026-W17 · 04/21–04/27"
    const y = start.getFullYear();
    const sm = String(start.getMonth() + 1).padStart(2, '0');
    const sd = String(start.getDate()).padStart(2, '0');
    const em = String(end.getMonth() + 1).padStart(2, '0');
    const ed = String(end.getDate()).padStart(2, '0');
    return `${y} · ${sm}/${sd} – ${em}/${ed}`;
  }
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
}

// Keyed period start used as primary identity + unique key.
export function currentPeriodStart(type: 'WEEKLY' | 'MONTHLY', ref: Date = new Date()): Date {
  return type === 'WEEKLY' ? weekStart(ref) : monthStart(ref);
}

export function currentPeriodEnd(type: 'WEEKLY' | 'MONTHLY', ref: Date = new Date()): Date {
  return type === 'WEEKLY' ? weekEnd(ref) : monthEnd(ref);
}

export function currentDueAt(type: 'WEEKLY' | 'MONTHLY', ref: Date = new Date()): Date {
  return type === 'WEEKLY' ? weeklyDueAt(ref) : monthlyDueAt(ref);
}
