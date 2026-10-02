import { ReleaseId } from "@repo/contracts/ids";
import { describe, expect, test } from "vitest";

import { pageCacheKey, pageNumberOf } from "../src/lib/page-cache.ts";

const at = (address: string) => new URL(address, "https://www.northbanklibraries.org");

describe("the page a blog list shows", () => {
  test("is the number asked for, from 2 to 1000", () => {
    expect(pageNumberOf(at("/news?page=2"))).toBe(2);
    expect(pageNumberOf(at("/news?page=1000"))).toBe(1000);
  });

  test("is the first for anything else", () => {
    for (const asked of [
      "",
      "?page=",
      "?page=0",
      "?page=1",
      "?page=1001",
      "?page=-3",
      "?page=2.5",
      "?page=02",
      "?page=two",
    ])
      expect(pageNumberOf(at(`/news${asked}`))).toBe(1);
  });
});

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
