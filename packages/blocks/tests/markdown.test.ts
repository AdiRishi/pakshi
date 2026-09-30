import { Result } from "effect";
import { describe, expect, test } from "vitest";

import { richText } from "../src/fields.ts";
import { richTextFromMarkdown, richTextToMarkdown } from "../src/markdown.ts";

const body = richText({
  title: "Text",
  marks: ["bold", "italic", "link"],
  nodes: ["heading", "bulletList"],
});
const plain = richText({ title: "Intro", marks: ["bold"] });

const read = (field: typeof body, markdown: string) =>
  Result.getOrThrow(richTextFromMarkdown(field, markdown));

describe("the agent's Markdown", () => {
  test("becomes the rich text it describes, and back", () => {
    const markdown =
      "## Visit\n\nOpen **every day** at [the library](https://example.org).\n\n- Books\n- Talks";
    const document = read(body, markdown);
    expect(document.content.map((node) => node.type)).toEqual([
      "heading",
      "paragraph",
      "bulletList",
    ]);
    expect(richTextToMarkdown(document)).toBe(markdown);
  });

  test("with syntax the field doesn't allow is refused, not dropped", () => {
    const refused = richTextFromMarkdown(body, "> A quote\n\n1. First\n\n`code`");
    expect(Result.isFailure(refused) && refused.failure).toMatch(
      /^Text can't hold quotes, numbered lists, code\. It allows /,
    );
    expect(Result.isFailure(richTextFromMarkdown(plain, "## Heading\n\n*soft*"))).toBe(true);
    expect(Result.isFailure(richTextFromMarkdown(body, "# Too big"))).toBe(true);
  });

  test("with a link to an unsafe address is refused", () => {
    expect(Result.isFailure(richTextFromMarkdown(body, "[go](javascript:alert(1))"))).toBe(true);
  });
});
