import { Schema } from "effect";

import { BlockId, PageId } from "./ids.ts";
import { Target } from "./ops.ts";

/*
 * What updating a draft reports. A draft that's behind merges the release now
 * live into itself. Changes on one side merge on their own; a conflict needs
 * someone to keep one side.
 */

/** A side of a merge: the draft's own changes, or the live site's. */
export const Side = Schema.Literals(["draft", "live"]);
export type Side = typeof Side.Type;

/** Where a conflict or change is: a page, or the header and footer every page shares. */
export const Place = Schema.Struct({ target: Target, title: Schema.String });
export type Place = typeof Place.Type;

/** A block by ID, with its block type's title, such as "Hero". */
export const NamedBlock = Schema.Struct({ id: BlockId, title: Schema.String });
export type NamedBlock = typeof NamedBlock.Type;

/** How a changed value reads, so Studio can show it: text, an image, a link and so on. */
export const ValueKind = Schema.Literals([
  "text",
  "richText",
  "media",
  "cta",
  "link",
  "form",
  "list",
  "choice",
  "address",
  "tags",
]);
export type ValueKind = typeof ValueKind.Type;

/**
 * A conflict's key names what it's about, so a choice made for it still
 * applies when the merge is worked out again after more edits.
 */
export const ConflictKey = Schema.String.pipe(Schema.brand("ConflictKey"));
export type ConflictKey = typeof ConflictKey.Type;

export const Conflict = Schema.TaggedUnion({
  /** Both sides changed one value, differently. A missing value was removed. */
  Changed: {
    key: ConflictKey,
    place: Place,
    /** The block the value belongs to, or null for a value of the page or site. */
    block: Schema.NullOr(NamedBlock),
    field: Schema.String,
    kind: ValueKind,
    draft: Schema.optional(Schema.Json),
    live: Schema.optional(Schema.Json),
  },
  /** One side removed a block, or a whole page when `block` is null, that the other side changed. */
  Removed: {
    key: ConflictKey,
    place: Place,
    block: Schema.NullOr(NamedBlock),
    removedOn: Side,
  },
  /** Both sides reordered the same blocks, differently. */
  Reordered: {
    key: ConflictKey,
    place: Place,
    /** The section whose items were reordered, or null for the page's sections. */
    section: Schema.NullOr(NamedBlock),
    draft: Schema.Array(NamedBlock),
    live: Schema.Array(NamedBlock),
  },
  /** A page on each side took the same address. Keeping one side removes the other's page. */
  Address: {
    key: ConflictKey,
    path: Schema.String,
    draft: Schema.Struct({ id: PageId, title: Schema.String }),
    live: Schema.Struct({ id: PageId, title: Schema.String }),
  },
});
export type Conflict = typeof Conflict.Type;

/** The side kept for each conflict, by its key. */
export const Resolutions = Schema.Record(ConflictKey, Side);
export type Resolutions = typeof Resolutions.Type;

/** A change from the live site that merged into a draft on its own. */
export const MergedChange = Schema.TaggedUnion({
  PageAdded: { place: Place },
  PageRemoved: { place: Place },
  BlockAdded: { place: Place, block: Schema.String },
  BlockRemoved: { place: Place, block: Schema.String },
  BlockMoved: { place: Place, block: Schema.String },
  ValueChanged: { place: Place, block: Schema.NullOr(Schema.String), field: Schema.String },
});
export type MergedChange = typeof MergedChange.Type;
