/**
 * Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings and all
 * arithmetic goes through UTC, so a deadline never shifts with the device's
 * time zone or a daylight-saving change.
 */
export type ISODate = string;

const MS_PER_DAY = 86_400_000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidISODate(value: string): value is ISODate {
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

function toEpochDay(date: ISODate): number {
  if (!isValidISODate(date)) throw new RangeError(`Invalid date: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d) / MS_PER_DAY;
}

function fromEpochDay(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: ISODate, to: ISODate): number {
  return toEpochDay(to) - toEpochDay(from);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Adds months, clamping to the last day of a shorter month (31 Jan + 1 → 28/29 Feb). */
export function addMonths(date: ISODate, months: number): ISODate {
  if (!isValidISODate(date)) throw new RangeError(`Invalid date: ${date}`);
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

/** Today's date as the user sees it on their device. */
export function todayISO(now: Date = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatDate(date: ISODate, locale?: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(toEpochDay(date) * MS_PER_DAY));
}
