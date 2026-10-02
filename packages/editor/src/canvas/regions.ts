import type { BlockId } from "@repo/contracts/ids";

import type { ItemKey } from "../store.ts";

/*
 * Where a block's parts are on the page. Field components mark each field's
 * element with its path, and ghosts mark theirs with the path they'd add.
 * A list item has no element of its own in a block's markup, so its place is
 * found from its fields: the largest element around them that holds nothing
 * of any other part.
 */

/** A part's element and its path, as `data-pakshi-field` or a ghost's `data-pakshi-add` holds it. */
interface PartElement {
  readonly element: Element;
  readonly path: ReadonlyArray<string>;
}

export const blockElement = (document: Document, block: BlockId) =>
  document.querySelector(`[data-pakshi-block="${block}"]`);

/** The elements of a block's own parts, not those of the item blocks in its slots. */
export const partsOf = (block: Element): ReadonlyArray<PartElement> =>
  Array.from(block.querySelectorAll("[data-pakshi-field], [data-pakshi-add]")).flatMap(
    (element) => {
      if (element.closest("[data-pakshi-block], [data-pakshi-ghost]") !== block) return [];
      const path =
        element.getAttribute("data-pakshi-field") ?? element.getAttribute("data-pakshi-add");
      return path === null || path === "" ? [] : [{ element, path: path.split(".") }];
    },
  );

/** The element of one of a block's own fields. */
export const fieldElement = (block: Element, path: ReadonlyArray<string>) =>
  partsOf(block).find(
    (part) =>
      part.element.hasAttribute("data-pakshi-field") && part.path.join(".") === path.join("."),
  )?.element;

/** Which list item a path is in, for a field of a list item. */
export const itemOf = (path: ReadonlyArray<string>): ItemKey | null => {
  const [list, id] = path;
  return path.length >= 3 && list !== undefined && id !== undefined ? { list, id } : null;
};

const isIn = (path: ReadonlyArray<string>, item: ItemKey) =>
  path[0] === item.list && path[1] === item.id && path.length >= 3;

/**
 * The element that holds a list item: around all of the item's fields, and
 * as large as it can be without holding another part of the block.
 */
export const itemElement = (block: Element, item: ItemKey) => {
  const parts = partsOf(block);
  const mine = parts.filter((part) => isIn(part.path, item)).map((part) => part.element);
  const others = parts.filter((part) => !isIn(part.path, item)).map((part) => part.element);
  const [first] = mine;
  if (first === undefined) return null;
  let region: Element = first;
  while (!mine.every((element) => region.contains(element)) && region.parentElement !== null)
    region = region.parentElement;
  for (
    let parent = region.parentElement;
    parent !== null && parent !== block && !others.some((element) => parent?.contains(element));
    parent = parent.parentElement
  )
    region = parent;
  return region;
};

/** The IDs of the list items a block's page shows, in order, by list. */
export const shownItems = (block: Element): ReadonlyArray<ItemKey> => {
  const seen = new Map<string, ItemKey>();
  for (const part of partsOf(block)) {
    const item = part.element.hasAttribute("data-pakshi-field") ? itemOf(part.path) : null;
    if (item !== null) seen.set(`${item.list}.${item.id}`, item);
  }
  return Array.from(seen.values());
};

/** The list item under a point in the frame, from where its parts are. */
export const itemAt = (block: Element, x: number, y: number) =>
  shownItems(block).find((item) => {
    const rect = itemElement(block, item)?.getBoundingClientRect();
    return (
      rect !== undefined && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    );
  }) ?? null;
