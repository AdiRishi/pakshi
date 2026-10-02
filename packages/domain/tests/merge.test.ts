import { loadBlockVersions } from "@repo/blocks";
import { type BlockContract, blockKey } from "@repo/blocks/contract";
import { optional, propsSchema, text } from "@repo/blocks/fields";
import { Draft, type SiteContent } from "@repo/contracts/draft";
import { BlockId, PageId } from "@repo/contracts/ids";
import type { Conflict, ConflictKey, Resolutions, Side } from "@repo/contracts/merge";
import { Op } from "@repo/contracts/ops";
import { listingsOf, LiveRelease } from "@repo/contracts/snapshot";
import { defaultTheme, resolveTheme, type Surface } from "@repo/tokens";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { applyOps, type BlockContracts } from "../src/document.ts";
import { type BlockLibrary, contractsAt, mergeSites, migrateContent } from "../src/merge.ts";
import { rebaseOps } from "../src/rebase.ts";
import { contracts, harbourDraft } from "./support/draft.ts";

type WireOp = typeof Op.Encoded;

const decodeOps = Schema.decodeSync(Schema.Array(Op));

const edit = (draft: Draft, ops: ReadonlyArray<WireOp>, using: BlockContracts = contracts) => {
  const applied = applyOps(draft, decodeOps(ops), using);
  if (!applied.ok) throw new Error(JSON.stringify(applied.errors));
  return applied.draft;
};

const heroV1 = contracts.get("hero");
if (heroV1 === undefined) throw new Error("The harbour draft pins hero.");

/** A second hero version, which adds a required kicker above the heading. */
const heroV2: BlockContract = {
  ...heroV1,
  version: 2,
  fields: {
    ...heroV1.fields,
    kicker: text({ title: "Kicker", max: 40 }),
    note: optional(text({ title: "Note", max: 40 })),
  },
  migrate: (props) => ({ ...props, kicker: "Summer 2027" }),
};

const library: BlockLibrary = new Map([
  ...(await loadBlockVersions([harbourDraft.lockfile])),
  [blockKey("hero", 2), heroV2],
]);

const newBase = Schema.decodeSync(LiveRelease)({ release: "rel_two", snapshot: "snap_two" });

/**
 * Merges live into the draft, both started from the harbour draft, then
 * commits the merge to the draft as ops and checks that they reach exactly
 * the merged content.
 */
const merge = (
  sides: { readonly draft: Draft; readonly live: Draft },
  resolutions: Resolutions = {},
  from: Draft = harbourDraft,
) => {
  const result = mergeSites({ base: from, ...sides }, library, resolutions);
  const using = contractsAt(library, result.content.lockfile);
  const committed = applyOps(
    sides.draft,
    rebaseOps(sides.draft, result.content, newBase, using),
    using,
  );
  if (!committed.ok) throw new Error(JSON.stringify(committed.errors));
  const { id: _, site: _site, base, revision: _revision, ...content } = committed.draft;
  expect(base).toEqual(newBase);
  expect(content).toEqual(result.content);
  return result;
};

/** Keeps one side for every conflict in a merge. */
const choosing = (conflicts: ReadonlyArray<Conflict>, side: Side): Resolutions => {
  const resolutions: Record<ConflictKey, Side> = {};
  for (const conflict of conflicts) resolutions[conflict.key] = side;
  return resolutions;
};

const home = PageId.make("pg_home");

const block = (content: SiteContent, id: string) => content.pages[home]?.blocks[BlockId.make(id)];

const setProp = (id: string, path: ReadonlyArray<string>, value: Schema.Json): WireOp => ({
  op: "setProp",
  target: "pg_home",
  block: id,
  path,
  value,
});

const heading = (value: string) => setProp("b_hero", ["heading"], value);

const item = (id: string, title: string) => ({
  id,
  type: "feature-item",
  variant: "default",
  props: { title, body: `${title}, every day.` },
});

const insertItem = (id: string, title: string, after: string | null): WireOp => ({
  op: "insertBlock",
  page: "pg_home",
  list: { block: "b_features", slot: "items" },
  after,
  block: item(id, title),
});

const move = (
  id: string,
  after: string | null,
  list: "root" | { readonly block: string; readonly slot: string } = "root",
): WireOp => ({
  op: "moveBlock",
  page: "pg_home",
  block: id,
  list,
  after,
});

const items = (content: SiteContent) => block(content, "b_features")?.slots?.["items"];

describe("changes on one side", () => {
  test("merge on their own, field by field", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, [setProp("b_workshops", ["title"], "Classes")]);
    const { content, conflicts, changes } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(block(content, "b_hero")?.props["heading"]).toBe("Build a boat");
    expect(block(content, "b_workshops")?.props["title"]).toBe("Classes");
    expect(changes).toEqual([
      {
        _tag: "ValueChanged",
        place: { target: home, title: "Harbour Summer School" },
        block: { id: "b_workshops", title: "Feature" },
        field: "Title",
      },
    ]);
  });

  test("merge when the same change is made on both sides", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, [heading("Build a boat")]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(block(content, "b_hero")?.props["heading"]).toBe("Build a boat");
  });

  test("keep every block both sides add to one list, live's first", () => {
    const draft = edit(harbourDraft, [insertItem("b_draft1", "Sailing", "b_workshops")]);
    const live = edit(harbourDraft, [
      insertItem("b_live1", "Rowing", "b_workshops"),
      insertItem("b_live2", "Knots", null),
    ]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(items(content)).toEqual(["b_live2", "b_workshops", "b_live1", "b_draft1", "b_mentors"]);
  });

  test("keep one side's reordering with the other side's additions", () => {
    const draft = edit(harbourDraft, [move("b_gallery", null)]);
    const live = edit(harbourDraft, [insertItem("b_live1", "Rowing", "b_mentors")]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(content.pages[home]?.root).toEqual(["b_gallery", "b_hero", "b_features"]);
    expect(items(content)).toEqual(["b_workshops", "b_mentors", "b_live1"]);
  });

  test("remove a block the other side left alone", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, [{ op: "removeBlock", page: "pg_home", block: "b_gallery" }]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(block(content, "b_gallery")).toBeUndefined();
    expect(content.pages[home]?.root).toEqual(["b_hero", "b_features"]);
  });

  test("keep one side's move of a block the other side edits", () => {
    const draft = edit(harbourDraft, [
      move("b_mentors", null, { block: "b_features", slot: "items" }),
    ]);
    const live = edit(harbourDraft, [setProp("b_mentors", ["title"], "Guides")]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(items(content)).toEqual(["b_mentors", "b_workshops"]);
    expect(block(content, "b_mentors")?.props["title"]).toBe("Guides");
  });

  test("merge a list inside props item by item", () => {
    const draft = edit(harbourDraft, [
      setProp("b_gallery", ["images", "it_quay", "caption"], "The old quay"),
    ]);
    const live = edit(harbourDraft, [
      setProp(
        "b_gallery",
        ["images"],
        [
          { id: "it_boats", image: { $ref: "media", id: "med_harbour", alt: "Boats" } },
          { id: "it_quay", image: { $ref: "media", id: "med_harbour" }, caption: "The quay" },
          { id: "it_sails", image: { $ref: "media", id: "med_harbour", alt: "Sails" } },
        ],
      ),
    ]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(block(content, "b_gallery")?.props["images"]).toEqual([
      { id: "it_boats", image: { $ref: "media", id: "med_harbour", alt: "Boats" } },
      { id: "it_quay", image: { $ref: "media", id: "med_harbour" }, caption: "The old quay" },
      { id: "it_sails", image: { $ref: "media", id: "med_harbour", alt: "Sails" } },
    ]);
  });

  test("add, remove and change pages", () => {
    const draft = edit(harbourDraft, [
      {
        op: "createPage",
        page: {
          schema: "pakshi.page/1",
          id: "pg_faq",
          type: "page",
          path: "/faq",
          meta: { title: "FAQ", description: "" },
          root: [],
          blocks: {},
        },
      },
      { op: "setMeta", page: "pg_about", field: "title", value: "About us" },
    ]);
    const live = edit(harbourDraft, [
      { op: "deletePage", page: "pg_dates" },
      {
        op: "createPage",
        page: {
          schema: "pakshi.page/1",
          id: "pg_visit",
          type: "page",
          path: "/visit",
          meta: { title: "Visit", description: "" },
          root: [],
          blocks: {},
        },
      },
      { op: "setPath", page: "pg_about", path: "/about-us" },
    ]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(Object.keys(content.pages).toSorted()).toEqual([
      "pg_about",
      "pg_faq",
      "pg_home",
      "pg_news",
      "pg_visit",
    ]);
    expect(content.pages[PageId.make("pg_about")]).toMatchObject({
      path: "/about-us",
      meta: { title: "About us" },
    });
  });
});

describe("a conflict", () => {
  test("arises when list items added on each side together break the list's limit", () => {
    const image = (id: string) => ({ id, image: { $ref: "media", id: "med_harbour", alt: id } });
    const gallery = (ids: ReadonlyArray<string>): WireOp =>
      setProp("b_gallery", ["images"], ids.map(image));
    const full = Array.from({ length: 23 }, (_, index) => `it_photo${index}`);
    const base = edit(harbourDraft, [gallery(full)]);
    const draft = edit(base, [gallery([...full, "it_draft"])]);
    const live = edit(base, [gallery([...full, "it_live"])]);
    const { conflicts } = merge({ draft, live }, {}, base);
    expect(conflicts).toEqual([
      expect.objectContaining({ _tag: "Changed", field: "Photos", kind: "list" }),
    ]);
    const images = block(
      merge({ draft, live }, choosing(conflicts, "live"), base).content,
      "b_gallery",
    )?.props["images"];
    expect(Array.isArray(images) && images.length).toBe(24);
  });

  test("in a text field can be settled with a merged value", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, [heading("Sail a boat")]);
    const [conflict] = merge({ draft, live }).conflicts;
    if (conflict === undefined) throw new Error("There's a conflict.");
    const merged = merge({ draft, live }, { [conflict.key]: { merged: "Build and sail a boat" } });
    expect(block(merged.content, "b_hero")?.props["heading"]).toBe("Build and sail a boat");
  });

  test("arises when both sides change one field differently, and keeps the side chosen", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, [heading("Sail a boat")]);
    const [conflict] = merge({ draft, live }).conflicts;
    expect(conflict).toMatchObject({
      _tag: "Changed",
      block: { id: "b_hero", title: "Hero" },
      field: "Heading",
      kind: "text",
      base: "Learn by building",
      draft: "Build a boat",
      live: "Sail a boat",
    });
    if (conflict === undefined) throw new Error("There's a conflict.");
    expect(block(merge({ draft, live }, {}).content, "b_hero")?.props["heading"]).toBe(
      "Build a boat",
    );
    expect(
      block(merge({ draft, live }, choosing([conflict], "live")).content, "b_hero")?.props[
        "heading"
      ],
    ).toBe("Sail a boat");
  });

  test("arises when one side edits a block the other removed", () => {
    const draft = edit(harbourDraft, [setProp("b_workshops", ["title"], "Classes")]);
    const live = edit(harbourDraft, [{ op: "removeBlock", page: "pg_home", block: "b_features" }]);
    const { conflicts } = merge({ draft, live });
    // The section was removed, so the conflict is about the section, not the item in it.
    expect(conflicts).toEqual([
      expect.objectContaining({
        _tag: "Removed",
        block: { id: "b_features", title: "Features" },
        removedOn: "live",
      }),
    ]);
    const kept = merge({ draft, live }, choosing(conflicts, "draft")).content;
    expect(block(kept, "b_workshops")?.props["title"]).toBe("Classes");
    expect(items(kept)).toEqual(["b_workshops", "b_mentors"]);
    const removed = merge({ draft, live }, choosing(conflicts, "live")).content;
    expect(block(removed, "b_features")).toBeUndefined();
    expect(block(removed, "b_workshops")).toBeUndefined();
  });

  test("arises when the draft removes a page live changed", () => {
    const draft = edit(harbourDraft, [{ op: "deletePage", page: "pg_about" }]);
    const live = edit(harbourDraft, [
      { op: "setMeta", page: "pg_about", field: "title", value: "About us" },
    ]);
    const { conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([
      expect.objectContaining({ _tag: "Removed", block: null, removedOn: "draft" }),
    ]);
    expect(
      merge({ draft, live }, choosing(conflicts, "live")).content.pages[PageId.make("pg_about")]
        ?.meta.title,
    ).toBe("About us");
    expect(
      merge({ draft, live }, choosing(conflicts, "draft")).content.pages[PageId.make("pg_about")],
    ).toBeUndefined();
  });

  test("arises when both sides reorder the same blocks differently", () => {
    const draft = edit(harbourDraft, [move("b_gallery", null)]);
    const live = edit(harbourDraft, [move("b_hero", "b_gallery")]);
    const { conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([
      expect.objectContaining({
        _tag: "Reordered",
        section: null,
        draft: [
          { id: "b_gallery", title: "Gallery" },
          { id: "b_hero", title: "Hero" },
          { id: "b_features", title: "Features" },
        ],
      }),
    ]);
    expect(merge({ draft, live }, choosing(conflicts, "live")).content.pages[home]?.root).toEqual([
      "b_features",
      "b_gallery",
      "b_hero",
    ]);
  });

  test("arises when a page on each side takes one address, and keeping a side removes the other page", () => {
    const page = (id: string, title: string): WireOp => ({
      op: "createPage",
      page: {
        schema: "pakshi.page/1",
        id,
        type: "page",
        path: "/events",
        meta: { title, description: "" },
        root: [],
        blocks: {},
      },
    });
    const draft = edit(harbourDraft, [page("pg_draftEvents", "Events")]);
    const live = edit(harbourDraft, [page("pg_liveEvents", "What's on")]);
    const { conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([
      expect.objectContaining({
        _tag: "Address",
        path: "/events",
        draft: { id: "pg_draftEvents", title: "Events" },
        live: { id: "pg_liveEvents", title: "What's on" },
      }),
    ]);
    const pages = merge({ draft, live }, choosing(conflicts, "live")).content.pages;
    expect(PageId.make("pg_liveEvents") in pages).toBe(true);
    expect(PageId.make("pg_draftEvents") in pages).toBe(false);
  });
});

describe("blogs and their posts", () => {
  const post = (id: string, slug: string): WireOp => ({
    op: "createPage",
    page: {
      schema: "pakshi.page/1",
      id,
      type: "entry",
      kind: "blog",
      collection: "pg_news",
      slug,
      meta: {
        title: "Mentors announced",
        description: "",
        date: "2027-04-01",
        author: "Meera Kapoor",
        tags: [],
        excerpt: "",
      },
      root: [],
      blocks: {},
    },
  });
  const deleteNews: ReadonlyArray<WireOp> = [
    { op: "deletePage", page: "pg_dates" },
    { op: "deletePage", page: "pg_news" },
  ];
  const addressOf = (content: SiteContent, id: string) =>
    listingsOf(content.pages).find((page) => page.id === id)?.path;
  const blog = (id: string, path: string, shows: string): WireOp => ({
    op: "createPage",
    page: {
      schema: "pakshi.page/1",
      id,
      type: "collection",
      kind: "blog",
      path,
      meta: { title: path, description: "" },
      root: ["b_list"],
      blocks: {
        b_list: {
          type: "post-list",
          variant: "list",
          surface: "default",
          props: { heading: "Latest", collection: { $ref: "page", id: shows }, count: 6 },
        },
      },
    },
  });
  const showing = (page: string, block: string, shows: string): WireOp => ({
    op: "setProp",
    target: page,
    block,
    path: ["collection"],
    value: { $ref: "page", id: shows },
  });
  const shownBy = (content: SiteContent, page: string, block: string) =>
    content.pages[PageId.make(page)]?.blocks[BlockId.make(block)]?.props["collection"];

  test("a blog one side removed goes quietly, with its posts, when the other side left them alone", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, deleteNews);
    const { content, conflicts, changes } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(Object.keys(content.pages).toSorted()).toEqual(["pg_about", "pg_home"]);
    expect(changes.filter((change) => change._tag === "PageRemoved")).toHaveLength(2);
  });

  test("a blog list the other side points at a blog it added shows that blog", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, [
      blog("pg_stories", "/stories", "pg_stories"),
      showing("pg_news", "b_posts", "pg_stories"),
    ]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(shownBy(content, "pg_news", "b_posts")).toEqual({ $ref: "page", id: "pg_stories" });
  });

  test("blogs the other side added can list each other", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(harbourDraft, [
      blog("pg_stories", "/stories", "pg_stories"),
      blog("pg_events", "/events", "pg_stories"),
      showing("pg_stories", "b_list", "pg_events"),
    ]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(shownBy(content, "pg_stories", "b_list")).toEqual({ $ref: "page", id: "pg_events" });
    expect(shownBy(content, "pg_events", "b_list")).toEqual({ $ref: "page", id: "pg_stories" });
  });

  test("a blog removed on one side while the other adds a post is one conflict for the blog and its posts", () => {
    const draft = edit(harbourDraft, [post("pg_mentors", "mentors")]);
    const live = edit(harbourDraft, deleteNews);
    const { conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([
      expect.objectContaining({
        _tag: "Removed",
        place: { target: "pg_news", title: "News" },
        block: null,
        removedOn: "live",
      }),
    ]);
    const removed = merge({ draft, live }, choosing(conflicts, "live")).content.pages;
    expect(Object.keys(removed).toSorted()).toEqual(["pg_about", "pg_home"]);
    const kept = merge({ draft, live }, choosing(conflicts, "draft")).content.pages;
    expect(Object.keys(kept).toSorted()).toEqual([
      "pg_about",
      "pg_dates",
      "pg_home",
      "pg_mentors",
      "pg_news",
    ]);
  });

  test("a post added to a blog the other side moved lands under the blog's new address", () => {
    const draft = edit(harbourDraft, [post("pg_mentors", "mentors")]);
    const live = edit(harbourDraft, [{ op: "setPath", page: "pg_news", path: "/updates" }]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(addressOf(content, "pg_mentors")).toBe("/updates/mentors");
    expect(addressOf(content, "pg_dates")).toBe("/updates/dates");
  });

  test("posts both sides add to a blog with one slug conflict, and keeping a side removes the other's post", () => {
    const draft = edit(harbourDraft, [post("pg_draftPost", "mentors")]);
    const live = edit(harbourDraft, [post("pg_livePost", "mentors")]);
    const { conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([
      expect.objectContaining({
        _tag: "Address",
        path: "/news/mentors",
        draft: { id: "pg_draftPost", title: "Mentors announced" },
        live: { id: "pg_livePost", title: "Mentors announced" },
      }),
    ]);
    const pages = merge({ draft, live }, choosing(conflicts, "live")).content.pages;
    expect(PageId.make("pg_livePost") in pages).toBe(true);
    expect(PageId.make("pg_draftPost") in pages).toBe(false);
  });
});

describe("site-level parts", () => {
  const variant = (block: string, value: string): WireOp => ({
    op: "setVariant",
    target: "site",
    block,
    variant: value,
  });
  const surface = (block: string, value: Surface): WireOp => ({
    op: "setSurface",
    target: "site",
    block,
    surface: value,
  });

  test("merge like any block", () => {
    const draft = edit(harbourDraft, [variant("b_header", "centered")]);
    const live = edit(harbourDraft, [surface("b_footer", "inverse")]);
    const { content, conflicts, changes } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(content.parts.blocks[BlockId.make("b_header")]?.variant).toBe("centered");
    expect(content.parts.blocks[BlockId.make("b_footer")]?.surface).toBe("inverse");
    expect(changes).toEqual([
      {
        _tag: "ValueChanged",
        place: { target: "site", title: "Footer" },
        block: { id: "b_footer", title: "Footer" },
        field: "Background",
      },
    ]);
  });

  test("conflict when both sides change one of their values", () => {
    const draft = edit(harbourDraft, [surface("b_header", "brand")]);
    const live = edit(harbourDraft, [surface("b_header", "inverse")]);
    expect(merge({ draft, live }).conflicts).toEqual([
      expect.objectContaining({
        _tag: "Changed",
        place: { target: "site", title: "Header" },
        field: "Background",
        draft: "brand",
        live: "inverse",
      }),
    ]);
  });

  test("merge menus item by item", () => {
    const entry = (id: string, label: string) => ({
      id,
      label,
      target: { $ref: "page" as const, id: "pg_about" },
    });
    const withMenu = (labels: ReadonlyArray<readonly [string, string]>): Draft =>
      Schema.decodeSync(Draft)({
        ...Schema.encodeSync(Draft)(harbourDraft),
        parts: {
          ...Schema.encodeSync(Draft)(harbourDraft).parts,
          menus: { main: labels.map(([id, label]) => entry(id, label)), footer: [] },
        },
      });
    const base = withMenu([
      ["mi_about", "About"],
      ["mi_dates", "Dates"],
    ]);
    const draft = withMenu([
      ["mi_about", "About us"],
      ["mi_dates", "Dates"],
    ]);
    const live = withMenu([
      ["mi_about", "About"],
      ["mi_dates", "Dates"],
      ["mi_news", "News"],
    ]);
    const { content, conflicts } = mergeSites({ base, draft, live }, library, {});
    expect(conflicts).toEqual([]);
    expect(content.parts.menus.main.map((menuItem) => menuItem.label)).toEqual([
      "About us",
      "Dates",
      "News",
    ]);
  });
});

describe("forms, redirects and page status", () => {
  test("merge each form, redirect and page's status on its own", () => {
    const draft = edit(harbourDraft, [
      { op: "setRedirect", from: "/old-about", to: { $ref: "page", id: "pg_about" } },
      { op: "removeForm", form: "frm_visit" },
    ]);
    const live = edit(harbourDraft, [
      { op: "setRedirect", from: "/programme", to: "https://example.org/programme" },
      { op: "setStatus", page: "pg_dates", status: "unpublished" },
      {
        op: "setForm",
        form: {
          id: "frm_news",
          name: "Newsletter",
          submitLabel: "Sign up",
          fields: [{ kind: "email", id: "ff_email", label: "Email", required: true }],
        },
      },
    ]);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(content.redirects).toEqual({
      "/old-about": { $ref: "page", id: "pg_about" },
      "/programme": "https://example.org/programme",
    });
    expect(Object.keys(content.forms)).toEqual(["frm_news"]);
    expect(content.pages[PageId.make("pg_dates")]?.status).toBe("unpublished");
  });

  test("conflict when both sides send one address to different places", () => {
    const draft = edit(harbourDraft, [
      { op: "setRedirect", from: "/old", to: { $ref: "page", id: "pg_about" } },
    ]);
    const live = edit(harbourDraft, [
      { op: "setRedirect", from: "/old", to: { $ref: "page", id: "pg_dates" } },
    ]);
    expect(merge({ draft, live }).conflicts).toEqual([
      expect.objectContaining({ place: { target: "site", title: "Redirects" }, field: "/old" }),
    ]);
  });
});

describe("brand revisions", () => {
  const revision = (number: number, brandColor: `#${string}`): Draft => ({
    ...harbourDraft,
    brand: {
      ...harbourDraft.brand,
      number,
      theme: resolveTheme({ ...defaultTheme, brandColor }).theme,
    },
  });

  test("reach a draft from the live site, as a change", () => {
    const live = revision(2, "#7a1f5c");
    const { content, conflicts, changes } = merge({ draft: harbourDraft, live });
    expect(conflicts).toEqual([]);
    expect(content.brand).toEqual(live.brand);
    expect(changes).toContainEqual(
      expect.objectContaining({ _tag: "ValueChanged", place: { target: "site", title: "Brand" } }),
    );
  });

  test("never conflict: the newer revision is kept on whichever side has it", () => {
    const draft = revision(3, "#1f5c44");
    const live = revision(2, "#7a1f5c");
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(content.brand).toEqual(draft.brand);
  });
});

describe("sides on different block versions", () => {
  const onV2 = (draft: Draft): Draft => ({
    ...draft,
    lockfile: { ...draft.lockfile, hero: 2 },
    pages: Object.fromEntries(
      Object.values(draft.pages).map((page) => [
        page.id,
        {
          ...page,
          blocks: Object.fromEntries(
            Object.entries(page.blocks).map(([id, instance]) => [
              id,
              instance.type === "hero"
                ? { ...instance, props: { ...instance.props, kicker: "Summer 2027" } }
                : instance,
            ]),
          ),
        },
      ]),
    ),
  });
  const v2 = contractsAt(library, { ...harbourDraft.lockfile, hero: 2 });

  test("merge after moving both to the newer version", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(onV2(harbourDraft), [setProp("b_hero", ["kicker"], "July 2027")], v2);
    const { content, conflicts } = merge({ draft, live });
    expect(conflicts).toEqual([]);
    expect(content.lockfile["hero"]).toBe(2);
    expect(block(content, "b_hero")?.props).toMatchObject({
      heading: "Build a boat",
      kicker: "July 2027",
    });
  });

  test("still conflict where both changed the same field", () => {
    const draft = edit(harbourDraft, [heading("Build a boat")]);
    const live = edit(onV2(harbourDraft), [heading("Sail a boat")], v2);
    expect(merge({ draft, live }).conflicts).toEqual([
      expect.objectContaining({
        _tag: "Changed",
        field: "Heading",
        draft: "Build a boat",
        live: "Sail a boat",
      }),
    ]);
  });
});

/** The released block versions, up to hero v3. */
const released = await loadBlockVersions([harbourDraft.lockfile, { hero: 3 }]);

describe("upgrading blocks", () => {
  const heroOf = (content: SiteContent) => block(content, "b_hero");
  const heroV3 = (content: SiteContent) => {
    const contract = contractsAt(released, content.lockfile).get("hero");
    if (contract === undefined) throw new Error("The upgrade pins hero v3.");
    return contract;
  };

  test("from hero v1 to v3 migrates its content through v2 and v3", () => {
    const upgraded = migrateContent(released, harbourDraft, { hero: 3 });
    expect(upgraded.lockfile["hero"]).toBe(3);
    // v2 made the button the first of the buttons, which v3 keeps.
    expect(heroOf(upgraded)?.props).toEqual({
      heading: "Learn by building",
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Five days of workshops." }] },
        ],
      },
      actions: [
        { id: "it_primary", button: { label: "Register", link: "https://example.org/register" } },
      ],
    });
    expect(
      Schema.is(propsSchema(heroV3(upgraded).fields, "complete"))(heroOf(upgraded)?.props),
    ).toBe(true);
  });

  test("leaves the other blocks at their versions", () => {
    const upgraded = migrateContent(released, harbourDraft, { hero: 3 });
    expect({ ...upgraded.lockfile, hero: 1 }).toEqual(harbourDraft.lockfile);
    expect(block(upgraded, "b_features")).toEqual(block(harbourDraft, "b_features"));
  });

  test("keeps all of a hero's text, however long, valid at the new version", () => {
    const paragraph = (text: string) => ({
      type: "paragraph",
      content: [{ type: "text", text, marks: [{ type: "bold" }] }],
    });
    const body = {
      type: "doc",
      content: Array.from({ length: 12 }, (_, index) =>
        paragraph(`Day ${index + 1}. ${"Build. ".repeat(20)}`),
      ),
    };
    const long = edit(harbourDraft, [setProp("b_hero", ["body"], body)]);
    const upgraded = migrateContent(released, long, { hero: 3 });
    const props = heroOf(upgraded)?.props;
    expect(props?.["body"]).toEqual(body);
    expect(Schema.is(propsSchema(heroV3(upgraded).fields, "draft"))(props)).toBe(true);
  });
});
