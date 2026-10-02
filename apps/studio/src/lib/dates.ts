import type { Timestamp } from "@repo/contracts/release";

const dayOptions = { day: "numeric", month: "short", year: "numeric" } as const;
const dayFormat = new Intl.DateTimeFormat("en-GB", dayOptions);
// A date without a time names the same day everywhere, which local time would shift.
const dateFormat = new Intl.DateTimeFormat("en-GB", { ...dayOptions, timeZone: "UTC" });
const isDate = (at: string) => /^\d{4}-\d{2}-\d{2}$/.test(at);
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" });

/** A day, such as "25 Sep 2026", from a moment or an ISO 8601 date. */
export const formatDay = (at: string) => (isDate(at) ? dateFormat : dayFormat).format(new Date(at));

const twoDigits = (number: number) => String(number).padStart(2, "0");

/** Today's date where the person is, such as "2026-10-02". */
export const today = (now = new Date()) =>
  `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(now.getDate())}`;

/** A time of day, such as "2:14 pm". */
export const formatTime = (at: Timestamp) => timeFormat.format(new Date(at));

/** A moment, such as "25 Sep 2026, 2:14 pm". */
export const formatMoment = (at: Timestamp) => `${formatDay(at)}, ${formatTime(at)}`;

const relativeFormat = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

const units = [
  ["year", 365 * 24 * 60 * 60 * 1000],
  ["month", 30 * 24 * 60 * 60 * 1000],
  ["week", 7 * 24 * 60 * 60 * 1000],
  ["day", 24 * 60 * 60 * 1000],
  ["hour", 60 * 60 * 1000],
  ["minute", 60 * 1000],
] as const;

/** How long ago a moment was, such as "2 hours ago" or "yesterday". */
export const formatAgo = (at: Timestamp, now = Date.now()) => {
  const elapsed = Date.parse(at) - now;
  const [unit, size] = units.find(([, size]) => Math.abs(elapsed) >= size) ?? ["minute", 60_000];
  return relativeFormat.format(Math.round(elapsed / size), unit);
};
