import { expect, test } from "vitest";

// West of UTC, midnight UTC on a date is still the day before.
process.env.TZ = "America/New_York";
const { formatDay } = await import("@/lib/dates");

test("a date reads as the same day wherever the person is", () => {
  expect(formatDay("2027-03-02")).toBe("2 Mar 2027");
});
