import type { Draft } from "@repo/contracts/draft";
import { BlockId, PageId } from "@repo/contracts/ids";
import { Batch, type Op } from "@repo/contracts/ops";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { type Checks, commitBatch, type Writes } from "../src/commit.ts";
import { contracts, harbourDraft } from "./support/draft.ts";

type WireOp = typeof Op.Encoded;

const meera = "user_meera";
const sam = "user_sam";

/** A draft several people edit, one committed batch at a time. */
const session = () => {
  let draft: Draft = harbourDraft;
  let writes: Writes = new Map();
  let batches = 0;
  const commit = (
    actor: string,
    ops: ReadonlyArray<WireOp>,
    undo = false,
    checks: Checks = "draft",
  ) => {
    batches += 1;
    const batch = Schema.decodeSync(Batch)({ id: `bat_${batches}`, ops, undo });
    const result = commitBatch(draft, writes, actor, batch, contracts, checks);
    if (result.ok) {
      draft = result.draft;
      writes = result.writes;
    }
    return result;
  };
  const committed = (actor: string, ops: ReadonlyArray<WireOp>, undo = false) => {
    const result = commit(actor, ops, undo);
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result;
  };
  return { commit, committed, draft: () => draft };
};

const home = PageId.make("pg_home");

const blockOf = (draft: Draft, id: string) => draft.pages[home]?.blocks[BlockId.make(id)];

const setHeading = (value: string): WireOp => ({
  op: "setProp",
  target: "pg_home",
  block: "b_hero",
  path: ["heading"],
  value,
});

const setWorkshopsTitle = (value: string): WireOp => ({
  op: "setProp",
  target: "pg_home",
  block: "b_workshops",
  path: ["title"],
  value,
});

const insertQuote: WireOp = {
  op: "insertBlock",
  page: "pg_home",
  list: "root",
  after: "b_hero",
  block: {
    id: "b_quote",
    type: "feature-grid",
    variant: "three-columns",
    surface: "default",
    props: { heading: "Kind words" },
    slots: {
      items: [
        {
          id: "b_quote1",
          type: "feature-item",
          variant: "default",
          props: { title: "Great", body: "Loved it." },
        },
      ],
    },
  },
};

describe("a batch", () => {
  test("takes the draft to its next revision", () => {
    const { committed } = session();
    const result = committed(meera, [setHeading("Sail with us")]);
    expect(result.draft.revision).toBe(1);
    expect(blockOf(result.draft, "b_hero")?.props["heading"]).toBe("Sail with us");
  });

  test("that breaks a rule changes nothing and says why", () => {
    const { commit, draft } = session();
    const result = commit(meera, [setHeading("x".repeat(81))]);
    expect(result).toEqual({
      ok: false,
      errors: [expect.objectContaining({ op: 0, rule: "value", path: ["heading"] })],
    });
    expect(draft().revision).toBe(0);
  });

  test("names the person whose write to the same field it replaced", () => {
    const { committed } = session();
    committed(meera, [setHeading("Sail with us")]);
    expect(
      committed(sam, [setWorkshopsTitle("Classes"), setHeading("Row with us")]).replaced,
    ).toEqual([{ actor: meera, op: 1 }]);
  });

  test("replacing your own write, or writing a different field, replaces no one", () => {
    const { committed } = session();
    committed(meera, [setHeading("Sail with us")]);
    expect(committed(meera, [setHeading("Row with us")]).replaced).toEqual([]);
    expect(committed(sam, [setWorkshopsTitle("Classes")]).replaced).toEqual([]);
  });

  test("replacing a whole value replaces the writes to its parts", () => {
    const { committed } = session();
    committed(meera, [
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["cta", "label"], value: "Join" },
    ]);
    const result = committed(sam, [
      {
        op: "setProp",
        target: "pg_home",
        block: "b_hero",
        path: ["cta"],
        value: { label: "Sign up", link: "https://example.org/sign-up" },
      },
    ]);
    expect(result.replaced).toEqual([{ actor: meera, op: 0 }]);
  });
});

describe("a batch held to completeness", () => {
  test("may not clear a required field, though a person's batch may", () => {
    const { commit } = session();
    expect(commit(meera, [setHeading("")], false, "complete")).toEqual({
      ok: false,
      errors: [expect.objectContaining({ op: 0, rule: "incomplete", path: ["b_hero", "heading"] })],
    });
    expect(commit(meera, [setHeading("")]).ok).toBe(true);
  });

  test("may not insert a block with a required field too short", () => {
    const { commit } = session();
    const withShortHeading = {
      ...insertQuote,
      block: { ...insertQuote.block, props: { heading: "" } },
    };
    expect(commit(meera, [withShortHeading], false, "complete")).toEqual({
      ok: false,
      errors: [
        expect.objectContaining({ op: 0, rule: "incomplete", path: ["b_quote", "heading"] }),
      ],
    });
  });

  test("isn't refused for a field it didn't write that someone left incomplete", () => {
    const { commit, committed } = session();
    committed(sam, [setHeading("")]);
    const result = commit(
      meera,
      [
        {
          op: "setProp",
          target: "pg_home",
          block: "b_hero",
          path: ["cta", "label"],
          value: "Join",
        },
      ],
      false,
      "complete",
    );
    expect(result.ok).toBe(true);
  });

  test("may not empty a page's title", () => {
    const { commit } = session();
    expect(
      commit(
        meera,
        [{ op: "setMeta", page: "pg_home", field: "title", value: " " }],
        false,
        "complete",
      ),
    ).toEqual({
      ok: false,
      errors: [expect.objectContaining({ rule: "incomplete", path: ["title"] })],
    });
  });
});

describe("an undo batch", () => {
  test("reverses a write that is still the actor's own", () => {
    const { committed } = session();
    const first = committed(meera, [setHeading("Sail with us")]);
    const undone = committed(meera, first.inverse, true);
    expect(undone.skipped).toEqual([]);
    expect(blockOf(undone.draft, "b_hero")?.props["heading"]).toBe("Learn by building");
  });

  test("passes over a field someone else changed since, and still reverses the rest", () => {
    const { committed } = session();
    const first = committed(meera, [setHeading("Sail with us"), setWorkshopsTitle("Classes")]);
    committed(sam, [setHeading("Row with us")]);
    const undone = committed(meera, first.inverse, true);
    // The inverse lists the ops in reverse: the title first, then the heading.
    expect(undone.skipped).toEqual([1]);
    expect(blockOf(undone.draft, "b_hero")?.props["heading"]).toBe("Row with us");
    expect(blockOf(undone.draft, "b_workshops")?.props["title"]).toBe("Workshops");
  });

  test("of an insert leaves the block when someone else has changed anything in it", () => {
    const { committed } = session();
    const inserted = committed(meera, [insertQuote]);
    committed(meera, [
      { op: "setProp", target: "pg_home", block: "b_quote", path: ["heading"], value: "Praise" },
    ]);
    committed(sam, [
      { op: "setProp", target: "pg_home", block: "b_quote1", path: ["title"], value: "Superb" },
    ]);
    const undone = committed(meera, inserted.inverse, true);
    expect(undone.skipped).toEqual([0]);
    expect(blockOf(undone.draft, "b_quote1")?.props["title"]).toBe("Superb");
  });

  test("of an insert removes the block when only the actor has changed it", () => {
    const { committed } = session();
    const inserted = committed(meera, [insertQuote]);
    committed(meera, [
      { op: "setProp", target: "pg_home", block: "b_quote1", path: ["title"], value: "Superb" },
    ]);
    const undone = committed(meera, inserted.inverse, true);
    expect(undone.skipped).toEqual([]);
    expect(blockOf(undone.draft, "b_quote")).toBeUndefined();
  });

  test("passes over an op on a block someone removed", () => {
    const { committed } = session();
    const first = committed(meera, [setWorkshopsTitle("Classes")]);
    committed(sam, [{ op: "removeBlock", page: "pg_home", block: "b_features" }]);
    const undone = committed(meera, first.inverse, true);
    expect(undone.skipped).toEqual([0]);
    expect(undone.ops).toEqual([]);
  });

  test("passes over a move once someone else has moved the block again", () => {
    const { committed } = session();
    const moved = committed(meera, [
      { op: "moveBlock", page: "pg_home", block: "b_gallery", list: "root", after: null },
    ]);
    committed(sam, [
      { op: "moveBlock", page: "pg_home", block: "b_gallery", list: "root", after: "b_hero" },
    ]);
    const undone = committed(meera, moved.inverse, true);
    expect(undone.skipped).toEqual([0]);
    expect(undone.draft.pages[home]?.root).toEqual(["b_hero", "b_gallery", "b_features"]);
  });

  test("of a part passes over it once someone else has replaced the whole value", () => {
    const { committed } = session();
    const label = committed(meera, [
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["cta", "label"], value: "Join" },
    ]);
    committed(sam, [{ op: "setProp", target: "pg_home", block: "b_hero", path: ["cta"] }]);
    expect(committed(meera, label.inverse, true).skipped).toEqual([0]);
  });
});
