import { Surface } from "@repo/tokens";
import { Schema } from "effect";

import { BatchId, BlockId, BlockType, PageId } from "./ids.ts";
import { PageDocument, PagePath } from "./page.ts";

/** Where a block lives: a page, or the site-level parts that hold the header and footer. */
export const Target = Schema.Union([PageId, Schema.Literal("site")]);
export type Target = typeof Target.Type;

/**
 * A path into a block's props: a field name, then a part of the field, such
 * as a button's `label`, or the ID of an item in a list. Paths never hold a
 * position, so a concurrent insert can't point one at the wrong item.
 */
export const PropPath = Schema.Array(Schema.String).check(Schema.isMinLength(1));
export type PropPath = typeof PropPath.Type;

/** A list of blocks: the page's top-level sections, or one slot of a section. */
export const BlockList = Schema.Union([
  Schema.Literal("root"),
  Schema.Struct({ block: BlockId, slot: Schema.String }),
]);
export type BlockList = typeof BlockList.Type;

const treeFields = {
  id: BlockId,
  type: BlockType,
  variant: Schema.String,
  props: Schema.Record(Schema.String, Schema.Json),
};

/** An item block with its ID, as an insert carries it. */
export const ItemTree = Schema.Struct(treeFields);
export type ItemTree = typeof ItemTree.Type;

/** A block with its ID and, for a section, the items in its slots, as an insert carries them. */
export const BlockTree = Schema.Struct({
  ...treeFields,
  surface: Schema.optionalKey(Surface),
  slots: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(ItemTree))),
});
export type BlockTree = typeof BlockTree.Type;

/** A meta field of a page or post. Which ones a page accepts depends on its type. */
export const MetaField = Schema.Literals([
  "title",
  "description",
  "date",
  "author",
  "tags",
  "excerpt",
  "cover",
]);
export type MetaField = typeof MetaField.Type;

/**
 * Sets one field, or one part of it, on a block. Leaving out `value` removes
 * an optional field.
 */
export const SetProp = Schema.Struct({
  op: Schema.Literal("setProp"),
  target: Target,
  block: BlockId,
  path: PropPath,
  value: Schema.optionalKey(Schema.Json),
});
export type SetProp = typeof SetProp.Type;

export const SetVariant = Schema.Struct({
  op: Schema.Literal("setVariant"),
  target: Target,
  block: BlockId,
  variant: Schema.String,
});
export type SetVariant = typeof SetVariant.Type;

export const SetSurface = Schema.Struct({
  op: Schema.Literal("setSurface"),
  target: Target,
  block: BlockId,
  surface: Surface,
});
export type SetSurface = typeof SetSurface.Type;

/** Inserts a block after `after` in a list, or first when `after` is null. */
export const InsertBlock = Schema.Struct({
  op: Schema.Literal("insertBlock"),
  page: PageId,
  list: BlockList,
  after: Schema.NullOr(BlockId),
  block: BlockTree,
});
export type InsertBlock = typeof InsertBlock.Type;

/** Moves a block, with its items, after `after` in a list, or first when `after` is null. */
export const MoveBlock = Schema.Struct({
  op: Schema.Literal("moveBlock"),
  page: PageId,
  block: BlockId,
  list: BlockList,
  after: Schema.NullOr(BlockId),
});
export type MoveBlock = typeof MoveBlock.Type;

/** Removes a block and the items in its slots. */
export const RemoveBlock = Schema.Struct({
  op: Schema.Literal("removeBlock"),
  page: PageId,
  block: BlockId,
});
export type RemoveBlock = typeof RemoveBlock.Type;

/** Sets one meta field of a page or post. Leaving out `value` removes an optional one. */
export const SetMeta = Schema.Struct({
  op: Schema.Literal("setMeta"),
  page: PageId,
  field: MetaField,
  value: Schema.optionalKey(Schema.Json),
});
export type SetMeta = typeof SetMeta.Type;

/** Changes a page's address. Links to the page follow it, because they hold its ID. */
export const SetPath = Schema.Struct({
  op: Schema.Literal("setPath"),
  page: PageId,
  path: PagePath,
});
export type SetPath = typeof SetPath.Type;

export const CreatePage = Schema.Struct({ op: Schema.Literal("createPage"), page: PageDocument });
export type CreatePage = typeof CreatePage.Type;

export const DeletePage = Schema.Struct({ op: Schema.Literal("deletePage"), page: PageId });
export type DeletePage = typeof DeletePage.Type;

/** One change to a draft. People, the agent, undo and merging all speak this vocabulary. */
export const Op = Schema.Union([
  SetProp,
  SetVariant,
  SetSurface,
  InsertBlock,
  MoveBlock,
  RemoveBlock,
  SetMeta,
  SetPath,
  CreatePage,
  DeletePage,
]);
export type Op = typeof Op.Type;

/** Ops applied together, all or none. */
export const Batch = Schema.Struct({
  id: BatchId,
  ops: Schema.Array(Op).check(Schema.isMinLength(1), Schema.isMaxLength(500)),
});
export type Batch = typeof Batch.Type;

/** Which rule an op broke. */
export const BatchRule = Schema.Literals([
  /** No page has this ID. */
  "unknown-page",
  /** A page with this ID already exists. */
  "page-exists",
  /** Another page already has this address. */
  "path-taken",
  /** No block with this ID is in the target. */
  "unknown-block",
  /** A block with this ID already exists on the page. */
  "block-exists",
  /** The list doesn't exist, or `after` isn't in it. */
  "unknown-list",
  /** The block type isn't in the draft's lockfile. */
  "block-type",
  /** The block can't go here: a section in a slot, an item at the top level, or a type the slot doesn't accept. */
  "placement",
  /** The block has no variant with this name. */
  "variant",
  /** The block doesn't offer this surface, or it's an item, which has none. */
  "surface",
  /** The path doesn't name a field of the block. */
  "field",
  /** No list item has this ID. */
  "unknown-item",
  /** The value breaks the field's rules, such as its maximum length or allowed links. */
  "value",
  /** The page type has no such meta field, or its value breaks the field's rules. */
  "meta",
  /** A new page's document breaks the page rules. */
  "page",
]);
export type BatchRule = typeof BatchRule.Type;

/** Why an op in a rejected batch failed, precise enough for a person or the agent to fix it. */
export const BatchError = Schema.Struct({
  /** The op's position in the batch. */
  op: Schema.Int,
  path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
  rule: BatchRule,
  message: Schema.String,
});
export type BatchError = typeof BatchError.Type;
