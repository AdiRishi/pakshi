import { ExternalUrl } from "@repo/contracts/references";
import type { AnyExtension, JSONContent } from "@tiptap/core";
import Bold from "@tiptap/extension-bold";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Heading from "@tiptap/extension-heading";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { Schema } from "effect";

export type RichTextMark = "bold" | "italic" | "link";
export type RichTextNode = "heading" | "bulletList" | "orderedList";

const Mark = Schema.Union([
  Schema.Struct({ type: Schema.Literal("bold") }),
  Schema.Struct({ type: Schema.Literal("italic") }),
  Schema.Struct({ type: Schema.Literal("link"), attrs: Schema.Struct({ href: ExternalUrl }) }),
]);

const Inline = Schema.Union([
  Schema.Struct({
    type: Schema.Literal("text"),
    text: Schema.String.check(Schema.isNonEmpty()),
    marks: Schema.optionalKey(Schema.Array(Mark)),
  }),
  Schema.Struct({ type: Schema.Literal("hardBreak") }),
]);

const Paragraph_ = Schema.Struct({
  type: Schema.Literal("paragraph"),
  content: Schema.optionalKey(Schema.Array(Inline)),
});

const ListItem_ = Schema.Struct({
  type: Schema.Literal("listItem"),
  content: Schema.Array(Paragraph_).check(Schema.isMinLength(1)),
});

const TopNode = Schema.Union([
  Paragraph_,
  Schema.Struct({
    type: Schema.Literal("heading"),
    attrs: Schema.Struct({ level: Schema.Literals([2, 3]) }),
    content: Schema.optionalKey(Schema.Array(Inline)),
  }),
  Schema.Struct({ type: Schema.Literal("bulletList"), content: Schema.Array(ListItem_) }),
  Schema.Struct({ type: Schema.Literal("orderedList"), content: Schema.Array(ListItem_) }),
]);

const RichTextDocument = Schema.Struct({
  type: Schema.Literal("doc"),
  content: Schema.Array(TopNode),
});
export type RichTextDocument = typeof RichTextDocument.Type;

const markTypes = (document: RichTextDocument) => {
  const found = new Set<string>();
  const visit = (inline: ReadonlyArray<typeof Inline.Type> | undefined) => {
    for (const node of inline ?? []) {
      if (node.type === "text") for (const mark of node.marks ?? []) found.add(mark.type);
    }
  };
  for (const node of document.content) {
    if (node.type === "paragraph" || node.type === "heading") visit(node.content);
    else
      for (const item of node.content)
        for (const paragraph of item.content) visit(paragraph.content);
  }
  return found;
};

/** Whether a rich text value holds no text at all. */
export const isEmptyRichText = (document: RichTextDocument) => {
  const hasText = (inline: ReadonlyArray<typeof Inline.Type> | undefined) =>
    (inline ?? []).some((node) => node.type === "text" && node.text.trim().length > 0);
  return !document.content.some((node) =>
    node.type === "paragraph" || node.type === "heading"
      ? hasText(node.content)
      : node.content.some((item) => item.content.some((paragraph) => hasText(paragraph.content))),
  );
};

/** A rich text value that uses only the marks and nodes its field allows. */
export const richTextSchema = (
  marks: ReadonlyArray<RichTextMark>,
  nodes: ReadonlyArray<RichTextNode>,
) =>
  RichTextDocument.check(
    Schema.makeFilter((document) => {
      const issues: Array<Schema.FilterIssue> = [];
      document.content.forEach((node, index) => {
        if (node.type !== "paragraph" && !nodes.some((allowed) => allowed === node.type))
          issues.push({ path: ["content", index], issue: `${node.type} isn't allowed here` });
      });
      for (const mark of markTypes(document)) {
        if (!marks.some((allowed) => allowed === mark))
          issues.push({ path: ["content"], issue: `${mark} isn't allowed here` });
      }
      return issues;
    }),
  );

const markExtensions: Record<RichTextMark, ReadonlyArray<AnyExtension>> = {
  bold: [Bold],
  italic: [Italic],
  link: [Link.configure({ openOnClick: false, HTMLAttributes: { target: null, rel: null } })],
};

const nodeExtensions: Record<RichTextNode, ReadonlyArray<AnyExtension>> = {
  heading: [Heading.configure({ levels: [2, 3] })],
  bulletList: [BulletList, ListItem],
  orderedList: [OrderedList, ListItem],
};

/** The TipTap extensions for a field. The site renderer and the editor both use them. */
export const richTextExtensions = (
  marks: ReadonlyArray<RichTextMark>,
  nodes: ReadonlyArray<RichTextNode>,
): Array<AnyExtension> => [
  Document,
  Paragraph,
  Text,
  HardBreak,
  ...new Set([
    ...marks.flatMap((mark) => markExtensions[mark]),
    ...nodes.flatMap((node) => nodeExtensions[node]),
  ]),
];

/** TipTap's content type is mutable, so hand it a copy of the stored document. */
export const toJsonContent = (document: RichTextDocument): JSONContent =>
  JSON.parse(JSON.stringify(document));
