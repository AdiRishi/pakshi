import { Schema } from "effect";

import { NamedBlock, Place } from "./merge.ts";
import { PropPath } from "./ops.ts";

/**
 * A field that must be complete before its draft is published, such as an
 * empty required heading or an image without alt text. Drafts may hold
 * incomplete fields while people work; freezing refuses them.
 */
export const Incomplete = Schema.Struct({
  place: Place,
  block: NamedBlock,
  /** The field's path in the block's props, with list items named by ID. */
  path: PropPath,
  field: Schema.String,
  message: Schema.String,
});
export type Incomplete = typeof Incomplete.Type;
