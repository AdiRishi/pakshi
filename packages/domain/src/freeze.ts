import type { BlockContract } from "@repo/blocks/contract";
import { type Field, type Fields, propsSchema } from "@repo/blocks/fields";
import { placeholderMedia } from "@repo/blocks/placeholders";
import type { SiteContent } from "@repo/contracts/draft";
import { BlockId, type MediaId } from "@repo/contracts/ids";
import type { Place } from "@repo/contracts/merge";
import type { Target } from "@repo/contracts/ops";
import type { BlockInstance, PageDocument, PagePath } from "@repo/contracts/page";
import type { Incomplete } from "@repo/contracts/publishing";
import { MediaRef } from "@repo/contracts/references";
import type { SnapshotManifest } from "@repo/contracts/snapshot";
import { Predicate, Schema, SchemaIssue, SchemaParser } from "effect";
import type { Json } from "effect/Schema";

import type { BlockContracts } from "./document.ts";

/*
 * Freezing turns a draft into what a snapshot holds. Drafts may be
 * incomplete while people work on them; a frozen draft may not, so every
 * block is checked against its version's complete schema first.
 */

/** A draft ready to be written as a snapshot. */
export interface Frozen {
  /** The pages the snapshot serves: every page that isn't unpublished. */
  readonly pages: ReadonlyArray<PageDocument>;
  /** Addresses that answer 410 Gone: ones served before and not now, and ones gone already. */
  readonly gone: ReadonlyArray<PagePath>;
  /** The library images the snapshot shows. Built-in placeholder images need no file. */
  readonly media: ReadonlyArray<MediaId>;
}

export type FreezeResult =
  | { readonly ok: true; readonly frozen: Frozen }
  | { readonly ok: false; readonly incomplete: ReadonlyArray<Incomplete> };

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

const completeSchemas = new WeakMap<BlockContract, Schema.Decoder<unknown>>();

const completeSchema = (contract: BlockContract) => {
  let schema = completeSchemas.get(contract);
  if (schema === undefined) {
    schema = propsSchema(contract.fields, "complete");
    completeSchemas.set(contract, schema);
  }
  return schema;
};

const isMediaRef = Schema.is(MediaRef);
const isJsonObject = Schema.is(Schema.JsonObject);

/** A path from a schema issue, with list positions turned into the IDs of the items there. */
const propPath = (
  fields: Fields,
  props: BlockInstance["props"],
  issuePath: ReadonlyArray<string | number>,
): ReadonlyArray<string> => {
  const [name, index, ...rest] = issuePath;
  if (name === undefined) return [];
  const value = props[String(name)];
  const field = fields[String(name)];
  if (field?.kind !== "list" || !Predicate.isNumber(index) || !Array.isArray(value))
    return [name, index, ...rest].flatMap((key) => (key === undefined ? [] : [String(key)]));
  const item = value[index];
  const id = item !== undefined && isJsonObject(item) ? item["id"] : undefined;
  return [String(name), String(id), ...rest.map(String)];
};

const incompleteIn = (
  contracts: BlockContracts,
  place: Place,
  id: BlockId,
  block: BlockInstance,
): ReadonlyArray<Incomplete> => {
  const contract = contracts.get(block.type);
  if (contract === undefined) throw new Error(`The lockfile pins no version of ${block.type}.`);
  const result = SchemaParser.decodeResult(completeSchema(contract))(block.props, {
    errors: "all",
  });
  if (result._tag === "Success") return [];
  return formatIssues(result.failure).issues.map((issue) => {
    const path = propPath(
      contract.fields,
      block.props,
      (issue.path ?? []).map((key) =>
        Predicate.isNumber(key) ? key : String(Predicate.isObject(key) ? key.key : key),
      ),
    );
    const [name = ""] = path;
    return {
      place,
      block: { id, title: contract.title },
      path,
      field: contract.fields[name]?.title ?? contract.title,
      message: issue.message,
    };
  });
};

/** The library images a field's value shows. */
const mediaIn = (field: Field, value: Json | undefined): ReadonlyArray<MediaId> => {
  if (value === undefined) return [];
  if (field.kind === "media") return isMediaRef(value) ? [value.id] : [];
  if (field.kind !== "list" || !Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isJsonObject(item)
      ? Object.entries(field.item).flatMap(([name, itemField]) => mediaIn(itemField, item[name]))
      : [],
  );
};

/**
 * Freezes a draft's content, or lists every field still incomplete.
 * `previous` is the manifest of the release now live, whose addresses stay
 * gone unless a page serves them again.
 */
export const freeze = (
  content: SiteContent,
  contracts: BlockContracts,
  previous: Pick<SnapshotManifest, "pages" | "gone">,
): FreezeResult => {
  const pages = Object.values(content.pages).filter((page) => page.status !== "unpublished");
  const placed: ReadonlyArray<{
    readonly target: Target;
    readonly title: string;
    readonly blocks: Readonly<Record<BlockId, BlockInstance>>;
  }> = [
    { target: "site", title: "Header and footer", blocks: content.parts.blocks },
    ...pages.map((page) => ({
      target: page.id,
      title: page.meta.title || page.path,
      blocks: page.blocks,
    })),
  ];
  const incomplete = placed.flatMap(({ target, title, blocks }) =>
    Object.entries(blocks).flatMap(([id, block]) =>
      incompleteIn(contracts, { target, title }, BlockId.make(id), block),
    ),
  );
  if (incomplete.length > 0) return { ok: false, incomplete };

  const served = new Set<string>(pages.map((page) => page.path));
  const gone = Array.from(
    new Set([...previous.gone, ...previous.pages.map((page) => page.path)]),
  ).filter((path) => !served.has(path));
  const media = new Set<MediaId>();
  for (const { blocks } of placed)
    for (const block of Object.values(blocks)) {
      const fields = contracts.get(block.type)?.fields ?? {};
      for (const [name, field] of Object.entries(fields))
        for (const id of mediaIn(field, block.props[name])) media.add(id);
    }
  for (const page of pages)
    if (page.type === "post" && page.meta.cover) media.add(page.meta.cover.id);
  for (const id of placeholderMedia.keys()) media.delete(id);
  return { ok: true, frozen: { pages, gone, media: Array.from(media) } };
};
