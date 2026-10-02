import { Schema } from "effect";
import { expect, test } from "vitest";

import { Draft } from "../src/draft.ts";
import { contentHash, listingsOf } from "../src/snapshot.ts";

test("equal pages hash the same whatever their key order", async () => {
  const a = await contentHash({ id: "pg_home", meta: { title: "Home", description: "" } });
  const b = await contentHash({ meta: { description: "", title: "Home" }, id: "pg_home" });
  expect(a).toBe(b);
  expect(a).toMatch(/^[a-f0-9]{64}$/);
});

test("pages whose sections are in another order hash differently", async () => {
  expect(await contentHash({ root: ["b_hero", "b_faq"] })).not.toBe(
    await contentHash({ root: ["b_faq", "b_hero"] }),
  );
});

const pages = (collectionPath: string) =>
  Schema.decodeSync(Draft.fields.pages)({
    pg_news: {
      schema: "pakshi.page/1",
      id: "pg_news",
      type: "collection",
      kind: "blog",
      path: collectionPath,
      meta: { title: "News", description: "" },
      root: [],
      blocks: {},
    },
    pg_dates: {
      schema: "pakshi.page/1",
      id: "pg_dates",
      type: "entry",
      kind: "blog",
      collection: "pg_news",
      slug: "dates",
      meta: {
        title: "Dates",
        description: "",
        date: "2027-03-02",
        author: "Meera Kapoor",
        tags: [],
        excerpt: "",
      },
      root: [],
      blocks: {},
    },
  });

test("an entry is listed at its slug below its collection's address", () => {
  const address = (path: string) =>
    listingsOf(pages(path)).find((listing) => listing.id === "pg_dates")?.path;
  expect(address("/news")).toBe("/news/dates");
  expect(address("/summer/news")).toBe("/summer/news/dates");
  expect(address("/")).toBe("/dates");
});
