import { noIdentity } from "@repo/contracts/brand";
import { BrandId } from "@repo/contracts/ids";
import { PageDocument, PageMeta } from "@repo/contracts/page";
import { SnapshotManifest } from "@repo/contracts/snapshot";
import { resolveTheme } from "@repo/tokens";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { blogFeed, pageMeta, redirectFor, sitemap } from "../src/lib/seo.ts";

const origin = "https://www.northbanklibraries.org";

const listing = (id: string, path: string, meta: Partial<typeof PageMeta.Encoded> = {}) => ({
  id,
  path,
  type: "page" as const,
  meta: { title: id, description: "", ...meta },
  object: "a".repeat(64),
});

const manifest = Schema.decodeSync(SnapshotManifest)({
  schema: "pakshi.snapshot/1",
  id: "snap_one",
  site: "site_northbank",
  settings: {
    name: "Northbank Libraries",
    sharingImage: { $ref: "media", id: "med_reading", alt: "The reading room" },
  },
  parts: {
    header: "b_header",
    footer: "b_footer",
    blocks: {
      b_header: { type: "header", variant: "simple", surface: "default", props: {} },
      b_footer: { type: "footer", variant: "simple", surface: "muted", props: {} },
    },
    menus: { main: [], footer: [] },
  },
  forms: {},
  redirects: {
    "/borrowing": { $ref: "page", id: "pg_borrow" },
    "/catalogue": "https://catalogue.northbanklibraries.org",
  },
  lockfile: { header: 1, footer: 1, hero: 1 },
  brand: Schema.encodeSync(SnapshotManifest.fields.brand)({
    brand: BrandId.make("brand_city"),
    number: 1,
    theme: resolveTheme({ preset: "civic", changes: {} }).theme,
    identity: noIdentity,
  }),
  media: {
    med_reading: { contentType: "image/jpeg", width: 1200, height: 630 },
    med_shelves: { contentType: "image/jpeg", width: 1600, height: 900 },
  },
  pages: [
    listing("pg_home", "/"),
    listing("pg_borrow", "/borrow"),
    listing("pg_staff", "/staff", { noindex: true }),
    {
      ...listing("pg_talks", "/blog/author-talks"),
      type: "post" as const,
      meta: {
        title: "Author talks",
        description: "",
        date: "2027-06-01",
        author: "Sam",
        tags: [],
        excerpt: "Three talks in July.",
      },
    },
  ],
  gone: [],
});

const page = (props: Schema.JsonObject) =>
  Schema.decodeSync(PageDocument)({
    schema: "pakshi.page/1",
    id: "pg_borrow",
    type: "page",
    path: "/borrow",
    meta: { title: "Borrow", description: "Borrow books." },
    root: ["b_hero"],
    blocks: {
      b_hero: { type: "hero", variant: "centered", surface: "brand", props },
    },
  });

describe("a page's sharing card", () => {
  test("shows the first image in its first section, or else the site's default", () => {
    const withHero = pageMeta(
      page({ heading: "Borrow", image: { $ref: "media", id: "med_shelves", alt: "Shelves" } }),
      manifest,
      origin,
    );
    expect(withHero.image).toEqual({
      src: `${origin}/_media/med_shelves`,
      width: 1600,
      height: 900,
      alt: "Shelves",
    });
    expect(pageMeta(page({ heading: "Borrow" }), manifest, origin).image?.alt).toBe(
      "The reading room",
    );
  });
});

describe("redirects", () => {
  test("follow a page to its address, or go to another site", () => {
    expect(redirectFor(manifest, "/borrowing")).toBe("/borrow");
    expect(redirectFor(manifest, "/catalogue")).toBe("https://catalogue.northbanklibraries.org");
    expect(redirectFor(manifest, "/elsewhere")).toBeNull();
  });
});

describe("the sitemap and feed", () => {
  test("leave out pages hidden from search engines", () => {
    const map = sitemap(manifest, origin);
    expect(map).toContain(`<loc>${origin}/borrow</loc>`);
    expect(map).not.toContain("/staff");
  });

  test("list the blog's posts in the feed", () => {
    expect(blogFeed(manifest, origin)).toContain(
      `<item><title>Author talks</title><link>${origin}/blog/author-talks</link>`,
    );
  });
});
