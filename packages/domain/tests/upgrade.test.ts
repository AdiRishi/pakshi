import { loadBlockVersions } from "@repo/blocks";
import { propsSchema } from "@repo/blocks/fields";
import { BlockId, PageId } from "@repo/contracts/ids";
import { Schema } from "effect";
import { expect, test } from "vitest";

import { contractsAt, migrateContent } from "../src/merge.ts";
import { harbourDraft } from "./support/draft.ts";

test("an upgrade from hero v1 to v3 migrates its content through v2 and v3", async () => {
  const library = await loadBlockVersions([harbourDraft.lockfile, { hero: 3 }]);
  const upgraded = migrateContent(library, harbourDraft, { hero: 3 });
  const hero = upgraded.pages[PageId.make("pg_home")]?.blocks[BlockId.make("b_hero")];

  expect(upgraded.lockfile["hero"]).toBe(3);
  // v2 made the button the first of the buttons; v3 made the rich text plain.
  expect(hero?.props).toEqual({
    heading: "Learn by building",
    summary: "Five days of workshops.",
    actions: [
      { id: "it_primary", button: { label: "Register", link: "https://example.org/register" } },
    ],
  });
  const v3 = contractsAt(library, upgraded.lockfile).get("hero");
  if (v3 === undefined) throw new Error("The upgrade pins hero v3.");
  expect(Schema.is(propsSchema(v3.fields, "complete"))(hero?.props)).toBe(true);
});

test("an upgrade leaves the other blocks at their versions", async () => {
  const library = await loadBlockVersions([harbourDraft.lockfile, { hero: 3 }]);
  const upgraded = migrateContent(library, harbourDraft, { hero: 3 });
  expect({ ...upgraded.lockfile, hero: 1 }).toEqual(harbourDraft.lockfile);
  expect(upgraded.pages[PageId.make("pg_home")]?.blocks[BlockId.make("b_features")]).toEqual(
    harbourDraft.pages[PageId.make("pg_home")]?.blocks[BlockId.make("b_features")],
  );
});
