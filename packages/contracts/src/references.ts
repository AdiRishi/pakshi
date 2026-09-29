import { Schema } from "effect";

import { FormId, MediaId, PageId } from "./ids.ts";

/**
 * An image placed on a page. Alt text belongs to the placement, because the
 * same file can say something different, or nothing, in different places. An
 * empty alt marks the image as decorative. It may be missing while a draft is
 * being edited; freezing requires it.
 */
export const MediaRef = Schema.Struct({
  $ref: Schema.Literal("media"),
  id: MediaId,
  alt: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(250))),
});
export type MediaRef = typeof MediaRef.Type;

export const FormRef = Schema.Struct({ $ref: Schema.Literal("form"), id: FormId });
export type FormRef = typeof FormRef.Type;

export const PageRef = Schema.Struct({ $ref: Schema.Literal("page"), id: PageId });
export type PageRef = typeof PageRef.Type;

/** An address outside the site. Only these protocols are ever stored or rendered. */
export const ExternalUrl = Schema.String.check(
  Schema.makeFilter((value) => {
    if (!URL.canParse(value)) return "Enter a full address, such as https://example.org";
    const { protocol } = new URL(value);
    return ["https:", "http:", "mailto:", "tel:"].includes(protocol)
      ? undefined
      : "Links can only use https, http, mailto or tel";
  }),
);

/** A link to a page on the same site, which follows the page when its address changes, or to an external address. */
export const Link = Schema.Union([PageRef, ExternalUrl]);
export type Link = typeof Link.Type;
