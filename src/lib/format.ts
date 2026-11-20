import { CURRENCY, LOCALE, TIME_ZONE } from "./config";

const moneyFormat = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
});

export const money = (n: number) => moneyFormat.format(n);

/** Today as YYYY-MM-DD in the app's time zone. */
export const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());

/** A valid YYYY-MM from the URL, or the current month. */
export function parseMonth(m?: string): string {
  return m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today().slice(0, 7);
}

/** Shift a YYYY-MM by n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export function dayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** A date with its weekday, e.g. "Sun, Nov 15". */
export function dayLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Yesterday as YYYY-MM-DD in the app's time zone. */
export function yesterday(): string {
  const [y, m, d] = today().split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/**
 * Read an amount as typed: "1,500", "₱1500.50", or a quick sum such as "1200+350"
 * or "5000-1250". Returns null if it isn't a number or a sum of numbers.
 */
export function parseAmount(input: string): number | null {
  const text = input.replace(/[\s,₱]/g, "");
  if (!/^\d+(\.\d+)?([+-]\d+(\.\d+)?)*$/.test(text)) return null;
  const total = (text.match(/[+-]?\d+(\.\d+)?/g) ?? []).reduce((sum, part) => sum + Number(part), 0);
  return Math.round(total * 100) / 100;
}
