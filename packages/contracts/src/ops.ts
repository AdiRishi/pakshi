import { Surface } from "@repo/tokens";
import { Schema } from "effect";

import { BrandRevision } from "./brand.ts";
import { FormDefinition } from "./form.ts";
import { BatchId, BlockId, BlockType, FormId, PageId } from "./ids.ts";
import { PageDocument, PagePath, Slug } from "./page.ts";
import { Link } from "./references.ts";
import { MenuItem, Menus } from "./site.ts";
import { LiveRelease, Lockfile } from "./snapshot.ts";

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

/** A meta field of a page or entry. Which ones a page accepts depends on its kind. */
export const MetaField = Schema.Literals([
  "title",
  "description",
  "date",
  "author",
  "tags",
  "excerpt",
  "cover",
  "image",
  "canonical",
  "noindex",
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

/** Sets one meta field of a page or entry. Leaving out `value` removes an optional one. */
export const SetMeta = Schema.Struct({
  op: Schema.Literal("setMeta"),
  page: PageId,
  field: MetaField,
  value: Schema.optionalKey(Schema.Json),
});
export type SetMeta = typeof SetMeta.Type;

/**
 * Changes the address of a page or collection; a collection's entries follow
 * it. Links to a page follow it too, because they hold its ID.
 */
export const SetPath = Schema.Struct({
  op: Schema.Literal("setPath"),
  page: PageId,
  path: PagePath,
});
export type SetPath = typeof SetPath.Type;

/** Changes an entry's slug, and so its address below its collection's. */
export const SetSlug = Schema.Struct({
  op: Schema.Literal("setSlug"),
  page: PageId,
  slug: Slug,
});
export type SetSlug = typeof SetSlug.Type;

export const CreatePage = Schema.Struct({ op: Schema.Literal("createPage"), page: PageDocument });
export type CreatePage = typeof CreatePage.Type;

export const DeletePage = Schema.Struct({ op: Schema.Literal("deletePage"), page: PageId });
export type DeletePage = typeof DeletePage.Type;

/** Publishes or unpublishes a page. An unpublished page stays in the draft but leaves the live site. */
export const SetStatus = Schema.Struct({
  op: Schema.Literal("setStatus"),
  page: PageId,
  status: Schema.Literals(["published", "unpublished"]),
});
export type SetStatus = typeof SetStatus.Type;

/** Adds a form, or replaces the one with its ID. */
export const SetForm = Schema.Struct({ op: Schema.Literal("setForm"), form: FormDefinition });
export type SetForm = typeof SetForm.Type;

/** Removes a form that no block uses. */
export const RemoveForm = Schema.Struct({ op: Schema.Literal("removeForm"), form: FormId });
export type RemoveForm = typeof RemoveForm.Type;

/** Replaces one of the site's menus. Only the main menu's items have children. */
export const SetMenu = Schema.Union([
  Schema.Struct({
    op: Schema.Literal("setMenu"),
    menu: Schema.Literal("main"),
    items: Schema.Array(MenuItem),
  }),
  Schema.Struct({
    op: Schema.Literal("setMenu"),
    menu: Schema.Literal("footer"),
    items: Menus.fields.footer,
  }),
]);
export type SetMenu = typeof SetMenu.Type;

/** Sends an address on to a link. Leaving out `to` removes the redirect. */
export const SetRedirect = Schema.Struct({
  op: Schema.Literal("setRedirect"),
  from: PagePath,
  to: Schema.optionalKey(Link),
});
export type SetRedirect = typeof SetRedirect.Type;

/**
 * Moves a draft onto a release, with the site-wide values only a merge
 * changes: the block lockfile and the brand revision.
 * SiteDoc makes it when it merges a release into a draft, publishes the
 * draft, or moves a Brand update draft to a newer revision; people's batches
 * can't carry it.
 */
export const Rebase = Schema.Struct({
  op: Schema.Literal("rebase"),
  base: LiveRelease,
  lockfile: Lockfile,
  brand: BrandRevision,
});
export type Rebase = typeof Rebase.Type;

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
  SetSlug,
  CreatePage,
  DeletePage,
  SetStatus,
  SetForm,
  RemoveForm,
  SetMenu,
  SetRedirect,
  Rebase,
]);
export type Op = typeof Op.Type;

/** The most ops one batch holds. */
export const batchLimit = 500;

/**
 * Ops applied together, all or none. An undo batch instead applies each op
 * that would erase no one else's change since, and passes over the rest.
 */
export const Batch = Schema.Struct({
  id: BatchId,
  ops: Schema.Array(Op).check(Schema.isMinLength(1), Schema.isMaxLength(batchLimit)),
  undo: Schema.optionalKey(Schema.Boolean),
});
export type Batch = typeof Batch.Type;

/** Which rule an op broke. */
export const BatchRule = Schema.Literals([
  /** No page has this ID. */
  "unknown-page",
  /** A page with this ID already exists. */
  "page-exists",
  /** Another page, collection or entry already has this address. */
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
  /** The page's kind has no such meta field, or its value breaks the field's rules. */
  "meta",
  /**
   * A new page's document breaks the page rules, such as an entry outside a
   * collection of its kind, or the op doesn't apply to this kind of page.
   */
  "page",
  /** No form has this ID. */
  "unknown-form",
  /** A block still uses the form, or a collection still holds entries. */
  "in-use",
  /** The person may no longer edit this draft. */
  "permission",
  /** Only SiteDoc makes this change, when it merges or publishes. */
  "system",
  /** The draft was published or closed, so it takes no more changes. */
  "closed",
  /**
   * A required value is empty or shorter than its minimum. Only the agent's
   * batches are held to this, so it fills a field in rather than leaving it empty.
   */
  "incomplete",
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
