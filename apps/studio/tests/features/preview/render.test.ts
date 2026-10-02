import { latestLockfile } from "@repo/blocks";
import { blockFixtures, fixtureDraft, fixtureSite, fixtureTree } from "@repo/blocks/fixtures";
import { BlockId, BlockType, PageId } from "@repo/contracts/ids";
import type { PageDocument } from "@repo/contracts/page";
import { listingsOf } from "@repo/contracts/snapshot";
import type { SiteView } from "@repo/contracts/studio";
import { describe, expect, test } from "vitest";

import { siteDocument } from "@/features/preview/render";

const fixture = (type: string, name: string) => {
  const entry = blockFixtures.find(
    (candidate) =>
      candidate.type === type &&
      candidate.name === name &&
      candidate.version === latestLockfile[candidate.type],
  );
  if (entry === undefined) throw new Error(`No fixture ${type} ${name}.`);
  return fixtureTree(entry);
};

const news = PageId.make("pg_news");
const mentors = PageId.make("pg_mentors");
const section = BlockId.make("b_top");

/** A page of the fixture site holding one section. */
const holding = (id: PageId, block: PageDocument["blocks"][BlockId]): PageDocument => {
  const page = fixtureSite.pages[id];
  if (page === undefined) throw new Error(`The fixture site has no page ${id}.`);
  return { ...page, root: [section], blocks: { [section]: block } };
};

const draft = fixtureDraft({
  lockfile: latestLockfile,
  header: fixture("header", "standard"),
  footer: fixture("footer", "simple"),
  sections: [],
});

const preview = async (page: PageDocument, number: number) => {
  const view: SiteView = {
    settings: fixtureSite.settings,
    parts: draft.parts,
    forms: draft.forms,
    lockfile: draft.lockfile,
    brand: draft.brand,
    pages: listingsOf(draft.pages),
    media: fixtureSite.media,
    page,
  };
  const response = await siteDocument(view, {
    base: "/preview/site_fixtures/dr_fixtures",
    address: (path) => `/preview/site_fixtures/dr_fixtures${path}`,
    bar: null,
    changed: [],
    number,
  });
  return response.text();
};

/** The text of a document's main content, as a visitor reads it. */
const mainText = (html: string) =>
  (html.split("<main>")[1] ?? "").replaceAll(/<[^>]*>/g, "").replaceAll("&#x27;", "'");

describe("a previewed page", () => {
  test("shows a post's own title, date and author in its header", async () => {
    const page = holding(mentors, {
      type: BlockType.make("post-header"),
      variant: "simple",
      surface: "default",
      props: {},
    });
    const shown = mainText(await preview(page, 1));
    expect(shown).toContain("Meet this year's mentors");
    expect(shown).toContain("15 April 2027, Sam Okafor");
    expect(shown).not.toContain("Our plans for the year ahead");
  });

  test("on a blog, pages through the blog's posts", async () => {
    const page = holding(news, {
      type: BlockType.make("post-list"),
      variant: "list",
      surface: "default",
      props: { heading: "All the news", collection: { $ref: "page", id: news }, count: 1 },
    });
    const second = mainText(await preview(page, 2));
    expect(second).toContain("Dates for this summer are out");
    expect(second).not.toContain("Meet this year's mentors");
  });
});
