import { expect, test } from "vitest";

// West of UTC, midnight UTC on a date is still the day before.
process.env.TZ = "America/New_York";
const { formatDay, today } = await import("@/lib/dates");

test("a date reads as the same day wherever the person is", () => {
  expect(formatDay("2027-03-02")).toBe("2 Mar 2027");
});

test("today is the date where the person is, late in their evening too", () => {
  expect(today(new Date("2027-03-02T23:30:00-05:00"))).toBe("2027-03-02");
});
