import { ItemId } from "@repo/contracts/ids";
import type { CollectionKind } from "@repo/contracts/page";
import { FormRef, Link, MediaRef, PageRef } from "@repo/contracts/references";
import { Effect, Schema } from "effect";

import { IconName } from "./icon-names.ts";

export { IconName } from "./icon-names.ts";
import {
  isEmptyRichText,
  type RichTextDocument,
  type RichTextMark,
  type RichTextNode,
  richTextSchema,
} from "./rich-text.ts";

/*
 * A field has two schemas. `draft` holds the limits the editor enforces while
 * someone types: maximum lengths, single lines, allowed marks and links. A
 * draft may break `complete`'s extra rules, such as minimum lengths or an
 * empty required value, while someone works on it; freezing checks them.
 */

interface FieldBase<Kind extends string> {
  readonly kind: Kind;
  /** Names the field in the settings panel and labels its editable text. */
  readonly title: string;
  /** Whether a block is complete without this field. Required fields are always present. */
  readonly optional: false;
}

interface Schemas<Value> {
  readonly draft: Schema.Decoder<Value>;
  readonly complete: Schema.Decoder<Value>;
}

export interface TextField extends FieldBase<"text">, Schemas<string> {
  readonly min: number;
  readonly max: number;
  readonly multiline: boolean;
}

export interface RichTextField extends FieldBase<"richText">, Schemas<RichTextDocument> {
  readonly marks: ReadonlyArray<RichTextMark>;
  readonly nodes: ReadonlyArray<RichTextNode>;
}

export interface LinkField extends FieldBase<"link">, Schemas<Link> {}

export interface FormField extends FieldBase<"form">, Schemas<FormRef> {}

export interface MediaField extends FieldBase<"media">, Schemas<MediaRef> {
  readonly parts: { readonly alt: TextField };
}

export interface CtaField
  extends FieldBase<"cta">, Schemas<{ readonly label: string; readonly link: Link }> {
  readonly parts: { readonly label: TextField; readonly link: LinkField };
}

/** A collection of one kind, such as one of the site's blogs, whose entries the block lists. */
export interface CollectionField extends FieldBase<"collection">, Schemas<PageRef> {
  readonly collectionKind: CollectionKind;
}

/** A whole number from `min` to `max`. */
export interface NumberField extends FieldBase<"number">, Schemas<number> {
  readonly min: number;
  readonly max: number;
}

/**
 * One of a few named options that sets how a block shows, such as how many
 * columns it has. Its first option is the one new content starts with, and
 * the one a block left without it reads as.
 */
export interface ChoiceField<Option extends string = string>
  extends FieldBase<"choice">, Schemas<Option> {
  readonly options: readonly [Option, ...Array<Option>];
  /** What each option is called, from the block's presentation; an option it doesn't name shows as itself. */
  readonly labels: Readonly<Record<string, string>>;
  /** The variants the choice changes anything in, from the block's presentation, or null for all of them. */
  readonly layouts: ReadonlyArray<string> | null;
}

/** An icon from the library's set, such as one beside a feature. */
export interface IconField extends FieldBase<"icon">, Schemas<IconName> {}

/** The fields a list item can have. Items don't hold lists, because documents nest two levels at most. */
type ItemFieldKind =
  | TextField
  | RichTextField
  | LinkField
  | FormField
  | MediaField
  | CtaField
  | IconField;

export type ItemFields = Readonly<Record<string, ItemFieldKind | Optional<ItemFieldKind>>>;

export interface ListField<Item extends ItemFields = ItemFields> extends FieldBase<"list"> {
  readonly item: Item;
  readonly min: number;
  readonly max: number;
  readonly draft: Schema.Decoder<ReadonlyArray<ListItem<Item>>>;
  readonly complete: Schema.Decoder<ReadonlyArray<ListItem<Item>>>;
}

/*
 * Only a block's own fields may be a collection, a number or a choice. They
 * set what the whole block shows, and the checks on where a collection
 * points read only a block's own fields.
 */
type RequiredField = ItemFieldKind | ListField | CollectionField | NumberField | ChoiceField;

export type Field = RequiredField | Optional<RequiredField>;

export type FieldKind = Field["kind"];

export type Fields = Readonly<Record<string, Field>>;

type Optional<F extends RequiredField> = F extends RequiredField
  ? Omit<F, "optional"> & { readonly optional: true }
  : never;

/** Lets a block be complete without this field. A draft may leave it out entirely. */
export const optional = <F extends RequiredField>(field: F): Optional<F> => ({
  ...field,
  optional: true,
});

/** Plain text, edited in place. */
export const text = (options: {
  readonly title: string;
  readonly min?: number;
  readonly max: number;
  readonly multiline?: boolean;
}): TextField => {
  const multiline = options.multiline ?? false;
  const min = options.min ?? 1;
  const draft = Schema.String.check(
    Schema.isMaxLength(options.max, { message: `Use at most ${options.max} characters` }),
    Schema.makeFilter((value) =>
      multiline || !value.includes("\n") ? undefined : "Use a single line",
    ),
  );
  return {
    kind: "text",
    title: options.title,
    optional: false,
    min,
    max: options.max,
    multiline,
    draft,
    complete: draft.check(
      Schema.makeFilter((value) =>
        value.trim().length >= min
          ? undefined
          : min === 1
            ? "Fill this in"
            : `Use at least ${min} characters`,
      ),
    ),
  };
};

/** Rich text stored as TipTap JSON, limited to the marks and nodes listed. */
export const richText = (options: {
  readonly title: string;
  readonly marks: ReadonlyArray<RichTextMark>;
  readonly nodes?: ReadonlyArray<RichTextNode>;
}): RichTextField => {
  const nodes = options.nodes ?? [];
  const draft = richTextSchema(options.marks, nodes);
  return {
    kind: "richText",
    title: options.title,
    optional: false,
    marks: options.marks,
    nodes,
    draft,
    complete: draft.check(
      Schema.makeFilter((value) => (isEmptyRichText(value) ? "Fill this in" : undefined)),
    ),
  };
};

/** A link to a page on the site or an external address. */
export const link = (options: { readonly title: string }): LinkField => ({
  kind: "link",
  title: options.title,
  optional: false,
  draft: Link,
  complete: Link,
});

/** One of the site's forms. */
export const form = (options: { readonly title: string }): FormField => ({
  kind: "form",
  title: options.title,
  optional: false,
  draft: FormRef,
  complete: FormRef,
});

const altText = text({ title: "Alt text", min: 0, max: 250 });

/** An image from the media library, with alt text for this placement. */
export const media = (options: { readonly title: string }): MediaField => ({
  kind: "media",
  title: options.title,
  optional: false,
  parts: { alt: altText },
  draft: MediaRef,
  complete: MediaRef.mapFields((fields) => ({
    ...fields,
    alt: altText.complete.annotateKey({ messageMissingKey: "Fill this in" }),
  })),
});

/** A call to action: a short label and a link. */
export const cta = (options: { readonly title: string }): CtaField => {
  const label = text({ title: "Label", max: 40 });
  const target = link({ title: "Link" });
  return {
    kind: "cta",
    title: options.title,
    optional: false,
    parts: { label, link: target },
    draft: Schema.Struct({ label: label.draft, link: target.draft }),
    complete: Schema.Struct({ label: label.complete, link: target.complete }),
  };
};

/** One of the site's collections of this kind, such as a blog whose posts the block lists. */
export const collection = (options: {
  readonly title: string;
  readonly kind: CollectionKind;
}): CollectionField => ({
  kind: "collection",
  title: options.title,
  optional: false,
  collectionKind: options.kind,
  draft: PageRef,
  complete: PageRef,
});

/** A whole number from `min` to `max`, such as how many posts to show. */
export const number = (options: {
  readonly title: string;
  readonly min: number;
  readonly max: number;
}): NumberField => {
  const schema = Schema.Int.check(
    Schema.isBetween(
      { minimum: options.min, maximum: options.max },
      { message: `Use a whole number from ${options.min} to ${options.max}` },
    ),
  );
  return {
    kind: "number",
    title: options.title,
    optional: false,
    min: options.min,
    max: options.max,
    draft: schema,
    complete: schema,
  };
};

/** One of a few named options, such as a layout's columns, the first of which new content starts with. */
export const choice = <const Option extends string>(options: {
  readonly title: string;
  readonly options: readonly [Option, ...Array<Option>];
}): ChoiceField<Option> => {
  const schema = Schema.Literals(options.options);
  return {
    kind: "choice",
    title: options.title,
    optional: false,
    options: options.options,
    labels: {},
    layouts: null,
    draft: schema,
    complete: schema,
  };
};

/** An icon from the library's set. */
export const icon = (options: { readonly title: string }): IconField => ({
  kind: "icon",
  title: options.title,
  optional: false,
  draft: IconName,
  complete: IconName,
});

/** A value read from props as the field's schemas decode it. */
type ValueOf<F extends Field> = F["draft"]["Type"];

type RequiredKeys<F extends Fields> = {
  [K in keyof F]: F[K]["optional"] extends true ? never : K;
}[keyof F];
type OptionalKeys<F extends Fields> = Exclude<keyof F, RequiredKeys<F>>;

/** The decoded props of a block, or of a list item, with these fields. */
export type PropsOf<F extends Fields> = {
  readonly [K in RequiredKeys<F>]: ValueOf<F[K]>;
} & {
  readonly [K in OptionalKeys<F>]?: ValueOf<F[K]>;
};

/** One item of a list: its ID and its own fields. */
export type ListItem<Item extends Fields> = { readonly id: ItemId } & PropsOf<Item>;

/** A field's schema as a key of its block's props: absent when optional, its first option when a choice left out. */
type KeySchema =
  | Schema.Decoder<unknown>
  | Schema.optionalKey<Schema.Decoder<unknown>>
  | Schema.withDecodingDefaultKey<Schema.Decoder<unknown>>;

const keySchema = (field: Field, mode: "draft" | "complete"): KeySchema => {
  if (field.optional) return Schema.optionalKey(field[mode]);
  if (field.kind === "choice")
    return field[mode].pipe(Schema.withDecodingDefaultKey(Effect.succeed(field.options[0])));
  return field[mode];
};

const fieldSchemas = (
  fields: Fields,
  mode: "draft" | "complete",
): Readonly<Record<string, KeySchema>> =>
  Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, keySchema(field, mode)]));

/**
 * The schema for props with these fields, in either mode. A draft keeps
 * required fields present, so block components never meet a missing one.
 */
export const propsSchema = <F extends Fields>(fields: F, mode: "draft" | "complete") =>
  // SAFETY: the struct is built field by field from `fields`, each with the
  // schema whose type PropsOf<F> reads for it.
  Schema.Struct(fieldSchemas(fields, mode)) as Schema.Decoder<PropsOf<F>>;

const uniqueIds = Schema.makeFilter((items: ReadonlyArray<{ readonly id: ItemId }>) => {
  const seen = new Set<ItemId>();
  const issues: Array<Schema.FilterIssue> = [];
  items.forEach((item, index) => {
    if (seen.has(item.id)) issues.push({ path: [index, "id"], issue: `${item.id} is repeated` });
    seen.add(item.id);
  });
  return issues;
});

/** Repeated items inside a block's props, such as a gallery's images. Each item carries an ID. */
export const list = <const Item extends ItemFields>(options: {
  readonly title: string;
  readonly item: Item;
  readonly min?: number;
  readonly max: number;
}): ListField<Item> => {
  const min = options.min ?? 1;
  const itemSchema = (mode: "draft" | "complete") =>
    Schema.Struct({ id: ItemId, ...fieldSchemas(options.item, mode) });
  // SAFETY: each item schema is built field by field from `options.item`, so
  // a successful decode has exactly the type ListItem<Item> describes.
  const draft = Schema.Array(itemSchema("draft")).check(
    Schema.isMaxLength(options.max),
    uniqueIds,
  ) as Schema.Decoder<ReadonlyArray<ListItem<Item>>>;
  // SAFETY: as above, with the complete schema of each item field.
  const complete = Schema.Array(itemSchema("complete")).check(
    Schema.isMinLength(min),
    Schema.isMaxLength(options.max),
    uniqueIds,
  ) as Schema.Decoder<ReadonlyArray<ListItem<Item>>>;
  return {
    kind: "list",
    title: options.title,
    optional: false,
    item: options.item,
    min,
    max: options.max,
    draft,
    complete,
  };
};

/**
 * The field a prop path names, or undefined when it names none. A path starts
 * with a field's name. After a media or button field comes one of its parts;
 * after a list comes an item's ID and then one of the item's fields.
 */
export const fieldAt = (fields: Fields, path: ReadonlyArray<string>): Field | undefined => {
  const [name, ...rest] = path;
  const field = name === undefined ? undefined : fields[name];
  if (field === undefined || rest.length === 0) return field;
  if (field.kind === "list")
    return rest.length < 2 ? undefined : fieldAt(field.item, rest.slice(1));
  if (field.kind !== "media" && field.kind !== "cta") return undefined;
  const [part, ...deeper] = rest;
  return deeper.length === 0 && part !== undefined ? fieldParts(field)[part] : undefined;
};

/** The parts of a field that a path can step into after the field's name. */
export const fieldParts = (field: Field): Readonly<Record<string, Field>> =>
  field.kind === "media" || field.kind === "cta" ? field.parts : {};
