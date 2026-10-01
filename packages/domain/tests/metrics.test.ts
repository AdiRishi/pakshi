import { describe, expect, test } from "vitest";

import { businessDaysBetween, median } from "../src/metrics.ts";

describe("success metrics", () => {
  test("a median is the middle value, or halfway between the two middle ones", () => {
    expect(median([])).toBeNull();
    expect(median([9, 1, 4])).toBe(4);
    expect(median([10, 2, 4, 8])).toBe(6);
  });

  test("a weekend between two moments doesn't count as business days", () => {
    // Friday 2 October 2026 at noon to Monday 5 October at noon: Friday's afternoon and Monday's morning.
    expect(businessDaysBetween("2026-10-02T12:00:00.000Z", "2026-10-05T12:00:00.000Z")).toBe(1);
    // A whole working week.
    expect(businessDaysBetween("2026-10-05T00:00:00.000Z", "2026-10-12T00:00:00.000Z")).toBe(5);
    // Six hours on a Tuesday.
    expect(businessDaysBetween("2026-10-06T09:00:00.000Z", "2026-10-06T15:00:00.000Z")).toBe(0.25);
    expect(businessDaysBetween("2026-10-06T15:00:00.000Z", "2026-10-06T09:00:00.000Z")).toBe(0);
  });
});
