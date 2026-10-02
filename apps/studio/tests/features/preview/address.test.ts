import { SnapshotId } from "@repo/contracts/ids";
import { describe, expect, test } from "vitest";

import { reviewLink } from "@/features/preview/address";

const base = "/review/site_harbour/sub_summer";
const link = reviewLink(base, { version: "live", snapshot: SnapshotId.make("snap_two") });

describe("a link inside a review", () => {
  test("stays on the version and snapshot being reviewed", () => {
    expect(link("/about")).toBe(`${base}/about?version=live&snapshot=snap_two`);
  });

  test("keeps the page of posts it asks for", () => {
    expect(link("/news?page=2")).toBe(`${base}/news?page=2&version=live&snapshot=snap_two`);
  });

  test("keeps its fragment after the query", () => {
    expect(link("/about#team")).toBe(`${base}/about?version=live&snapshot=snap_two#team`);
  });
});
