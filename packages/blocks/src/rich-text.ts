import { ExternalUrl } from "@repo/contracts/references";
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

/** A rich text value of any field, before its field's marks and nodes are checked. */
export const RichTextDocument = Schema.Struct({
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

/** The text of each paragraph and heading, list items' paragraphs included, in order. */
export const richTextLines = (document: RichTextDocument) => {
  const text = (inline: ReadonlyArray<typeof Inline.Type> | undefined) =>
    (inline ?? []).map((node) => (node.type === "text" ? node.text : " ")).join("");
  return document.content.flatMap((node) =>
    node.type === "paragraph" || node.type === "heading"
      ? [text(node.content)]
      : node.content.flatMap((item) => item.content.map((paragraph) => text(paragraph.content))),
  );
};

/** Whether a rich text value holds no text at all. */
export const isEmptyRichText = (document: RichTextDocument) =>
  richTextLines(document).every((line) => line.trim().length === 0);

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

/**
 * The text of a stored rich text value, one paragraph or heading to a line,
 * for a block version whose field holds plain text where the version before
 * held rich text.
 */
export const plainText = (value: Schema.Json) =>
  richTextLines(Schema.decodeUnknownSync(RichTextDocument)(value)).join("\n");
