import { ReleaseId } from "@repo/contracts/ids";
import { describe, expect, test } from "vitest";

import { pageCacheKey } from "../src/lib/page-cache.ts";

const at = (address: string) => new URL(address, "https://www.northbanklibraries.org");

describe("a page's cache key", () => {
  const key = (address: string) =>
    pageCacheKey({ url: at(address), release: ReleaseId.make("rel_one"), worker: "v1" });

  test("is the same for every way of asking for the first page", () => {
    expect(key("/news?page=1")).toBe(key("/news"));
    expect(key("/news?page=5000&utm_source=mail")).toBe(key("/news"));
  });

  test("differs for each later page", () => {
    expect(key("/news?page=2")).not.toBe(key("/news"));
    expect(key("/news?page=2")).not.toBe(key("/news?page=3"));
  });
});
