import { Schema } from "effect";

import { FormId, PageId } from "./ids.ts";
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

/** Something the checks found that must be fixed before a draft is submitted. */
export const CheckIssue = Schema.TaggedUnion({
  Incomplete: Incomplete.fields,
  /** A field still holding its block's placeholder content. */
  Placeholder: { place: Place, block: NamedBlock, path: PropPath, field: Schema.String },
  /** A page without its title or description. */
  MissingMeta: { place: Place, field: Schema.Literals(["title", "description"]) },
  /** A link to a page that doesn't exist or is unpublished, from a block, or from a menu when `block` is null. */
  BrokenLink: {
    place: Place,
    block: Schema.NullOr(NamedBlock),
    field: Schema.String,
    page: PageId,
  },
  /** A form on a served page whose entries would be emailed to no one. */
  NoFormEmails: { form: FormId, name: Schema.String },
  /** A form that asks for an email address or phone number without a required consent checkbox linking to a privacy policy. */
  MissingConsent: { form: FormId, name: Schema.String },
});
export type CheckIssue = typeof CheckIssue.Type;
