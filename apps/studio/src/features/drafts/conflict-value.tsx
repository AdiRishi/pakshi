import { RichTextDocument, richTextLines } from "@repo/blocks";
import type { MediaId } from "@repo/contracts/ids";
import type { ValueKind } from "@repo/contracts/merge";
import { ExternalUrl, Link, MediaRef } from "@repo/contracts/references";
import { Option, Predicate, Schema } from "effect";
import type { ReactNode } from "react";

const asMedia = Schema.decodeUnknownOption(MediaRef);
const asRichText = Schema.decodeUnknownOption(RichTextDocument);
const asCta = Schema.decodeUnknownOption(Schema.Struct({ label: Schema.String, link: Link }));
const asLink = Schema.decodeUnknownOption(Link);
const asTags = Schema.decodeUnknownOption(Schema.Array(Schema.String));
const asList = Schema.decodeUnknownOption(Schema.Array(Schema.Json));
const asNamed = Schema.decodeUnknownOption(Schema.Struct({ name: Schema.String }));
const isUrl = Schema.is(ExternalUrl);

const linkText = (link: Link) => (isUrl(link) ? link : "A page on this site");

/** A value as the field kind that shows it, if it is one. `image` says where an image loads from. */
const shown = (
  kind: ValueKind,
  value: Schema.Json,
  image: (media: MediaId) => string,
): ReactNode => {
  switch (kind) {
    case "media":
      return Option.match(asMedia(value), {
        onNone: () => null,
        onSome: (media) => (
          <span className="flex flex-col gap-2">
            <img
              src={image(media.id)}
              alt={media.alt ?? ""}
              className="aspect-video w-full rounded-md object-cover"
            />
            <span className="text-sm text-muted-foreground">
              {media.alt === undefined || media.alt === ""
                ? "No alt text"
                : `Alt text: ${media.alt}`}
            </span>
          </span>
        ),
      });
    case "richText":
      return Option.match(asRichText(value), {
        onNone: () => null,
        onSome: (document) => (
          <span className="flex flex-col gap-1">
            {richTextLines(document).map((line, index) => (
              // Lines have no identity of their own; their order is the text's.
              // oxlint-disable-next-line react/no-array-index-key
              <span key={index}>{line}</span>
            ))}
          </span>
        ),
      });
    case "cta":
      return Option.match(asCta(value), {
        onNone: () => null,
        onSome: (cta) => (
          <span className="flex flex-col gap-1">
            <span className="font-medium">{cta.label}</span>
            <span className="text-sm text-muted-foreground">{linkText(cta.link)}</span>
          </span>
        ),
      });
    case "link":
      return Option.match(asLink(value), {
        onNone: () => null,
        onSome: (link) => <span>{linkText(link)}</span>,
      });
    case "tags":
      return Option.match(asTags(value), {
        onNone: () => null,
        onSome: (tags) => <span>{tags.join(", ") || "No tags"}</span>,
      });
    case "list":
      return Option.match(asList(value), {
        onNone: () => null,
        onSome: (items) => <span>{items.length === 1 ? "1 item" : `${items.length} items`}</span>,
      });
    case "number":
      return Predicate.isNumber(value) ? (
        <span className="text-lg font-medium">{value}</span>
      ) : null;
    case "text":
    case "address":
    case "choice":
    case "form":
      return Predicate.isString(value) ? (
        <span className="text-lg font-medium">{value}</span>
      ) : (
        Option.match(asNamed(value), {
          onNone: () => null,
          onSome: (named) => <span>{named.name}</span>,
        })
      );
  }
};

/** One side's value in a conflict, shown the way its kind of field reads. A missing value was removed. */
export function ConflictValue(props: {
  readonly kind: ValueKind;
  readonly value: Schema.Json | undefined;
  readonly image: (media: MediaId) => string;
}) {
  if (props.value === undefined)
    return <span className="text-muted-foreground italic">Removed</span>;
  return (
    shown(props.kind, props.value, props.image) ?? (
      <span className="text-muted-foreground">A different version</span>
    )
  );
}
