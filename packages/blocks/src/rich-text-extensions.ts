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

import type { RichTextDocument, RichTextMark, RichTextNode } from "./rich-text.ts";

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
