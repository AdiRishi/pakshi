import { latestLockfile, loadBlocks, SitePage } from "@repo/blocks";
import { blockFixtures, fixtureDraft, fixtureSite, fixtureTree } from "@repo/blocks/fixtures";
import { BlockId, BlockType, PageId, SnapshotId } from "@repo/contracts/ids";
import type { PageDocument } from "@repo/contracts/page";
import { listingsOf } from "@repo/contracts/snapshot";
import type { SiteView } from "@repo/contracts/studio";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { reviewLink } from "@/features/preview/address";
import { viewData } from "@/features/preview/view-data";

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

const base = "/review/site_fixtures/sub_fixtures";

/** A page of the fixture site as a review shows it, at `number` among a blog's pages of posts. */
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
  await loadBlocks(view.lockfile);
  return renderToStaticMarkup(
    createElement(SitePage, {
      site: viewData(view, {
        number,
        src: (id) => `${base}/_media/${id}`,
        address: reviewLink(base, { version: "submitted", snapshot: SnapshotId.make("snap_one") }),
      }),
      page,
      parts: view.parts,
      lockfile: view.lockfile,
    }),
  );
};

/** The text of a page's main content, as a visitor reads it. */
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
    expect(shown).toContain("15 April 2027");
    expect(shown).toContain("Sam Okafor");
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

  test("in a review, links to the site's pages stay on the version and snapshot being reviewed", async () => {
    const page = holding(news, {
      type: BlockType.make("post-list"),
      variant: "list",
      surface: "default",
      props: { heading: "All the news", collection: { $ref: "page", id: news }, count: 1 },
    });
    const hrefs = Array.from(
      (await preview(page, 1)).matchAll(/href="([^"]*)"/g),
      ([, href]) => href,
    );
    const internal = hrefs.filter((href) => href?.startsWith("/"));
    expect(internal.length).toBeGreaterThan(0);
    for (const href of internal) {
      expect(href).toMatch(new RegExp(`^${base}/`));
      expect(href).toContain("version=submitted");
      expect(href).toContain("snapshot=snap_one");
    }
  });
});
