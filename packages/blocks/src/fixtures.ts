import { FormDefinition } from "@repo/contracts/form";
import { BlockId, BlockType, FormId, MediaId, PageId } from "@repo/contracts/ids";
import type { BlockTree } from "@repo/contracts/ops";
import { type BlockInstance, PageMeta, PagePath, PostMeta } from "@repo/contracts/page";
import { Menus, SiteSettings } from "@repo/contracts/site";
import { MediaFile } from "@repo/contracts/snapshot";
import { Schema } from "effect";

import { BlockFixture } from "./contract.ts";
import site from "./fixture-site.json" with { type: "json" };
import { fixtureFiles } from "./fixtures.gen.ts";

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

/** A block tree as the flat instances a page stores: the block, then each of its items. */
export const flattenTree = (tree: BlockTree): ReadonlyArray<readonly [BlockId, BlockInstance]> => {
  const { id, slots, ...block } = tree;
  const items = Object.values(slots ?? {}).flat();
  const root: BlockInstance =
    slots === undefined
      ? block
      : {
          ...block,
          slots: Object.fromEntries(
            Object.entries(slots).map(([slot, list]) => [slot, list.map((item) => item.id)]),
          ),
        };
  return [[id, root], ...items.map(({ id: itemId, ...item }) => [itemId, item] as const)];
};
