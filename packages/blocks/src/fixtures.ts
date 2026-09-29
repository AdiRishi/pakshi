import { FormDefinition } from "@repo/contracts/form";
import { BlockId, BlockType, FormId, MediaId, PageId } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import { PageMeta, PagePath, PostMeta } from "@repo/contracts/page";
import { Menus, SiteSettings } from "@repo/contracts/site";
import { MediaFile } from "@repo/contracts/snapshot";
import { Surface } from "@repo/tokens";
import { Schema } from "effect";

import site from "./fixture-site.json" with { type: "json" };
import { fixtureFiles } from "./fixtures.gen.ts";

const Props = Schema.Record(Schema.String, Schema.Json);

/**
 * Example content for one block version, stored beside it. A section's
 * fixture carries the items in its slots.
 */
export const BlockFixture = Schema.Struct({
  variant: Schema.String,
  surface: Schema.optionalKey(Surface),
  props: Props,
  slots: Schema.optionalKey(
    Schema.Record(
      Schema.String,
      Schema.Array(Schema.Struct({ type: BlockType, variant: Schema.String, props: Props })),
    ),
  ),
});
export type BlockFixture = typeof BlockFixture.Type;

/** Every fixture of every block version. */
export const blockFixtures = fixtureFiles.map((file) => ({
  type: BlockType.make(file.type),
  version: file.version,
  name: file.name,
  fixture: Schema.decodeUnknownSync(BlockFixture)(file.fixture),
}));

const pageEntryFields = { id: PageId, path: PagePath };

/**
 * The site that block fixtures refer to: its name and menus, the forms and
 * media their references point at, and pages and posts for links and blog
 * lists.
 */
export const FixtureSite = Schema.Struct({
  settings: SiteSettings,
  menus: Menus,
  forms: Schema.Record(FormId, FormDefinition),
  media: Schema.Record(MediaId, MediaFile),
  pages: Schema.Array(
    Schema.Union([
      Schema.Struct({ ...pageEntryFields, type: Schema.Literal("page"), meta: PageMeta }),
      Schema.Struct({ ...pageEntryFields, type: Schema.Literal("post"), meta: PostMeta }),
    ]),
  ),
});

export const fixtureSite = Schema.decodeUnknownSync(FixtureSite)(site);

const alphanumeric = (value: string) => value.replace(/[^A-Za-z0-9]/g, "");

/** A fixture as a placed block with its items, with IDs made from the block type and fixture name. */
export const fixtureTree = (entry: (typeof blockFixtures)[number]): BlockTree => {
  const id = BlockId.make(`b_${alphanumeric(entry.type)}${alphanumeric(entry.name)}`);
  const { slots, ...fixture } = entry.fixture;
  const tree: BlockTree = { ...fixture, id, type: entry.type };
  if (slots === undefined) return tree;
  return {
    ...tree,
    slots: Object.fromEntries(
      Object.entries(slots).map(([slot, items]) => [
        slot,
        items.map((item, index) => ({ ...item, id: BlockId.make(`${id}${slot}${index}`) })),
      ]),
    ),
  };
};
