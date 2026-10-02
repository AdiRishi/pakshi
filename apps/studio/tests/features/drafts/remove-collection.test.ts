import type { Draft } from "@repo/contracts/draft";
import { MenuItemId, PageId } from "@repo/contracts/ids";
import { batchLimit, type Op } from "@repo/contracts/ops";
import type { PageDocument } from "@repo/contracts/page";
import type { Menus } from "@repo/contracts/site";
import { applyOps } from "@repo/domain/document";
import { Predicate } from "effect";
import { expect, test } from "vitest";

import { removalBatches } from "@/features/drafts/remove-collection";

import { contracts, harbour, summariesOf } from "./draft";

const news = PageId.make("pg_news");
const dates = PageId.make("pg_dates");
const mentors = PageId.make("pg_mentors");
const home = PageId.make("pg_home");

/** The draft once each batch has applied in turn, as the dialog sends them. */
const applied = (draft: Draft, batches: ReadonlyArray<ReadonlyArray<Op>>) =>
  batches.reduce<Draft>((current, ops) => {
    const result = applyOps(current, ops, contracts);
    if (!result.ok) throw new Error(`A batch was rejected: ${JSON.stringify(result.errors)}`);
    return result.draft;
  }, draft);

/** Every page a menu item links to. */
const linkedFrom = (menus: Menus) =>
  [...menus.main.flatMap((item) => [item, ...(item.children ?? [])]), ...menus.footer].flatMap(
    (item) => (Predicate.isString(item.target) ? [] : [item.target.id]),
  );

/** Harbour's draft with a footer link to one of News's posts. */
const withPostInFooter: Draft = {
  ...harbour,
  parts: {
    ...harbour.parts,
    menus: {
      ...harbour.parts.menus,
      footer: [
        ...harbour.parts.menus.footer,
        { id: MenuItemId.make("mi_dates"), label: "Dates", target: { $ref: "page", id: dates } },
      ],
    },
  },
};

const blogOf = (draft: Draft) => {
  const blog = summariesOf(draft).find((page) => page.id === news);
  if (blog === undefined) throw new Error("Harbour has a News blog.");
  return blog;
};

test("deleting a blog deletes its posts and every menu item that links to it or them", () => {
  const draft = applied(
    withPostInFooter,
    removalBatches({
      page: blogOf(withPostInFooter),
      pages: summariesOf(withPostInFooter),
      menus: withPostInFooter.parts.menus,
      action: "delete",
      redirectTo: home,
    }),
  );
  expect(Object.keys(draft.pages)).not.toContain(news);
  expect(Object.keys(draft.pages)).not.toContain(dates);
  expect(Object.keys(draft.pages)).not.toContain(mentors);
  expect(linkedFrom(draft.parts.menus)).toEqual(["pg_home", "pg_programme", "pg_programme"]);
  expect(draft.redirects).toEqual({ "/news": { $ref: "page", id: home } });
});

test("a blog with more posts than one batch holds is deleted over several, the blog last", () => {
  const posts = Array.from({ length: batchLimit + 100 }, (_, index): PageDocument => ({
    schema: "pakshi.page/1",
    id: PageId.make(`pg_post${index}`),
    type: "entry",
    kind: "blog",
    collection: news,
    slug: `post-${index}`,
    meta: {
      title: `Post ${index}`,
      description: "",
      date: "2027-05-01",
      author: "Meera Kapoor",
      tags: [],
      excerpt: "",
    },
    root: [],
    blocks: {},
  }));
  const crowded: Draft = {
    ...harbour,
    pages: { ...harbour.pages, ...Object.fromEntries(posts.map((post) => [post.id, post])) },
  };
  const batches = removalBatches({
    page: blogOf(crowded),
    pages: summariesOf(crowded),
    menus: crowded.parts.menus,
    action: "delete",
    redirectTo: null,
  });
  expect(batches.length).toBeGreaterThan(1);
  for (const batch of batches) expect(batch.length).toBeLessThanOrEqual(batchLimit);
  const draft = applied(crowded, batches);
  expect(Object.keys(draft.pages).toSorted()).toEqual(["pg_home", "pg_programme"]);
});

test("unpublishing a blog keeps its posts in the draft, and takes them out of the menus", () => {
  const draft = applied(
    withPostInFooter,
    removalBatches({
      page: blogOf(withPostInFooter),
      pages: summariesOf(withPostInFooter),
      menus: withPostInFooter.parts.menus,
      action: "unpublish",
      redirectTo: null,
    }),
  );
  expect(draft.pages[news]?.status).toBe("unpublished");
  expect(draft.pages[dates]).toBeDefined();
  expect(draft.pages[mentors]).toBeDefined();
  expect(linkedFrom(draft.parts.menus)).toEqual(["pg_home", "pg_programme", "pg_programme"]);
});
