import { Surface } from "@repo/tokens";
import { Schema } from "effect";

import { BlockId, BlockType, PageId } from "./ids.ts";
import { MediaRef } from "./references.ts";

/** A page's address on its site: `/` or lowercase segments such as `/summer-school/2027`. */
export const PagePath = Schema.String.check(
  Schema.isPattern(/^\/([a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*)?$/),
);
export type PagePath = typeof PagePath.Type;

/**
 * One placed block. Its props are checked against the block's own schema at
 * the draft's pinned version, which the page document doesn't know about.
 * Sections carry a surface and may have slots; items inside a slot have
 * neither.
 */
export const BlockInstance = Schema.Struct({
  type: BlockType,
  variant: Schema.String,
  surface: Schema.optionalKey(Surface),
  props: Schema.Record(Schema.String, Schema.Json),
  slots: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(BlockId))),
});
export type BlockInstance = typeof BlockInstance.Type;

/*
 * Meta fields carry only the limits enforced while typing. A draft may leave
 * them empty; freezing checks that they're filled in.
 */
export const PageMeta = Schema.Struct({
  title: Schema.String.check(Schema.isMaxLength(70)),
  description: Schema.String.check(Schema.isMaxLength(160)),
});
export type PageMeta = typeof PageMeta.Type;

export const PostMeta = Schema.Struct({
  ...PageMeta.fields,
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  author: Schema.String.check(Schema.isMaxLength(80)),
  tags: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40))),
  excerpt: Schema.String.check(Schema.isMaxLength(300)),
  cover: Schema.optionalKey(MediaRef),
});
export type PostMeta = typeof PostMeta.Type;

const documentFields = {
  schema: Schema.Literal("pakshi.page/1"),
  id: PageId,
  path: PagePath,
  recipe: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.Literal("unpublished")),
  /** Reserved so localization can be added without a migration. */
  locale: Schema.optionalKey(Schema.String),
  root: Schema.Array(BlockId),
  blocks: Schema.Record(BlockId, BlockInstance),
};

const integrity = Schema.makeFilter(
  (page: {
    readonly root: ReadonlyArray<BlockId>;
    readonly blocks: Readonly<Record<BlockId, BlockInstance>>;
  }) => {
    const issues: Array<Schema.FilterIssue> = [];
    const placed = new Set<BlockId>();
    const place = (id: BlockId, path: ReadonlyArray<string | number>) => {
      if (placed.has(id)) issues.push({ path, issue: `${id} is placed more than once` });
      placed.add(id);
      if (!(id in page.blocks)) issues.push({ path, issue: `${id} is not in blocks` });
    };
    page.root.forEach((id, index) => {
      place(id, ["root", index]);
      const section = page.blocks[id];
      if (section === undefined) return;
      if (section.surface === undefined)
        issues.push({ path: ["blocks", id], issue: "A section needs a surface" });
      for (const [slot, children] of Object.entries(section.slots ?? {})) {
        children.forEach((childId, childIndex) => {
          const path = ["blocks", id, "slots", slot, childIndex];
          place(childId, path);
          const item = page.blocks[childId];
          if (item?.slots !== undefined || item?.surface !== undefined)
            issues.push({ path, issue: `${childId} is an item, so it has no slots or surface` });
        });
      }
    });
    for (const id of Object.keys(page.blocks)) {
      if (!placed.has(BlockId.make(id)))
        issues.push({ path: ["blocks", id], issue: `${id} is not placed on the page` });
    }
    return issues;
  },
  { title: "document integrity" },
);

/**
 * A page or blog post: a flat map of block instances plus the ordered list of
 * sections. Blocks are addressed by ID, so an address never changes when
 * blocks move.
 */
export const PageDocument = Schema.Union([
  Schema.Struct({ ...documentFields, type: Schema.Literal("page"), meta: PageMeta }),
  Schema.Struct({ ...documentFields, type: Schema.Literal("post"), meta: PostMeta }),
]).check(integrity);
export type PageDocument = typeof PageDocument.Type;
