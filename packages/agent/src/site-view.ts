import { richTextLines, RichTextDocument } from "@repo/blocks";
import type { Field, Fields } from "@repo/blocks/fields";
import { collectionKinds, entriesOf } from "@repo/contracts/collections";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, PageId } from "@repo/contracts/ids";
import type { Focus } from "@repo/contracts/live";
import type { Target } from "@repo/contracts/ops";
import { type BlockInstance, type PageDocument, pageName } from "@repo/contracts/page";
import { addressOf } from "@repo/contracts/snapshot";
import type { BlockContracts } from "@repo/domain/document";
import type { Surface } from "@repo/tokens";
import { Schema } from "effect";

import { agentProps } from "./content.ts";
import type { TypingIn } from "./workspace.ts";

/*
 * The draft as the agent reads it: an outline of every page, one line per
 * section, and a page's full content in the agent's form.
 */

type Collection = Extract<PageDocument, { readonly type: "collection" }>;

/** How many of a blog's newest posts the outline names; get_page names them all. */
const postsInOutline = 20;

type Json = Schema.Json;

const isRichText = Schema.is(RichTextDocument);
const isString = Schema.is(Schema.String);

/** The words in a text or rich text field. */
const fieldText = (field: Field, value: Json | undefined) => {
  if (field.kind === "text" && isString(value)) return value.trim();
  if (field.kind === "richText" && isRichText(value))
    return richTextLines(value)
      .map((line) => line.trim())
      .filter((line) => line !== "")
      .join(" ");
  return "";
};

const shorten = (text: string, length: number) =>
  text.length > length ? `${text.slice(0, length - 1)}…` : text;

/** A block's first field with words, by its path, to recognise the block by. */
const firstText = (fields: Fields, props: Readonly<Record<string, Json>>) => {
  for (const [name, field] of Object.entries(fields)) {
    const text = fieldText(field, props[name]);
    if (text !== "") return `${name} "${shorten(text, 60)}"`;
  }
  return "";
};

const blockLine = (contracts: BlockContracts, id: BlockId, block: BlockInstance) => {
  const contract = contracts.get(block.type);
  const look = [block.variant, block.surface].filter((part) => part !== undefined).join(", ");
  const text = contract === undefined ? "" : firstText(contract.fields, block.props);
  return `${id} ${block.type} (${look})${text === "" ? "" : `: ${text}`}`;
};

/** A field's value in brief, as the agent reads it. */
const fieldSummary = (field: Field, value: Json | undefined) => {
  if (value === undefined) return "empty";
  if (field.kind === "list" && Array.isArray(value))
    return value.length === 1 ? "1 item" : `${value.length} items`;
  if (field.kind === "text" || field.kind === "richText") {
    const text = fieldText(field, value);
    return text === "" ? "empty" : `"${shorten(text, 80)}"`;
  }
  return shorten(JSON.stringify(value), 80);
};

/**
 * The block a person has selected, with each of its fields by path beside the
 * name people see in Studio, since a block and its field can share a name, as
 * the Text block and its Text field do. Null when the block is gone from the
 * draft.
 */
export const selectedBlock = (draft: Draft, contracts: BlockContracts, focus: Focus) => {
  const holder = focus.target === "site" ? draft.parts : draft.pages[focus.target];
  const block = holder?.blocks[focus.block];
  const contract = block === undefined ? undefined : contracts.get(block.type);
  if (block === undefined || contract === undefined) return null;
  return [
    `Selected: ${focus.block}, a ${contract.title} block (${block.type}). Its fields by path, with the names people see:`,
    ...Object.entries(contract.fields).map(
      ([name, field]) => `  ${name} "${field.title}": ${fieldSummary(field, block.props[name])}`,
    ),
    ...(focus.path === undefined ? [] : [`Their cursor is in ${focus.path.join(".")}.`]),
  ].join("\n");
};

const status = (page: PageDocument) => (page.status === "unpublished" ? " (unpublished)" : "");

/** What a collection's kind calls `count` of its entries, such as "posts". */
const entryNoun = (collection: Collection, count: number) => {
  const { names } = collectionKinds[collection.kind];
  return count === 1 ? names.one : names.many;
};

/** A page's line in the outline, and for a collection, its entries' lines after its sections'. */
const pageLines = (draft: Draft, contracts: BlockContracts, page: PageDocument) => {
  const recipe = page.recipe === undefined ? "" : ` recipe ${page.recipe}`;
  const name = `${addressOf(draft.pages, page)} "${pageName(page)}"${status(page)}${recipe}`;
  const sections = page.root.flatMap((id) => {
    const block = page.blocks[id];
    if (block === undefined) return [];
    const items = Object.entries(block.slots ?? {}).flatMap(([slot, ids]) =>
      ids.length === 0 ? [] : [`      ${slot}: ${ids.length} items`],
    );
    return [`  ${blockLine(contracts, id, block)}`, ...items];
  });
  if (page.type !== "collection") return [`${page.id} ${page.type} ${name}`, ...sections];
  const entries = entriesOf(Object.values(draft.pages), page);
  const older = entries.length - postsInOutline;
  return [
    `${page.id} collection(${page.kind}) ${name} — ${entries.length} ${entryNoun(page, entries.length)}`,
    ...sections,
    ...entries
      .slice(0, postsInOutline)
      .map(
        (entry) =>
          `  ${entry.id} entry(${entry.kind}) ${addressOf(draft.pages, entry)} "${pageName(entry)}" ${entry.meta.date}${status(entry)}`,
      ),
    ...(older > 0
      ? [`  and ${older} older ${entryNoun(page, older)}, which get_page ${page.id} lists`]
      : []),
  ];
};

/**
 * Every page of the draft and each section on it, one line each, with the
 * header and footer first. A collection's newest entries follow it, one line
 * each.
 */
export const outline = (draft: Draft, contracts: BlockContracts) => {
  const site = [draft.parts.header, draft.parts.footer].flatMap((id) => {
    const block = draft.parts.blocks[id];
    return block === undefined ? [] : [`  ${blockLine(contracts, id, block)}`];
  });
  const pages = Object.values(draft.pages)
    .filter((page) => page.type !== "entry")
    .toSorted((a, b) => addressOf(draft.pages, a).localeCompare(addressOf(draft.pages, b)))
    .flatMap((page) => pageLines(draft, contracts, page));
  return [
    "site (header and footer)",
    ...site,
    ...pages,
    `Forms: ${
      Object.entries(draft.forms)
        .map(([id, form]) => `${id} "${form.name}"`)
        .join(", ") || "none"
    }`,
  ].join("\n");
};

const typingNote = (typing: ReadonlyArray<TypingIn>, target: Target, block: BlockId) =>
  typing
    .filter((field) => field.target === target && field.block === block)
    .map((field) => ({
      field: field.path ?? [],
      person: field.person.name,
      note: "is typing here: leave it alone",
    }));

/** A placed block as the agent reads it, with its items and anyone typing in it. */
type BlockView = {
  readonly id: BlockId;
  readonly type: string;
  readonly variant: string;
  readonly props: Readonly<Record<string, Json>>;
  surface?: Surface;
  items?: Readonly<Record<string, ReadonlyArray<Json>>>;
  typing?: ReturnType<typeof typingNote>;
};

const blockView = (
  contracts: BlockContracts,
  holder: { readonly blocks: Readonly<Record<BlockId, BlockInstance>> },
  target: Target,
  id: BlockId,
  typing: ReadonlyArray<TypingIn>,
): Json => {
  const block = holder.blocks[id];
  if (block === undefined) return { id, missing: true };
  const contract = contracts.get(block.type);
  const fields = contract?.fields ?? {};
  const items = Object.fromEntries(
    Object.entries(block.slots ?? {}).map(([slot, ids]) => [
      slot,
      ids.map((item) => blockView(contracts, holder, target, item, typing)),
    ]),
  );
  const view: BlockView = {
    id,
    type: block.type,
    variant: block.variant,
    props: agentProps(fields, block.props),
  };
  if (block.surface !== undefined) view.surface = block.surface;
  if (Object.keys(items).length > 0) view.items = items;
  const typingHere = typingNote(typing, target, id);
  if (typingHere.length > 0) view.typing = typingHere;
  return view;
};

/**
 * A page as `get_page` gives it, with every section or the ones chosen, or
 * for "site", the header and footer with the menus, redirects and forms.
 */
export const pageView = (
  draft: Draft,
  contracts: BlockContracts,
  target: Target,
  blocks: ReadonlyArray<BlockId> | undefined,
  typing: ReadonlyArray<TypingIn>,
): Json | null => {
  // Models often send an empty list for "all of them".
  const chosen = (ids: ReadonlyArray<BlockId>) =>
    blocks === undefined || blocks.length === 0 ? ids : ids.filter((id) => blocks.includes(id));
  if (target === "site")
    return {
      target: "site",
      sections: chosen([draft.parts.header, draft.parts.footer]).map((id) =>
        blockView(contracts, draft.parts, "site", id, typing),
      ),
      menus: draft.parts.menus,
      redirects: draft.redirects,
      forms: Object.values(draft.forms),
    };
  const page = draft.pages[target];
  if (page === undefined) return null;
  const common = {
    id: page.id,
    type: page.type,
    path: addressOf(draft.pages, page),
    status: page.status ?? "published",
    meta: page.meta,
    sections: chosen(page.root).map((id) => blockView(contracts, page, target, id, typing)),
  };
  switch (page.type) {
    case "page":
      return common;
    case "collection":
      return {
        ...common,
        kind: page.kind,
        entries: entriesOf(Object.values(draft.pages), page).map((entry) => ({
          id: entry.id,
          path: addressOf(draft.pages, entry),
          title: pageName(entry),
          date: entry.meta.date,
          status: entry.status ?? "published",
        })),
      };
    case "entry":
      return { ...common, kind: page.kind, collection: page.collection, slug: page.slug };
  }
};

/** The page a block is on, or null when no page holds it. */
export const pageOf = (draft: Draft, block: BlockId): PageId | null =>
  Object.values(draft.pages).find((page) => block in page.blocks)?.id ?? null;
