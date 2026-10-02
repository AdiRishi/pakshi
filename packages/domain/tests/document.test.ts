import { placeholderTree } from "@repo/blocks";
import { propsSchema } from "@repo/blocks/fields";
import { FormDefinition } from "@repo/contracts/form";
import { BlockId, FormId, PageId } from "@repo/contracts/ids";
import { BatchError, Op } from "@repo/contracts/ops";
import { PageDocument } from "@repo/contracts/page";
import { listingsOf } from "@repo/contracts/snapshot";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { applyOps, menusWithout } from "../src/document.ts";
import { contracts, harbourDraft } from "./support/draft.ts";

/** An op as it arrives over the wire, before decoding brands its IDs. */
type WireOp = typeof Op.Encoded;

const decodeOps = (ops: ReadonlyArray<WireOp>) => ops.map((op) => Schema.decodeSync(Op)(op));

const apply = (...ops: ReadonlyArray<WireOp>) => applyOps(harbourDraft, decodeOps(ops), contracts);

const applied = (...ops: ReadonlyArray<WireOp>) => {
  const result = apply(...ops);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result;
};

const rejection = (...ops: ReadonlyArray<WireOp>) => {
  const result = apply(...ops);
  if (result.ok) throw new Error("The batch was accepted.");
  return result.errors;
};

const home = (draft = harbourDraft) => {
  const page = draft.pages[PageId.make("pg_home")];
  if (page?.type !== "page") throw new Error("The draft has no home page.");
  return page;
};

const block = (draft: typeof harbourDraft, id: string) => home(draft).blocks[BlockId.make(id)];

const item = (id: string, title: string) => ({
  id: `b_${id}` as const,
  type: "feature-item",
  variant: "default",
  props: { title, body: "Every day." },
});

const visitForm = () => {
  const form = harbourDraft.forms[FormId.make("frm_visit")];
  if (form === undefined) throw new Error("The draft has a visit form.");
  return Schema.encodeSync(FormDefinition)(form);
};

const post = (id: string, slug: string, collection = "pg_news"): WireOp => ({
  op: "createPage",
  page: {
    schema: "pakshi.page/1",
    id,
    type: "entry",
    kind: "blog",
    collection,
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

const insertMore: WireOp = {
  op: "insertBlock",
  page: "pg_home",
  list: "root",
  after: "b_hero",
  block: {
    id: "b_more",
    type: "feature-grid",
    variant: "two-columns",
    surface: "muted",
    props: { heading: "More" },
    slots: { items: [item("lunch", "Lunch")] },
  },
};

// Every kind of op, each accepted on the Harbour draft.
const batches: ReadonlyArray<readonly [string, ReadonlyArray<WireOp>]> = [
  [
    "set a field",
    [{ op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: "Build" }],
  ],
  [
    "remove an optional field",
    [{ op: "setProp", target: "pg_home", block: "b_hero", path: ["cta"] }],
  ],
  [
    "set a button's label",
    [
      {
        op: "setProp",
        target: "pg_home",
        block: "b_hero",
        path: ["cta", "label"],
        value: "Sign up",
      },
    ],
  ],
  [
    "set alt text on a list item's image",
    [
      {
        op: "setProp",
        target: "pg_home",
        block: "b_gallery",
        path: ["images", "it_quay", "image", "alt"],
        value: "The quay at dawn",
      },
    ],
  ],
  [
    "remove a list item's caption",
    [
      {
        op: "setProp",
        target: "pg_home",
        block: "b_gallery",
        path: ["images", "it_quay", "caption"],
      },
    ],
  ],
  [
    "set a field on the site header",
    [
      {
        op: "setProp",
        target: "site",
        block: "b_header",
        path: ["cta"],
        value: { label: "Register", link: "https://example.org" },
      },
    ],
  ],
  [
    "change a variant",
    [{ op: "setVariant", target: "pg_home", block: "b_hero", variant: "split-image" }],
  ],
  [
    "change a surface",
    [{ op: "setSurface", target: "site", block: "b_footer", surface: "inverse" }],
  ],
  ["insert a section with items", [insertMore]],
  [
    "insert an item first in a slot",
    [
      {
        op: "insertBlock",
        page: "pg_home",
        list: { block: "b_features", slot: "items" },
        after: null,
        block: item("lunch", "Lunch"),
      },
    ],
  ],
  [
    "move a section",
    [{ op: "moveBlock", page: "pg_home", block: "b_gallery", list: "root", after: null }],
  ],
  [
    "move an item to the front of its section",
    [
      {
        op: "moveBlock",
        page: "pg_home",
        block: "b_mentors",
        list: { block: "b_features", slot: "items" },
        after: null,
      },
    ],
  ],
  [
    "remove a section with its items",
    [{ op: "removeBlock", page: "pg_home", block: "b_features" }],
  ],
  ["set a page's title", [{ op: "setMeta", page: "pg_home", field: "title", value: "Harbour" }]],
  [
    "set a post's tags",
    [{ op: "setMeta", page: "pg_dates", field: "tags", value: ["dates", "july"] }],
  ],
  ["change a page's address", [{ op: "setPath", page: "pg_about", path: "/who-we-are" }]],
  ["move a blog with its posts", [{ op: "setPath", page: "pg_news", path: "/updates" }]],
  ["change a post's slug", [{ op: "setSlug", page: "pg_dates", slug: "dates-out" }]],
  ["create a post in a blog", [post("pg_mentors", "mentors")]],
  [
    "delete a blog after its posts",
    [
      { op: "deletePage", page: "pg_dates" },
      { op: "deletePage", page: "pg_news" },
    ],
  ],
  [
    "create a page",
    [
      {
        op: "createPage",
        page: {
          schema: "pakshi.page/1",
          id: "pg_visit",
          type: "page",
          path: "/visit",
          meta: { title: "", description: "" },
          root: [],
          blocks: {},
        },
      },
    ],
  ],
  ["delete a page", [{ op: "deletePage", page: "pg_about" }]],
  ["unpublish a page", [{ op: "setStatus", page: "pg_about", status: "unpublished" }]],
  [
    "set a page's sharing image",
    [
      {
        op: "setMeta",
        page: "pg_home",
        field: "image",
        value: { $ref: "media", id: "med_harbour", alt: "Boats" },
      },
    ],
  ],
  [
    "add a form",
    [
      {
        op: "setForm",
        form: {
          id: "frm_news",
          name: "Newsletter",
          submitLabel: "Sign up",
          fields: [{ kind: "email", id: "ff_email", label: "Email", required: true }],
        },
      },
    ],
  ],
  ["change a form", [{ op: "setForm", form: { ...visitForm(), name: "Book a visit" } }]],
  ["remove a form no block uses", [{ op: "removeForm", form: "frm_visit" }]],
  [
    "replace the main menu",
    [
      {
        op: "setMenu",
        menu: "main",
        items: [{ id: "mi_about", label: "About", target: { $ref: "page", id: "pg_about" } }],
      },
    ],
  ],
  [
    "add a redirect",
    [{ op: "setRedirect", from: "/old-about", to: { $ref: "page", id: "pg_about" } }],
  ],
];

describe("every op's inverse restores the draft exactly", () => {
  test.each(batches)("%s", (_name, ops) => {
    const { draft, inverse } = applied(...ops);
    expect(draft).not.toEqual(harbourDraft);
    const undone = applyOps(draft, inverse, contracts);
    expect(undone.ok && undone.draft).toEqual(harbourDraft);
  });
});

describe("applying ops", () => {
  const addable = Array.from(contracts.values()).filter(
    (contract) => contract.placement === "section" || contract.placement === "item",
  );
  test.each(addable.map((contract) => [contract.type, contract] as const))(
    "a new %s with its placeholder content can be inserted, and is complete",
    (type, contract) => {
      const tree = placeholderTree(contracts, type);
      const host = Object.entries(home().blocks).flatMap(([id, placed]) => {
        const hostContract = contracts.get(placed.type);
        return hostContract?.placement === "section"
          ? Object.entries(hostContract.slots)
              .filter(([, spec]) => spec.accepts.includes(type))
              .map(([slot]) => ({ block: BlockId.make(id), slot }))
          : [];
      })[0];
      const list = contract.placement === "section" ? ("root" as const) : host;
      if (list === undefined) throw new Error(`No section on the home page can hold a ${type}.`);
      const result = applyOps(
        harbourDraft,
        [{ op: "insertBlock", page: PageId.make("pg_home"), list, after: null, block: tree }],
        contracts,
      );
      expect(result.ok ? [] : result.errors).toEqual([]);
      for (const placed of [tree, ...Object.values(tree.slots ?? {}).flat()]) {
        const placedContract = contracts.get(placed.type);
        if (placedContract === undefined) throw new Error(`No contract for ${placed.type}.`);
        expect(Schema.is(propsSchema(placedContract.fields, "complete"))(placed.props)).toBe(true);
      }
    },
  );

  test("a required heading can be cleared and typed again", () => {
    const cleared = applied({
      op: "setProp",
      target: "pg_home",
      block: "b_hero",
      path: ["heading"],
      value: "",
    });
    expect(block(cleared.draft, "b_hero")?.props["heading"]).toBe("");
    const retyped = applyOps(
      cleared.draft,
      decodeOps([
        { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: "L" },
      ]),
      contracts,
    );
    expect(retyped.ok).toBe(true);
  });

  test("an inserted section lands after the named block, with its items in its slot", () => {
    const { draft } = applied(insertMore);
    expect(home(draft).root).toEqual(["b_hero", "b_more", "b_features", "b_gallery"]);
    expect(block(draft, "b_more")?.slots).toEqual({ items: ["b_lunch"] });
    expect(block(draft, "b_lunch")?.props["title"]).toBe("Lunch");
  });

  test("moving an item between sections takes it out of the first", () => {
    const { draft } = applied(
      {
        op: "insertBlock",
        page: "pg_home",
        list: "root",
        after: null,
        block: {
          id: "b_more",
          type: "feature-grid",
          variant: "two-columns",
          surface: "muted",
          props: { heading: "More" },
        },
      },
      {
        op: "moveBlock",
        page: "pg_home",
        block: "b_mentors",
        list: { block: "b_more", slot: "items" },
        after: null,
      },
    );
    expect(block(draft, "b_features")?.slots).toEqual({ items: ["b_workshops"] });
    expect(block(draft, "b_more")?.slots).toEqual({ items: ["b_mentors"] });
  });

  test("removing a section removes its items", () => {
    const { draft } = applied({ op: "removeBlock", page: "pg_home", block: "b_features" });
    expect(Object.keys(home(draft).blocks).toSorted()).toEqual(["b_gallery", "b_hero"]);
  });

  test("a batch with one op that breaks a rule is refused, naming that op", () => {
    const errors = rejection(
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: "Build" },
      { op: "setProp", target: "pg_home", block: "b_nope", path: ["heading"], value: "Build" },
    );
    expect(errors).toEqual([expect.objectContaining({ op: 1, rule: "unknown-block" })]);
  });

  test("a batch can swap two pages' addresses", () => {
    const { draft } = applied(
      { op: "setPath", page: "pg_about", path: "/news" },
      { op: "setPath", page: "pg_news", path: "/about" },
    );
    expect(draft.pages[PageId.make("pg_about")]).toMatchObject({ path: "/news" });
    expect(draft.pages[PageId.make("pg_news")]).toMatchObject({ path: "/about" });
  });

  test("a blog's posts move with it", () => {
    const { draft } = applied({ op: "setPath", page: "pg_news", path: "/updates" });
    expect(listingsOf(draft.pages).find((page) => page.id === "pg_dates")?.path).toBe(
      "/updates/dates",
    );
  });

  test("a blog can't move where one of its posts would take another page's address", () => {
    const errors = rejection(
      {
        op: "createPage",
        page: {
          schema: "pakshi.page/1",
          id: "pg_updates",
          type: "page",
          path: "/updates/dates",
          meta: { title: "Key dates", description: "" },
          root: [],
          blocks: {},
        },
      },
      { op: "setPath", page: "pg_news", path: "/updates" },
    );
    expect(errors).toEqual([expect.objectContaining({ op: 1, rule: "path-taken" })]);
  });

  test("errors are structured, with the op, where in it, the rule and a message", () => {
    const [error] = rejection({
      op: "setProp",
      target: "pg_home",
      block: "b_hero",
      path: ["heading"],
      value: "x".repeat(81),
    });
    expect(Schema.is(BatchError)(error)).toBe(true);
    expect(error).toMatchObject({ op: 0, path: ["heading"], rule: "value" });
    expect(error?.message).toBe("Use at most 80 characters");
  });
});

describe("each rule rejects the ops that break it", () => {
  const cases: ReadonlyArray<readonly [string, WireOp, BatchError["rule"]]> = [
    [
      "a page that doesn't exist",
      { op: "setMeta", page: "pg_nope", field: "title", value: "Hi" },
      "unknown-page",
    ],
    [
      "a page ID that's taken",
      {
        op: "createPage",
        page: Schema.encodeSync(PageDocument)({ ...home(), path: "/elsewhere" }),
      },
      "page-exists",
    ],
    ["an address that's taken", { op: "setPath", page: "pg_about", path: "/" }, "path-taken"],
    ["a post's slug that's taken in its blog", post("pg_again", "dates"), "path-taken"],
    ["a post in a page that isn't a blog", post("pg_mentors", "mentors", "pg_about"), "page"],
    ["a post in a blog that doesn't exist", post("pg_mentors", "mentors", "pg_nope"), "page"],
    ["an address set on a post", { op: "setPath", page: "pg_dates", path: "/dates" }, "page"],
    ["a slug on a page outside a blog", { op: "setSlug", page: "pg_about", slug: "us" }, "page"],
    ["a blog that still holds posts", { op: "deletePage", page: "pg_news" }, "in-use"],
    [
      "a new page at an address that's taken",
      { op: "createPage", page: { ...Schema.encodeSync(PageDocument)(home()), id: "pg_again" } },
      "path-taken",
    ],
    [
      "a block that doesn't exist",
      { op: "removeBlock", page: "pg_home", block: "b_nope" },
      "unknown-block",
    ],
    ["a form that doesn't exist", { op: "removeForm", form: "frm_nope" }, "unknown-form"],
    [
      "a block ID that's taken",
      {
        op: "insertBlock",
        page: "pg_home",
        list: { block: "b_features", slot: "items" },
        after: null,
        block: item("mentors", "Again"),
      },
      "block-exists",
    ],
    [
      "a slot the section doesn't have",
      {
        op: "insertBlock",
        page: "pg_home",
        list: { block: "b_features", slot: "cards" },
        after: null,
        block: item("lunch", "Lunch"),
      },
      "unknown-list",
    ],
    [
      "an `after` that isn't in the list",
      { op: "moveBlock", page: "pg_home", block: "b_gallery", list: "root", after: "b_workshops" },
      "unknown-list",
    ],
    [
      "a block type the lockfile doesn't pin",
      {
        op: "insertBlock",
        page: "pg_home",
        list: "root",
        after: null,
        block: { id: "b_map", type: "map", variant: "default", surface: "default", props: {} },
      },
      "block-type",
    ],
    [
      "an item at the top of a page",
      {
        op: "insertBlock",
        page: "pg_home",
        list: "root",
        after: null,
        block: item("lunch", "Lunch"),
      },
      "placement",
    ],
    [
      "a section in a slot",
      {
        op: "moveBlock",
        page: "pg_home",
        block: "b_gallery",
        list: { block: "b_features", slot: "items" },
        after: null,
      },
      "placement",
    ],
    [
      "a header on a page",
      {
        op: "insertBlock",
        page: "pg_home",
        list: "root",
        after: null,
        block: { id: "b_top", type: "header", variant: "simple", surface: "default", props: {} },
      },
      "placement",
    ],
    [
      "a variant the block doesn't have",
      { op: "setVariant", target: "pg_home", block: "b_hero", variant: "sideways" },
      "variant",
    ],
    [
      "a surface on an item",
      { op: "setSurface", target: "pg_home", block: "b_mentors", surface: "brand" },
      "surface",
    ],
    [
      "a section without a surface",
      {
        op: "insertBlock",
        page: "pg_home",
        list: "root",
        after: null,
        block: {
          id: "b_more",
          type: "feature-grid",
          variant: "two-columns",
          props: { heading: "More" },
        },
      },
      "surface",
    ],
    [
      "a field the block doesn't have",
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["subtitle"], value: "Hi" },
      "field",
    ],
    [
      "a path into plain text",
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading", "x"], value: "Hi" },
      "field",
    ],
    [
      "a list item that doesn't exist",
      {
        op: "setProp",
        target: "pg_home",
        block: "b_gallery",
        path: ["images", "it_nope", "caption"],
        value: "Hi",
      },
      "unknown-item",
    ],
    [
      "a line break in single-line text",
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: "Two\nlines" },
      "value",
    ],
    [
      "a required field removed",
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"] },
      "value",
    ],
    [
      "a link with an unsafe protocol",
      {
        op: "setProp",
        target: "pg_home",
        block: "b_hero",
        path: ["cta", "link"],
        value: "javascript:alert(1)",
      },
      "value",
    ],
    [
      "a mark the rich text field doesn't allow",
      {
        op: "setProp",
        target: "pg_home",
        block: "b_hero",
        path: ["body"],
        value: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] },
          ],
        },
      },
      "value",
    ],
    [
      "new props over their limits",
      {
        op: "insertBlock",
        page: "pg_home",
        list: { block: "b_features", slot: "items" },
        after: null,
        block: { ...item("lunch", "x".repeat(61)) },
      },
      "value",
    ],
    [
      "a post-only field on a page",
      { op: "setMeta", page: "pg_home", field: "tags", value: ["x"] },
      "meta",
    ],
    [
      "a description over its limit",
      { op: "setMeta", page: "pg_home", field: "description", value: "x".repeat(161) },
      "meta",
    ],
  ];

  test.each(cases)("%s", (_name, op, rule) => {
    expect(rejection(op)).toEqual(expect.arrayContaining([expect.objectContaining({ rule })]));
  });
});

test("a form can't be removed while a block uses it", () => {
  const errors = rejection(
    {
      op: "insertBlock",
      page: "pg_home",
      list: "root",
      after: null,
      block: {
        id: "b_visit",
        type: "form-section",
        variant: "card",
        surface: "default",
        props: { heading: "Plan a visit", form: { $ref: "form", id: "frm_visit" } },
      },
    },
    { op: "removeForm", form: "frm_visit" },
  );
  expect(errors).toEqual([expect.objectContaining({ op: 1, rule: "in-use" })]);
});

test("a new page with blocks in no list is refused, even when it was never decoded", () => {
  const result = applyOps(
    harbourDraft,
    [
      {
        op: "createPage",
        page: {
          ...home(),
          id: PageId.make("pg_again"),
          path: "/again",
          root: [BlockId.make("b_hero")],
        },
      },
    ],
    contracts,
  );
  expect(result.ok ? [] : result.errors).toEqual(
    expect.arrayContaining([expect.objectContaining({ rule: "page" })]),
  );
});

test("taking a page out of the menus removes its items and their sub-items, and nothing else", () => {
  const draft = applied({
    op: "setMenu",
    menu: "main",
    items: [
      {
        id: "mi_about",
        label: "About",
        target: { $ref: "page", id: "pg_about" },
        children: [{ id: "mi_dates", label: "Dates", target: { $ref: "page", id: "pg_dates" } }],
      },
      {
        id: "mi_home",
        label: "Home",
        target: { $ref: "page", id: "pg_home" },
        children: [{ id: "mi_more", label: "More", target: { $ref: "page", id: "pg_about" } }],
      },
    ],
  }).draft;
  const menus = draft.parts.menus;
  const result = applyOps(draft, menusWithout(menus, PageId.make("pg_about")), contracts);
  expect(result.ok && result.draft.parts.menus.main).toEqual([
    { id: "mi_home", label: "Home", target: { $ref: "page", id: "pg_home" }, children: [] },
  ]);
  expect(menusWithout(menus, PageId.make("pg_dates")).map((op) => op.op)).toEqual(["setMenu"]);
});
