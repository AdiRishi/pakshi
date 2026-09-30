import { MarkdownManager } from "@tiptap/markdown";
import { Result, SchemaIssue, SchemaParser } from "effect";
import type { Token, Tokens } from "marked";

import type { RichTextField } from "./fields.ts";
import { richTextExtensions, toJsonContent } from "./rich-text-extensions.ts";
import { type RichTextDocument, type RichTextMark, type RichTextNode } from "./rich-text.ts";

/*
 * The agent reads and writes rich text as Markdown. TipTap's converter drops
 * syntax whose extension isn't installed, so a field's Markdown is checked
 * token by token first, and syntax the field doesn't allow is refused rather
 * than lost.
 */

const everyMark: ReadonlyArray<RichTextMark> = ["bold", "italic", "link"];
const everyNode: ReadonlyArray<RichTextNode> = ["heading", "bulletList", "orderedList"];

const writer = new MarkdownManager({ extensions: richTextExtensions(everyMark, everyNode) });

const readers = new WeakMap<RichTextField, MarkdownManager>();

const readerFor = (field: RichTextField) => {
  let reader = readers.get(field);
  if (reader === undefined) {
    reader = new MarkdownManager({ extensions: richTextExtensions(field.marks, field.nodes) });
    readers.set(field, reader);
  }
  return reader;
};

/** A rich text value as the Markdown the agent reads. */
export const richTextToMarkdown = (document: RichTextDocument) =>
  writer.serialize(toJsonContent(document)).trim();

/** What a field's Markdown may use, in words the agent can act on. */
export const markdownAllowed = (field: Pick<RichTextField, "marks" | "nodes">) =>
  [
    "paragraphs separated by a blank line",
    "a line break as two spaces before a newline",
    ...(field.marks.includes("bold") ? ["**bold**"] : []),
    ...(field.marks.includes("italic") ? ["*italic*"] : []),
    ...(field.marks.includes("link") ? ["[links](https://example.org)"] : []),
    ...(field.nodes.includes("heading") ? ["## and ### headings"] : []),
    ...(field.nodes.includes("bulletList") ? ["- bulleted lists, one level"] : []),
    ...(field.nodes.includes("orderedList") ? ["1. numbered lists, one level"] : []),
  ].join(", ");

// marked's token union includes a generic token for extensions' own types,
// so its own types are told apart by more than their names.
const isHeading = (token: Token): token is Tokens.Heading =>
  token.type === "heading" && "depth" in token;
const isList = (token: Token): token is Tokens.List =>
  token.type === "list" && Array.isArray(token.items);

/** The inline tokens a field's Markdown may hold, and the mark each needs, if any. */
const inlineMarks = new Map<string, RichTextMark | null>([
  ["text", null],
  ["escape", null],
  ["br", null],
  ["strong", "bold"],
  ["em", "italic"],
  ["link", "link"],
]);

/** The syntax in a list of tokens that a field doesn't allow, described. */
const refusedIn = (
  field: Pick<RichTextField, "marks" | "nodes">,
  tokens: ReadonlyArray<Token>,
  inList: boolean,
): ReadonlyArray<string> =>
  tokens.flatMap((token): ReadonlyArray<string> => {
    const inline = (children: ReadonlyArray<Token> | undefined) =>
      refusedInline(field, children ?? []);
    switch (token.type) {
      case "space":
        return [];
      case "paragraph":
      case "text":
        return inline(token.tokens);
      case "heading": {
        if (!isHeading(token)) return [describe(token.type)];
        const heading = token;
        if (!field.nodes.includes("heading")) return ["headings"];
        if (heading.depth !== 2 && heading.depth !== 3) return [`level ${heading.depth} headings`];
        return inline(heading.tokens);
      }
      case "list": {
        if (!isList(token)) return [describe(token.type)];
        const list = token;
        if (inList) return ["lists inside lists"];
        const node = list.ordered ? "orderedList" : "bulletList";
        if (!field.nodes.includes(node))
          return [list.ordered ? "numbered lists" : "bulleted lists"];
        return list.items.flatMap((item) => refusedIn(field, item.tokens, true));
      }
      default:
        return [describe(token.type)];
    }
  });

const refusedInline = (
  field: Pick<RichTextField, "marks">,
  tokens: ReadonlyArray<Token>,
): ReadonlyArray<string> =>
  tokens.flatMap((token): ReadonlyArray<string> => {
    const mark = inlineMarks.get(token.type);
    if (mark === undefined) return [describe(token.type)];
    if (mark !== null && !field.marks.includes(mark)) return [describe(token.type)];
    return "tokens" in token && token.tokens !== undefined
      ? refusedInline(field, token.tokens)
      : [];
  });

const tokenNames = new Map([
  ["strong", "bold text"],
  ["em", "italic text"],
  ["link", "links"],
  ["codespan", "code"],
  ["code", "code blocks"],
  ["blockquote", "quotes"],
  ["hr", "horizontal rules"],
  ["image", "images"],
  ["html", "HTML"],
  ["table", "tables"],
  ["del", "struck-out text"],
]);

const describe = (type: string) => tokenNames.get(type) ?? type;

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/**
 * A field's rich text value from the agent's Markdown, or why the Markdown
 * doesn't fit the field.
 */
export const richTextFromMarkdown = (
  field: RichTextField,
  markdown: string,
): Result.Result<RichTextDocument, string> => {
  const reader = readerFor(field);
  const refused = Array.from(new Set(refusedIn(field, reader.instance.lexer(markdown), false)));
  if (refused.length > 0)
    return Result.fail(
      `${field.title} can't hold ${refused.join(", ")}. It allows ${markdownAllowed(field)}.`,
    );
  return SchemaParser.decodeResult(field.draft)(reader.parse(markdown), {
    errors: "all",
  }).pipe(
    Result.mapError((issue) =>
      formatIssues(issue)
        .issues.map((found) => found.message)
        .join("; "),
    ),
  );
};
