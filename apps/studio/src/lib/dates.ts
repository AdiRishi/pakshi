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
