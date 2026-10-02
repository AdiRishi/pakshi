import type { BlockContract, Field } from "@repo/blocks";
import { type ExampleSource, placeholderItem } from "@repo/blocks/fixtures";
import type { BlockId } from "@repo/contracts/ids";
import type { BlockList, Op, SetProp, Target } from "@repo/contracts/ops";
import type { PageDocument } from "@repo/contracts/page";
import type { BlockContracts } from "@repo/domain/document";
import { Option, Schema } from "effect";

import { moveOp } from "./structure.ts";

/*
 * Adding, moving and removing the items of a list field, such as an FAQ's
 * questions, and of a section's slot, such as a team's people. A list field
 * is one prop, so each change sets the whole list; a slot holds blocks, which
 * move and go by their own ops. Lists keep between their field's minimum and
 * maximum; slots have no limit.
 */

const ListedItems = Schema.Array(Schema.Struct({ id: Schema.String }));
const decodeItems = Schema.decodeUnknownOption(ListedItems);

/** The IDs of a list field's items, in order. */
export const listIds = (
  props: Readonly<Record<string, Schema.Json>>,
  list: string,
): ReadonlyArray<string> =>
  Option.match(decodeItems(props[list]), {
    onNone: () => [],
    onSome: (items) => items.map((item) => item.id),
  });

/** A list field, whether or not the block may leave it out. */
type ListField = Extract<Field, { readonly kind: "list" }>;

const listValue = (
  props: Readonly<Record<string, Schema.Json>>,
  list: string,
): ReadonlyArray<Schema.Json> => {
  const value = props[list];
  return Array.isArray(value) ? value : [];
};

/** Whether a list field can take another item, and lose one. */
export const listRoom = (field: ListField, count: number) => ({
  canAdd: count < field.max,
  canRemove: count > field.min,
});

interface ListChange {
  readonly target: Target;
  readonly block: BlockId;
  readonly props: Readonly<Record<string, Schema.Json>>;
  readonly list: string;
}

const setList = (change: ListChange, items: ReadonlyArray<Schema.Json>): SetProp => ({
  op: "setProp",
  target: change.target,
  block: change.block,
  path: [change.list],
  value: items,
});

/**
 * Adds an example item at the end of a list field, from `source`, and says
 * its new ID. Undefined when the list is full.
 */
export const addListItem = (
  change: ListChange & { readonly contract: BlockContract; readonly source: ExampleSource },
) => {
  const field = change.contract.fields[change.list];
  const items = listValue(change.props, change.list);
  if (field?.kind !== "list" || !listRoom(field, items.length).canAdd) return undefined;
  const item = placeholderItem(change.contract, change.list, items.length, change.source);
  const id = Schema.decodeUnknownSync(Schema.Struct({ id: Schema.String }))(item).id;
  return { op: setList(change, [...items, item]), id };
};

/** Moves a list field's item one place earlier or later, or undefined at that end. */
export const moveListItem = (change: ListChange & { readonly id: string; readonly by: -1 | 1 }) => {
  const items = listValue(change.props, change.list);
  const ids = listIds(change.props, change.list);
  const from = ids.indexOf(change.id);
  const to = from + change.by;
  const moving = items[from];
  if (from === -1 || to < 0 || to >= items.length || moving === undefined) return undefined;
  return setList(change, items.toSpliced(from, 1).toSpliced(to, 0, moving));
};

/** Removes a list field's item, or undefined when the list has the fewest it can. */
export const removeListItem = (
  change: ListChange & { readonly field: ListField; readonly id: string },
) => {
  const ids = listIds(change.props, change.list);
  const index = ids.indexOf(change.id);
  if (index === -1 || !listRoom(change.field, ids.length).canRemove) return undefined;
  return setList(change, listValue(change.props, change.list).toSpliced(index, 1));
};

/** A section's slot on a page, with the items in it. */
export interface PlacedSlot {
  readonly page: PageDocument;
  readonly list: Exclude<BlockList, "root">;
}

const slotIds = (slot: PlacedSlot) =>
  slot.page.blocks[slot.list.block]?.slots?.[slot.list.slot] ?? [];

/** Moves a slot's item one place earlier or later within the slot, or undefined at that end. */
export const moveSlotItem = (
  slot: PlacedSlot & { readonly contracts: BlockContracts },
  item: BlockId,
  by: -1 | 1,
): Op | undefined => {
  const ids = slotIds(slot);
  const index = ids.indexOf(item);
  if (index === -1 || index + by < 0 || index + by >= ids.length) return undefined;
  const after = by === -1 ? (ids[index - 2] ?? null) : (ids[index + 1] ?? null);
  return moveOp(slot.page, slot.contracts, item, slot.list, after);
};
