import { Link, MediaRef } from "@repo/contracts/references";
import { Schema } from "effect";

import { type RichTextMark, type RichTextNode, richTextSchema } from "./rich-text.ts";

const text_ = (options: {
  readonly min?: number;
  readonly max: number;
  readonly multiline?: boolean;
}) =>
  Schema.String.check(
    Schema.isMinLength(options.min ?? 1),
    Schema.isMaxLength(options.max),
    Schema.makeFilter((value) =>
      options.multiline === true || !value.includes("\n") ? undefined : "Use a single line",
    ),
  );

/** Plain text, edited in place. */
export const text = (options: {
  readonly min?: number;
  readonly max: number;
  readonly multiline?: boolean;
}) => ({
  kind: "text" as const,
  optional: false as const,
  min: options.min ?? 1,
  max: options.max,
  multiline: options.multiline ?? false,
  schema: text_(options),
});

/** Rich text stored as TipTap JSON, limited to the marks and nodes listed. */
export const richText = (options: {
  readonly marks: ReadonlyArray<RichTextMark>;
  readonly nodes?: ReadonlyArray<RichTextNode>;
}) => ({
  kind: "richText" as const,
  optional: false as const,
  marks: options.marks,
  nodes: options.nodes ?? [],
  schema: richTextSchema(options.marks, options.nodes ?? []),
});

/** An image from the media library. */
export const media = () => ({
  kind: "media" as const,
  optional: false as const,
  schema: MediaRef,
});

/** A call to action: a short label and a link. */
export const cta = () => ({
  kind: "cta" as const,
  optional: false as const,
  schema: Schema.Struct({ label: text_({ max: 40 }), link: Link }),
});

type RequiredField =
  | ReturnType<typeof text>
  | ReturnType<typeof richText>
  | ReturnType<typeof media>
  | ReturnType<typeof cta>;

/** Lets a block be complete without this field. */
export const optional = <F extends RequiredField>(field: F) => ({
  ...field,
  optional: true as const,
});

export type Field = RequiredField | ReturnType<typeof optional<RequiredField>>;

export type FieldKind = Field["kind"];

export type Fields = Readonly<Record<string, Field>>;

type RequiredKeys<F extends Fields> = {
  [K in keyof F]: F[K]["optional"] extends true ? never : K;
}[keyof F];
type OptionalKeys<F extends Fields> = Exclude<keyof F, RequiredKeys<F>>;

/** The decoded props of a block with these fields. */
export type PropsOf<F extends Fields> = {
  readonly [K in RequiredKeys<F>]: F[K]["schema"]["Type"];
} & {
  readonly [K in OptionalKeys<F>]?: F[K]["schema"]["Type"];
};
