import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { PageDocument } from "../src/page.ts";

const page = {
  schema: "pakshi.page/1",
  id: "pg_01J9ZK4Q2M",
  type: "page",
  path: "/summer-school",
  meta: { title: "Summer School 2027", description: "Five days of hands-on workshops." },
  root: ["b_hero1", "b_feat1"],
  blocks: {
    b_hero1: {
      type: "hero",
      variant: "split-image",
      surface: "brand",
      props: { heading: "Learn by building", image: { $ref: "media", id: "med_7X4P" } },
    },
    b_feat1: {
      type: "feature-grid",
      variant: "icons-3up",
      surface: "default",
      props: { heading: "What you'll do" },
      slots: { items: ["b_fi1", "b_fi2"] },
    },
    b_fi1: { type: "feature-item", variant: "default", props: { title: "Workshops" } },
    b_fi2: { type: "feature-item", variant: "default", props: { title: "Mentors" } },
  },
};

const issues = (input: typeof PageDocument.Encoded | Record<string, Schema.Json>) => {
  const result = Schema.decodeUnknownExit(PageDocument)(input, { errors: "all" });
  return result._tag === "Success" ? "" : String(result.cause);
};

test("a page of sections and items decodes", () => {
  expect(issues(page)).toBe("");
});

test("a post carries its date, author, tags and excerpt", () => {
  const post = {
    ...page,
    type: "post",
    path: "/news/opening-day",
    meta: {
      title: "Opening day",
      description: "The doors open.",
      date: "2027-01-12",
      author: "Sam Okafor",
      tags: ["news"],
      excerpt: "We open on Monday.",
    },
  };
  expect(issues(post)).toBe("");
  expect(issues({ ...post, meta: page.meta })).not.toBe("");
});

describe("document integrity", () => {
  test("a listed block must exist", () => {
    expect(issues({ ...page, root: [...page.root, "b_missing"] })).toContain(
      "b_missing is not in blocks",
    );
  });

  test("a block can't be placed twice", () => {
    expect(issues({ ...page, root: ["b_hero1", "b_feat1", "b_hero1"] })).toContain(
      "b_hero1 is placed more than once",
    );
    const inSlot = {
      ...page,
      blocks: {
        ...page.blocks,
        b_feat1: { ...page.blocks.b_feat1, slots: { items: ["b_fi1", "b_fi1"] } },
      },
      root: ["b_hero1", "b_feat1"],
    };
    expect(issues(inSlot)).toContain("b_fi1 is placed more than once");
  });

  test("every block must be placed", () => {
    expect(issues({ ...page, root: ["b_hero1"] })).toContain("b_feat1 is not placed on the page");
  });

  test("nesting stops at sections and their items", () => {
    const nested = {
      ...page,
      blocks: {
        ...page.blocks,
        b_fi1: { ...page.blocks.b_fi1, slots: { items: ["b_fi2"] } },
        b_feat1: { ...page.blocks.b_feat1, slots: { items: ["b_fi1"] } },
      },
    };
    expect(issues(nested)).toContain("b_fi1 is an item, so it has no slots or surface");
  });

  test("sections carry a surface", () => {
    const { surface: _surface, ...hero } = page.blocks.b_hero1;
    expect(issues({ ...page, blocks: { ...page.blocks, b_hero1: hero } })).toContain(
      "A section needs a surface",
    );
  });
});

test("addresses are lowercase paths", () => {
  for (const path of ["/", "/about", "/summer-school/2027"]) {
    expect(issues({ ...page, path })).toBe("");
  }
  for (const path of ["", "about", "/About", "/trailing/", "/two--dashes", "/a b"]) {
    expect(issues({ ...page, path })).not.toBe("");
  }
});
