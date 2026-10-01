import type { Timestamp } from "@repo/contracts/release";

const dayFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const timeFormat = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit" });

/** A day, such as "25 Sep 2026", from a moment or an ISO 8601 date. */
export const formatDay = (at: string) => dayFormat.format(new Date(at));

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
