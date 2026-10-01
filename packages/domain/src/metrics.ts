/*
 * The arithmetic of Pakshi's success metrics, apart from where their figures
 * come from: medians, and time counted in business days.
 */

const day = 24 * 60 * 60 * 1000;

/** The median of some numbers, or null when there are none. */
export const median = (values: ReadonlyArray<number>) => {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
};

const isWeekend = (date: Date) => date.getUTCDay() === 0 || date.getUTCDay() === 6;

/**
 * How many business days lie between two moments, in days and parts of
 * days: Saturdays and Sundays, in UTC, don't count.
 */
export const businessDaysBetween = (from: string, to: string) => {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (end <= start) return 0;
  let counted = 0;
  for (let cursor = start; cursor < end;) {
    const next = Math.min(end, Math.floor(cursor / day) * day + day);
    if (!isWeekend(new Date(cursor))) counted += next - cursor;
    cursor = next;
  }
  return counted / day;
};
