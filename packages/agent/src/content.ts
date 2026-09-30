import { RichTextDocument } from "@repo/blocks";
import type { BlockContract } from "@repo/blocks/contract";
import { type Field, type Fields, fieldParts } from "@repo/blocks/fields";
import { markdownAllowed, richTextFromMarkdown, richTextToMarkdown } from "@repo/blocks/markdown";
import { ItemId, randomId } from "@repo/contracts/ids";
import { Array as Arr, Result, Schema } from "effect";

/*
 * Block content as the agent reads and writes it. It's the stored content
 * with two differences: rich text is Markdown, and a new list item may leave
 * out its ID, which the agent's side gives it. Everything else, including the
 * field's own limits, is checked by the document module when the batch
 * commits.
 */

type Json = Schema.Json;

const isRichText = Schema.is(RichTextDocument);
const isItemId = Schema.is(ItemId);
const isJsonObject = Schema.is(Schema.JsonObject);
const isString = Schema.is(Schema.String);

/** A field's stored value as the agent reads it. */
export const agentValue = (field: Field, value: Json): Json => {
  if (field.kind === "richText") return isRichText(value) ? richTextToMarkdown(value) : value;
  if (field.kind === "list" && Array.isArray(value))
    return value.map((item) => (isJsonObject(item) ? agentProps(field.item, item) : item));
  return value;
};

/** A block's stored props as the agent reads them. */
export const agentProps = (fields: Fields, props: Readonly<Record<string, Json>>) =>
  Object.fromEntries(
    Object.entries(props).map(([name, value]) => {
      const field = fields[name];
      return [name, field === undefined ? value : agentValue(field, value)];
    }),
  );

/** A problem with the agent's content, at a path into the block's props. */
export interface ContentProblem {
  readonly path: ReadonlyArray<string>;
  readonly message: string;
}

const problem = (path: ReadonlyArray<string>, message: string) =>
  Result.fail<ContentProblem>({ path, message });

/** A field's value from the agent's form to the stored one. */
export const storedValue = (
  field: Field,
  value: Json,
  path: ReadonlyArray<string>,
): Result.Result<Json, ContentProblem> => {
  if (field.kind === "richText") {
    if (!isString(value))
      return problem(path, `Write ${field.title} as Markdown text: ${markdownAllowed(field)}.`);
    return Result.mapError(richTextFromMarkdown(field, value), (message) => ({ path, message }));
  }
  if (field.kind !== "list") return Result.succeed(value);
  if (!Array.isArray(value)) return problem(path, `${field.title} is a list of items.`);
  return Result.all(
    value.map((item, index) => {
      if (!isJsonObject(item)) return problem([...path, String(index)], "Each item is an object.");
      const { id, ...props } = item;
      const itemId = isItemId(id) ? id : ItemId.make(randomId("it"));
      return Result.map(storedProps(field.item, props, [...path, itemId]), (stored) => ({
        id: itemId,
        ...stored,
      }));
    }),
  );
};

/** A block's props from the agent's form to the stored one. */
export const storedProps = (
  fields: Fields,
  props: Readonly<Record<string, Json>>,
  path: ReadonlyArray<string> = [],
): Result.Result<Readonly<Record<string, Json>>, ContentProblem> =>
  Result.map(
    Result.all(
      Object.entries(props).map(([name, value]) => {
        const field = fields[name];
        return field === undefined
          ? Result.succeed([name, value] as const)
          : Result.map(
              storedValue(field, value, [...path, name]),
              (stored) => [name, stored] as const,
            );
      }),
    ),
    (entries) => Object.fromEntries(entries),
  );

/** How one field reads in a block's contract for the agent. */
const describeField = (field: Field): Json => {
  const base = { kind: field.kind, title: field.title, required: !field.optional };
  switch (field.kind) {
    case "text":
      return { ...base, max: field.max, min: field.min, multiline: field.multiline };
    case "richText":
      return { ...base, markdown: markdownAllowed(field) };
    case "link":
      return {
        ...base,
        value: 'an https address, or {"$ref": "page", "id": "pg_…"} for a page of the site',
      };
    case "form":
      return { ...base, value: '{"$ref": "form", "id": "frm_…"}, one of the site\'s forms' };
    case "media":
      return {
        ...base,
        value:
          '{"$ref": "media", "id": "med_…", "alt": "…"}. Reuse an image already in the draft; people add new ones',
        parts: describeFields(fieldParts(field)),
      };
    case "cta":
      return { ...base, parts: describeFields(fieldParts(field)) };
    case "list":
      return {
        ...base,
        max: field.max,
        min: field.min,
        item: describeFields(field.item),
        value: "an array of items; a new item needs no id",
      };
  }
};

const describeFields = (fields: Readonly<Record<string, Field>>): Json =>
  Object.fromEntries(Object.entries(fields).map(([name, field]) => [name, describeField(field)]));

/** A block version's contract, as `get_block_contract` gives it to the agent. */
export const describeContract = (contract: BlockContract): Json => {
  const common = {
    type: contract.type,
    version: contract.version,
    title: contract.title,
    placement: contract.placement,
    purpose: contract.agent.purpose,
    avoid: Arr.fromIterable(contract.agent.avoid ?? []),
    variants: Arr.fromIterable(contract.variants),
    fields: describeFields(contract.fields),
  };
  switch (contract.placement) {
    case "section":
      return {
        ...common,
        surfaces: Arr.fromIterable(contract.surfaces),
        slots: Object.fromEntries(
          Object.entries(contract.slots).map(([name, slot]) => [
            name,
            { title: slot.title, accepts: Arr.fromIterable(slot.accepts) },
          ]),
        ),
        example: agentProps(contract.fields, contract.placeholder.props),
      };
    case "item":
      return { ...common, example: agentProps(contract.fields, contract.placeholder.props) };
    case "header":
    case "footer":
      return { ...common, surfaces: Arr.fromIterable(contract.surfaces) };
  }
};
