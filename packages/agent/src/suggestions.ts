import { RichTextDocument } from "@repo/blocks";
import type { Field } from "@repo/blocks/fields";
import { richTextFromMarkdown, richTextToMarkdown } from "@repo/blocks/markdown";
import { Effect, Option, Result, Schema, Stream } from "effect";
import { LanguageModel, type Prompt } from "effect/ai";

/*
 * Suggestions a person accepts or not: alt text for an image, and a merged
 * value for a text field both sides of an update changed.
 */

type Json = Schema.Json;

const isRichText = Schema.is(RichTextDocument);
const isString = Schema.is(Schema.String);

/** The most alt text a placement holds. */
const altTextLimit = 250;

/** A model's whole answer, streamed as every call is. */
const answer = (prompt: Prompt.RawInput) =>
  LanguageModel.streamText({ prompt }).pipe(
    Stream.filterMap((part) =>
      part.type === "text-delta" ? Result.succeed(part.delta) : Result.failVoid,
    ),
    Stream.mkString,
    Effect.map((text) => text.trim().replace(/^["“]|["”]$/g, "")),
  );

/**
 * Alt text for an image where it's placed, or none when the model gives
 * nothing that fits. `where` says where it's placed, such as "the hero of
 * the Visit page, headed Plan your visit".
 */
export const suggestAltText = Effect.fn("Agent.suggestAltText")(function* (
  image: { readonly data: Uint8Array; readonly mediaType: string },
  where: string,
) {
  const text = yield* answer([
    {
      role: "system",
      content: `You write alt text for images on websites. Describe what a visitor who can't see the image needs to know, in one plain sentence of at most ${altTextLimit} characters. Don't start with "Image of" or "Photo of". Reply with the alt text only.`,
    },
    {
      role: "user",
      content: [
        { type: "text", text: `The image is in ${where}.` },
        { type: "file", mediaType: image.mediaType, data: image.data },
      ],
    },
  ]);
  if (text !== "" && text.length <= altTextLimit) return Option.some(text);
  yield* Effect.logInfo("The model's alt text didn't fit", { text });
  return Option.none<string>();
});

/** A text or rich text value, as the model reads it. */
const asText = (value: Json | undefined) =>
  value === undefined
    ? "(empty)"
    : isRichText(value)
      ? richTextToMarkdown(value)
      : isString(value)
        ? value
        : JSON.stringify(value);

/**
 * A merged value for a text or rich text field both sides changed, or none
 * when the model gives nothing the field takes.
 */
export const suggestMerge = Effect.fn("Agent.suggestMerge")(function* (
  field: Extract<Field, { readonly kind: "text" | "richText" }>,
  sides: {
    readonly base?: Json | undefined;
    readonly draft?: Json | undefined;
    readonly live?: Json | undefined;
  },
) {
  const form =
    field.kind === "text"
      ? `plain text of at most ${field.max} characters${field.multiline ? "" : " on one line"}`
      : "Markdown using only the formatting the versions use";
  const text = yield* answer([
    {
      role: "system",
      content: `Two people changed the same ${field.title} of a web page from the same starting text. Write one version that keeps what each of them meant to change. Reply with ${form}, and nothing else.`,
    },
    {
      role: "user",
      content: `Starting text:\n${asText(sides.base)}\n\nFirst person's version:\n${asText(sides.draft)}\n\nSecond person's version:\n${asText(sides.live)}`,
    },
  ]);
  const merged: Option.Option<Json> =
    field.kind === "richText"
      ? Result.getSuccess(richTextFromMarkdown(field, text))
      : Option.filter(Option.some(text), (value) => Schema.is(field.draft)(value) && value !== "");
  return merged;
});
