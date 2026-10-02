import {
  collectionFor,
  type Field,
  type Fields,
  placeholderTree,
  richTextLines,
  type SlotSpec,
  withCollections,
} from "@repo/blocks";
import { BlockId, type BlockType, ItemId, type PageId, randomId } from "@repo/contracts/ids";
import type {
  BlockList,
  BlockTree,
  InsertBlock,
  MoveBlock,
  Op,
  PropPath,
} from "@repo/contracts/ops";
import type { BlockInstance, PageDocument } from "@repo/contracts/page";
import { listingsOf } from "@repo/contracts/snapshot";
import { type BlockContracts, blockTree } from "@repo/domain/document";
import { Option, Schema } from "effect";
import type { Json } from "effect/Schema";

/*
 * What the page's structure allows: which lists a block can go in, where a
 * move by one lands, and the ops that insert, move, duplicate and remove
 * blocks. Every function reads the draft as it is and returns ops for the
 * shared document module to apply.
 */

/** A list of blocks on a page, with the blocks in it. */
export interface PlacedList {
  readonly list: BlockList;
  readonly ids: ReadonlyArray<BlockId>;
}

export const sameList = (a: BlockList, b: BlockList) =>
  a === "root" || b === "root" ? a === b : a.block === b.block && a.slot === b.slot;

/**
 * Every list on the page a block of this type can go in, in page order: the
 * top level for a section, or each slot that accepts it for an item.
 */
export const listsFor = (
  page: PageDocument,
  contracts: BlockContracts,
  type: BlockType,
): ReadonlyArray<PlacedList> => {
  const contract = contracts.get(type);
  if (contract?.placement === "section") return [{ list: "root", ids: page.root }];
  if (contract?.placement !== "item") return [];
  return page.root.flatMap((id) => {
    const section = page.blocks[id];
    const sectionContract = section === undefined ? undefined : contracts.get(section.type);
    if (sectionContract?.placement !== "section") return [];
    return Object.entries(sectionContract.slots)
      .filter(([, spec]) => spec.accepts.includes(type))
      .map(([slot]) => ({ list: { block: id, slot }, ids: section?.slots?.[slot] ?? [] }));
  });
};

/** The list a block sits in. */
export const listOf = (page: PageDocument, block: BlockId): PlacedList | undefined => {
  if (page.root.includes(block)) return { list: "root", ids: page.root };
  for (const id of page.root)
    for (const [slot, ids] of Object.entries(page.blocks[id]?.slots ?? {}))
      if (ids.includes(block)) return { list: { block: id, slot }, ids };
  return undefined;
};

/** What a section's slot is called and what it accepts. */
export const slotOf = (
  page: PageDocument,
  contracts: BlockContracts,
  list: Exclude<BlockList, "root">,
): SlotSpec | undefined => {
  const section = page.blocks[list.block];
  const contract = section === undefined ? undefined : contracts.get(section.type);
  return contract?.placement === "section" ? contract.slots[list.slot] : undefined;
};

/**
 * The block types that can go in a list, by title: sections at the top level,
 * and a slot's own item types. A section that shows an entry's details goes
 * only on an entry of its kind.
 */
export const allowedTypes = (
  page: PageDocument,
  contracts: BlockContracts,
  list: BlockList,
): ReadonlyArray<BlockType> => {
  const addable = Array.from(contracts.values()).filter((contract) =>
    list === "root"
      ? contract.placement === "section" &&
        (contract.entryOf === null || (page.type === "entry" && page.kind === contract.entryOf))
      : contract.placement === "item" &&
        listsFor(page, contracts, contract.type).some((candidate) =>
          sameList(candidate.list, list),
        ),
  );
  return addable
    .toSorted((a, b) => a.title.localeCompare(b.title))
    .map((contract) => contract.type);
};

/**
 * A new block of this type for a page, with its placeholder content. A
 * listing in it shows the collection `collectionFor` picks for the page.
 */
export const newBlock = (
  contracts: BlockContracts,
  pages: Readonly<Record<PageId, PageDocument>>,
  page: PageId,
  type: BlockType,
): BlockTree => {
  const listings = listingsOf(pages);
  return withCollections(placeholderTree(contracts, type), contracts, (kind) =>
    collectionFor(listings, page, kind),
  );
};

/** Inserts a new block of this type, as `newBlock` makes it, after `after` in a list. */
export const insertOp = (
  contracts: BlockContracts,
  pages: Readonly<Record<PageId, PageDocument>>,
  page: PageId,
  list: BlockList,
  after: BlockId | null,
  type: BlockType,
): InsertBlock => ({
  op: "insertBlock",
  page,
  list,
  after,
  block: newBlock(contracts, pages, page, type),
});

/**
 * Moves a block to follow `after` in a list, or to its start when `after` is
 * null. Returns undefined when the list can't hold the block or the block is
 * already there.
 */
export const moveOp = (
  page: PageDocument,
  contracts: BlockContracts,
  block: BlockId,
  list: BlockList,
  after: BlockId | null,
): MoveBlock | undefined => {
  const type = page.blocks[block]?.type;
  const current = listOf(page, block);
  if (type === undefined || current === undefined || after === block) return undefined;
  const target = listsFor(page, contracts, type).find((candidate) =>
    sameList(candidate.list, list),
  );
  if (target === undefined || (after !== null && !target.ids.includes(after))) return undefined;
  const index = current.ids.indexOf(block);
  if (sameList(current.list, list) && (current.ids[index - 1] ?? null) === after) return undefined;
  return { op: "moveBlock", page: page.id, block, list, after };
};

/**
 * Moves a block one place up or down. An item at either end of its slot
 * moves into the nearest slot before or after it that accepts it, which may
 * be in another section. Returns undefined at the ends of the page.
 */
export const moveByOne = (
  page: PageDocument,
  contracts: BlockContracts,
  block: BlockId,
  direction: "up" | "down",
): MoveBlock | undefined => {
  const type = page.blocks[block]?.type;
  if (type === undefined) return undefined;
  const lists = listsFor(page, contracts, type);
  const at = lists.findIndex((candidate) => candidate.ids.includes(block));
  const current = lists[at];
  if (current === undefined) return undefined;
  const index = current.ids.indexOf(block);
  const move = (list: BlockList, after: BlockId | null) =>
    moveOp(page, contracts, block, list, after);
  if (direction === "up") {
    if (index > 0) return move(current.list, current.ids[index - 2] ?? null);
    const previous = lists[at - 1];
    return previous === undefined ? undefined : move(previous.list, previous.ids.at(-1) ?? null);
  }
  const next = current.ids[index + 1];
  if (next !== undefined) return move(current.list, next);
  const following = lists[at + 1];
  return following === undefined ? undefined : move(following.list, null);
};

/** The other lists an item can move to, where it lands at the end. Sections have none. */
export const moveDestinations = (
  page: PageDocument,
  contracts: BlockContracts,
  block: BlockId,
): ReadonlyArray<PlacedList> => {
  const type = page.blocks[block]?.type;
  const current = listOf(page, block);
  if (type === undefined || current === undefined || current.list === "root") return [];
  return listsFor(page, contracts, type).filter(
    (candidate) => !sameList(candidate.list, current.list),
  );
};

/** A copy of a block and its items, with new IDs, placed right after it. */
export const duplicateOp = (page: PageDocument, block: BlockId): InsertBlock | undefined => {
  const position = listOf(page, block);
  if (position === undefined) return undefined;
  const tree = blockTree(page, block);
  const newId = () => BlockId.make(randomId("b"));
  return {
    op: "insertBlock",
    page: page.id,
    list: position.list,
    after: block,
    block: {
      ...tree,
      id: newId(),
      ...(tree.slots !== undefined && {
        slots: Object.fromEntries(
          Object.entries(tree.slots).map(([slot, items]) => [
            slot,
            items.map((item) => ({ ...item, id: newId() })),
          ]),
        ),
      }),
    },
  };
};

export const removeOp = (page: PageId, block: BlockId): Op => ({
  op: "removeBlock",
  page,
  block,
});

/** The kinds of field edited in place on the page, rather than in the settings panel. */
const inPlace: ReadonlySet<Field["kind"]> = new Set(["text", "richText", "media", "cta"]);

const isJsonList = Schema.is(Schema.Array(Schema.JsonObject));
const isItemId = Schema.is(ItemId);

/**
 * The first field of a block that's edited in place and has a value, as a
 * path: a field of the block itself, or of the first list item that has one.
 */
export const firstFieldInPlace = (
  fields: Fields,
  props: Readonly<Record<string, Json>>,
): PropPath | undefined => {
  for (const [name, field] of Object.entries(fields)) {
    const value = props[name];
    if (value === undefined) continue;
    if (inPlace.has(field.kind)) return [name];
    if (field.kind !== "list" || !isJsonList(value)) continue;
    for (const item of value) {
      const id = item["id"];
      const path = isItemId(id) ? firstFieldInPlace(field.item, item) : undefined;
      if (isItemId(id) && path !== undefined) return [name, id, ...path];
    }
  }
  return undefined;
};

// Labels -------------------------------------------------------------------

/** A field's value decoded with its own schema, summarized, or undefined if it doesn't decode. */
const summarize = <F extends Field>(
  field: F,
  value: Json,
  summary: (decoded: F["draft"]["Type"]) => string | undefined,
) =>
  Option.match(Schema.decodeOption(field.draft)(value), {
    onNone: () => undefined,
    onSome: summary,
  });

/**
 * A field's one-line summary of its value, which names its block in the
 * outline. Each field kind supplies one: adding a field builder without one
 * fails typecheck.
 */
const fieldSummary = (field: Field, value: Json): string | undefined => {
  switch (field.kind) {
    case "text":
      return summarize(field, value, (text) => text);
    case "richText":
      return summarize(field, value, (document) =>
        richTextLines(document).find((line) => line.trim() !== ""),
      );
    case "media":
      return summarize(field, value, (image) => image.alt);
    case "cta":
      return summarize(field, value, (button) => button.label);
    case "link":
    case "form":
    case "list":
    case "collection":
    case "number":
    case "choice":
    case "icon":
      return undefined;
  }
};

/** What the outline and announcements call a block: its first filled-in field, or its type's title. */
export const blockLabel = (contracts: BlockContracts, block: BlockInstance) => {
  const contract = contracts.get(block.type);
  if (contract === undefined) return block.type;
  for (const [name, field] of Object.entries(contract.fields)) {
    const value = block.props[name];
    const summary = value === undefined ? undefined : fieldSummary(field, value)?.trim();
    if (summary !== undefined && summary !== "")
      return summary.length > 60 ? `${summary.slice(0, 59)}…` : summary;
  }
  return contract.title;
};
