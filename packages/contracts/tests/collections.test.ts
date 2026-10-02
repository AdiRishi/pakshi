import { DateTime, Schema } from "effect";
import { describe, expect, test } from "vitest";

import { collectionKinds, entriesOf, pageNumberOf } from "../src/collections.ts";
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

test("a new post is dated the day it is where its author is, with nothing else filled in", () => {
  // Late on 2 March in New York, and already the afternoon of 3 March in Sydney.
  const now = DateTime.makeUnsafe("2027-03-03T03:30:00Z");
  const newPost = (timeZone: string) =>
    collectionKinds.blog.newMeta({
      title: "Regatta day",
      description: "Racing starts at ten.",
      author: "Meera Kapoor",
      now,
      timeZone: DateTime.zoneMakeNamedUnsafe(timeZone),
    });
  expect(newPost("America/New_York").date).toBe("2027-03-02");
  expect(newPost("Australia/Sydney")).toEqual({
    title: "Regatta day",
    description: "Racing starts at ten.",
    date: "2027-03-03",
    author: "Meera Kapoor",
    tags: [],
    excerpt: "",
  });
});

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
