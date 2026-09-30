import type { Draft } from "@repo/contracts/draft";
import { Op } from "@repo/contracts/ops";
import { SnapshotManifest } from "@repo/contracts/snapshot";
import { Schema } from "effect";
import { describe, expect, test } from "vitest";

import { applyOps } from "../src/document.ts";
import { freeze } from "../src/freeze.ts";
import { contracts, harbourDraft } from "./support/draft.ts";

const edit = (draft: Draft, ops: ReadonlyArray<typeof Op.Encoded>) => {
  const applied = applyOps(draft, Schema.decodeSync(Schema.Array(Op))(ops), contracts);
  if (!applied.ok) throw new Error(JSON.stringify(applied.errors));
  return applied.draft;
};

/** The harbour draft with its one incomplete field filled in: alt text for the quay photo. */
const complete = edit(harbourDraft, [
  {
    op: "setProp",
    target: "pg_home",
    block: "b_gallery",
    path: ["images", "it_quay", "image", "alt"],
    value: "The quay at dawn",
  },
]);

const nothingLive: Pick<SnapshotManifest, "pages" | "gone"> = { pages: [], gone: [] };

describe("freezing", () => {
  test("lists every incomplete field, naming list items by ID", () => {
    const draft = edit(harbourDraft, [
      { op: "setProp", target: "pg_home", block: "b_hero", path: ["heading"], value: "" },
    ]);
    const result = freeze(draft, contracts, nothingLive);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.incomplete).toEqual([
      expect.objectContaining({
        place: { target: "pg_home", title: "Harbour Summer School" },
        block: { id: "b_hero", title: "Hero" },
        path: ["heading"],
        field: "Heading",
      }),
      expect.objectContaining({
        block: { id: "b_gallery", title: "Gallery" },
        path: ["images", "it_quay", "image", "alt"],
      }),
    ]);
  });

  test("leaves unpublished pages out, and their addresses answer gone", () => {
    const unpublished: Draft = {
      ...complete,
      pages: Object.fromEntries(
        Object.values(complete.pages).map((page) => [
          page.id,
          page.id === "pg_about" ? { ...page, status: "unpublished" } : page,
        ]),
      ),
    };
    const previous = Schema.decodeSync(
      Schema.Struct({ pages: SnapshotManifest.fields.pages, gone: SnapshotManifest.fields.gone }),
    )({
      pages: [
        {
          id: "pg_about",
          path: "/about",
          type: "page",
          meta: { title: "About", description: "" },
          object: "a".repeat(64),
        },
      ],
      gone: ["/old-programme"],
    });
    const result = freeze(unpublished, contracts, previous);
    if (!result.ok) throw new Error(JSON.stringify(result.incomplete));
    expect(result.frozen.pages.map((page) => page.id).toSorted()).toEqual(["pg_dates", "pg_home"]);
    expect(result.frozen.gone.toSorted()).toEqual(["/about", "/old-programme"]);
  });

  test("lists the library images the snapshot shows", () => {
    const result = freeze(complete, contracts, nothingLive);
    if (!result.ok) throw new Error(JSON.stringify(result.incomplete));
    expect(result.frozen.media).toEqual(["med_harbour"]);
  });
});
