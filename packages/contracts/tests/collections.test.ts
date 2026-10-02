import { Schema } from "effect";
import { expect, test } from "vitest";

import { entriesOf } from "../src/collections.ts";
import { PageListing } from "../src/snapshot.ts";

const post = (id: string, collection: string, title: string, date: string) => ({
  id,
  path: `/${id.slice("pg_".length)}`,
  type: "entry",
  kind: "blog",
  collection,
  meta: { title, description: "", date, author: "Meera Kapoor", tags: [], excerpt: "" },
});

const listings = Schema.decodeUnknownSync(Schema.Array(PageListing))([
  { id: "pg_home", path: "/", type: "page", meta: { title: "Home", description: "" } },
  {
    id: "pg_news",
    path: "/news",
    type: "collection",
    kind: "blog",
    meta: { title: "News", description: "" },
  },
  {
    id: "pg_stories",
    path: "/stories",
    type: "collection",
    kind: "blog",
    meta: { title: "Stories", description: "" },
  },
  post("pg_mentors", "pg_news", "Meet the mentors", "2027-02-10"),
  post("pg_venue", "pg_news", "Venue confirmed", "2027-03-02"),
  post("pg_alumni", "pg_stories", "An alumna returns", "2027-04-01"),
  post("pg_dates", "pg_news", "Dates announced", "2027-03-02"),
]);

test("a blog lists only its own posts, newest first, a day's posts by title", () => {
  const news = listings.find((page) => page.type === "collection" && page.id === "pg_news");
  if (news?.type !== "collection") throw new Error("The fixture has no News.");
  expect(entriesOf(listings, news).map((entry) => entry.id)).toEqual([
    "pg_dates",
    "pg_venue",
    "pg_mentors",
  ]);
});
