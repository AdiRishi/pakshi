import { type BlockContract, blockKey, type StoredProps } from "@repo/blocks/contract";
import type { Field } from "@repo/blocks/fields";
import type { BrandRevision } from "@repo/contracts/brand";
import type { SiteContent } from "@repo/contracts/draft";
import type { FormDefinition } from "@repo/contracts/form";
import { BlockId, type BlockType, type FormId, type PageId } from "@repo/contracts/ids";
import {
  type Conflict,
  ConflictKey,
  type MergedChange,
  type NamedBlock,
  type Place,
  type Resolutions,
  type Side,
  type ValueKind,
} from "@repo/contracts/merge";
import type { MetaField } from "@repo/contracts/ops";
import { type BlockInstance, type PageDocument, PageMeta, PostMeta } from "@repo/contracts/page";
import { MenuItem, type SiteParts } from "@repo/contracts/site";
import type { Lockfile } from "@repo/contracts/snapshot";
import { Equal, Option, Predicate, Schema } from "effect";
import type { Json } from "effect/Schema";

import type { BlockContracts } from "./document.ts";

/*
 * The three-way merge that brings a release into a draft that started from
 * an earlier one. The base is the release the draft started from; the other
 * two sides are the draft and the release now live.
 *
 * Everything is matched by ID: pages, blocks, and the items of lists inside
 * props and in menus. A change made on one side is kept, and so is the same
 * change made on both. Blocks both sides add to a list are all kept, live's
 * first. Three cases need a person: one value changed differently on both
 * sides, a block or page changed on one side and removed on the other, and
 * the same blocks reordered differently on both sides. Two pages that end up
 * with one address are a conflict too, so the merged draft stays valid.
 *
 * Before comparing, every side moves to the newest version of each block any
 * side uses, so edits are always compared in the same shape.
 */

/** Every block version a merge can meet, keyed as the registry names them. */
export type BlockLibrary = ReadonlyMap<string, BlockContract>;

/** The three sides of a merge. */
export interface Sides<T> {
  readonly base: T;
  readonly draft: T;
  readonly live: T;
}

export interface MergeResult {
  /**
   * The merged content, at the block versions every side moved to. A
   * conflict no one has chosen a side for keeps the draft's side.
   */
  readonly content: SiteContent;
  /** Every conflict found, whether a side has been chosen for it or not. */
  readonly conflicts: ReadonlyArray<Conflict>;
  /** The live site's changes that merged on their own. */
  readonly changes: ReadonlyArray<MergedChange>;
}

/** Whether every conflict in a merge has a side chosen for it. */
export const isResolved = (result: MergeResult, resolutions: Resolutions) =>
  result.conflicts.every((conflict) => conflict.key in resolutions);

/** The block versions a lockfile pins, from a library that holds them. */
export const contractsAt = (library: BlockLibrary, lockfile: Lockfile): BlockContracts =>
  new Map(
    Object.entries(lockfile).map(([type, version]) => {
      const contract = library.get(blockKey(type, version));
      if (contract === undefined) throw new Error(`${blockKey(type, version)} isn't loaded.`);
      return [type, contract] as const;
    }),
  );

// Block versions ----------------------------------------------------------------

/** The newest version of each block type any of the lockfiles pins. */
export const newestLockfile = (lockfiles: ReadonlyArray<Lockfile>): Lockfile => {
  const newest: Record<BlockType, number> = {};
  for (const lockfile of lockfiles)
    for (const [type, version] of Object.entries(lockfile))
      newest[type] = Math.max(newest[type] ?? version, version);
  return newest;
};

const migrateBlock = (
  library: BlockLibrary,
  from: Lockfile,
  to: Lockfile,
  block: BlockInstance,
): BlockInstance => {
  const start = from[block.type];
  const end = to[block.type];
  if (start === undefined || end === undefined || start >= end) return block;
  let props: StoredProps = block.props;
  for (let version = start + 1; version <= end; version += 1) {
    const migrate = library.get(blockKey(block.type, version))?.migrate;
    if (migrate === undefined || migrate === null)
      throw new Error(`${blockKey(block.type, version)} can't take content from v${version - 1}.`);
    props = migrate(props);
  }
  return { ...block, props };
};

const migrateBlocks = (
  library: BlockLibrary,
  from: Lockfile,
  to: Lockfile,
  blocks: Readonly<Record<BlockId, BlockInstance>>,
): Record<BlockId, BlockInstance> =>
  Object.fromEntries(
    Object.entries(blocks).map(([id, block]) => [id, migrateBlock(library, from, to, block)]),
  );

/** Content moved up to the block versions a lockfile pins, through each version's `migrate`. */
export const migrateContent = (
  library: BlockLibrary,
  content: SiteContent,
  lockfile: Lockfile,
): SiteContent => ({
  ...content,
  lockfile: { ...content.lockfile, ...lockfile },
  parts: {
    ...content.parts,
    blocks: migrateBlocks(library, content.lockfile, lockfile, content.parts.blocks),
  },
  pages: Object.fromEntries(
    Object.entries(content.pages).map(([id, page]) => [
      id,
      { ...page, blocks: migrateBlocks(library, content.lockfile, lockfile, page.blocks) },
    ]),
  ),
});

// Choosing values -----------------------------------------------------------------

const same = <T>(a: T, b: T) => Equal.equals(a, b);

/** Where a value is, as its conflict names it. */
type ValueSpot = Omit<Extract<Conflict, { _tag: "Changed" }>, "_tag" | "draft" | "live">;

const key = (...parts: ReadonlyArray<string>) => ConflictKey.make(parts.join("/"));

/** What a merge has found so far, and the sides people have chosen. */
class Merge {
  readonly conflicts: Array<Conflict> = [];
  readonly changes: Array<MergedChange> = [];
  readonly #resolutions: Resolutions;
  readonly #contracts: BlockContracts;

  constructor(resolutions: Resolutions, contracts: BlockContracts) {
    this.#resolutions = resolutions;
    this.#contracts = contracts;
  }

  /**
   * Records a conflict, and returns the side kept for it: the one chosen, or
   * the draft's. Only a text value can be settled with a merged value.
   */
  conflict(conflict: Conflict): Side {
    this.conflicts.push(conflict);
    const resolution = this.#resolutions[conflict.key];
    return resolution === "live" ? "live" : "draft";
  }

  /** A block's text or rich text value, three ways. Its conflict may be settled with a merged value. */
  text(spot: ValueSpot, sides: Sides<Json | undefined>): Json | undefined {
    const { base, draft, live } = sides;
    if (same(draft, live) || same(live, base) || same(draft, base)) return this.value(spot, sides);
    const conflict: Conflict = { _tag: "Changed", ...spot, base, draft, live };
    this.conflicts.push(conflict);
    const resolution = this.#resolutions[conflict.key];
    if (resolution === undefined || resolution === "draft") return draft;
    return resolution === "live" ? live : resolution.merged;
  }

  /** One value, three ways. A missing value was never set, or was removed. */
  value<T extends Json | undefined>(spot: ValueSpot, sides: Sides<T>): T {
    const { base, draft, live } = sides;
    if (same(draft, live) || same(live, base)) return draft;
    if (same(draft, base)) {
      this.changes.push({
        _tag: "ValueChanged",
        place: spot.place,
        block: spot.block ?? null,
        field: spot.field,
      });
      return live;
    }
    return this.conflict({ _tag: "Changed", ...spot, base, draft, live }) === "draft"
      ? draft
      : live;
  }

  blockTitle(type: BlockType) {
    return this.#contracts.get(type)?.title ?? type;
  }

  field(type: BlockType, name: string): Field | undefined {
    return this.#contracts.get(type)?.fields[name];
  }
}

const valueKinds = {
  text: "text",
  richText: "richText",
  media: "media",
  cta: "cta",
  link: "link",
  form: "form",
  list: "list",
} as const satisfies Record<Field["kind"], ValueKind>;

// Ordered lists -------------------------------------------------------------------

/**
 * The order of a merged list. The IDs every side has in it keep the order
 * of the side that reordered them; both reordering them differently is a
 * conflict unless `prefer` names the side to follow. The others go after
 * the nearest ID before them, in their side's list, that every side has.
 * Where both sides put some after the same one, live's come first.
 */
const mergeOrder = <Id extends string>(
  lists: Sides<ReadonlyArray<Id>>,
  members: ReadonlySet<Id>,
  prefer: Side | null,
): { readonly order: ReadonlyArray<Id>; readonly moved: ReadonlyArray<Id> } | "conflict" => {
  const everywhere = new Set(
    Array.from(members).filter(
      (id) => lists.base.includes(id) && lists.draft.includes(id) && lists.live.includes(id),
    ),
  );
  const only = (ids: ReadonlyArray<Id>) => ids.filter((id) => everywhere.has(id));
  const [base, draft, live] = [only(lists.base), only(lists.draft), only(lists.live)];
  let stable: ReadonlyArray<Id>;
  let moved: ReadonlyArray<Id> = [];
  if (same(draft, live) || same(live, base)) stable = draft;
  else if (same(draft, base)) {
    stable = live;
    moved = live.filter((id, index) => base[base.indexOf(id) - 1] !== live[index - 1]);
  } else if (prefer === null) return "conflict";
  else stable = prefer === "draft" ? draft : live;

  const after = new Map<Id | null, Array<Id>>();
  const place = (id: Id, list: ReadonlyArray<Id>) => {
    const anchor = list.slice(0, list.indexOf(id)).findLast((other) => everywhere.has(other));
    after.set(anchor ?? null, [...(after.get(anchor ?? null) ?? []), id]);
  };
  const placed = new Set<Id>(everywhere);
  for (const list of [lists.live, lists.draft])
    for (const id of list)
      if (members.has(id) && !placed.has(id)) {
        place(id, list);
        placed.add(id);
      }
  const order = [
    ...(after.get(null) ?? []),
    ...stable.flatMap((id) => [id, ...(after.get(id) ?? [])]),
  ];
  // Members neither side lists here, such as a block whose list was removed.
  return { order: [...order, ...Array.from(members).filter((id) => !placed.has(id))], moved };
};

/** An item of a list inside props or of a menu: its ID and its fields. */
type Item = { readonly id: string } & Readonly<Record<string, Json>>;

const isItem = (value: Json): value is Item =>
  Predicate.isObject(value) && !Array.isArray(value) && Predicate.isString(value["id"]);

const itemsOf = (value: Json | undefined): ReadonlyArray<Item> =>
  Array.isArray(value) ? value.filter(isItem) : [];

/**
 * A list of items with IDs merged item by item and field by field. Anything
 * that conflicts inside it makes the whole list the conflict.
 */
const mergeItems = (sides: Sides<ReadonlyArray<Item>>): ReadonlyArray<Item> | "conflict" => {
  const byId = (items: ReadonlyArray<Item>) => new Map(items.map((item) => [item.id, item]));
  const [base, draft, live] = [byId(sides.base), byId(sides.draft), byId(sides.live)];
  const merged = new Map<string, Item>();
  for (const id of new Set([...base.keys(), ...draft.keys(), ...live.keys()])) {
    const [b, d, l] = [base.get(id), draft.get(id), live.get(id)];
    if (d === undefined || l === undefined) {
      const kept = d ?? l;
      // Removed on one side: fine unless the other side changed it.
      if (kept === undefined || (b !== undefined && same(b, kept))) continue;
      if (b !== undefined) return "conflict";
      merged.set(id, kept);
      continue;
    }
    const fields: Record<string, Json> = {};
    for (const name of new Set([...Object.keys(b ?? {}), ...Object.keys(d), ...Object.keys(l)])) {
      const [bv, dv, lv] = [b?.[name], d[name], l[name]];
      if (!same(dv, lv) && !same(lv, bv) && !same(dv, bv)) return "conflict";
      const value = same(dv, bv) ? lv : dv;
      if (value !== undefined) fields[name] = value;
    }
    merged.set(id, { ...fields, id });
  }
  const ids = (items: ReadonlyArray<Item>) => items.map((item) => item.id);
  const ordered = mergeOrder(
    { base: ids(sides.base), draft: ids(sides.draft), live: ids(sides.live) },
    new Set(merged.keys()),
    null,
  );
  if (ordered === "conflict") return "conflict";
  return ordered.order.flatMap((id) => {
    const item = merged.get(id);
    return item === undefined ? [] : [item];
  });
};

// Blocks ----------------------------------------------------------------------------

/** A block's own type, variant, surface and props: everything but the items in its slots. */
type BlockContent = Omit<BlockInstance, "slots">;

const contentOf = (block: BlockInstance | undefined): BlockContent | undefined => {
  if (block === undefined) return undefined;
  const { slots: _, ...content } = block;
  return content;
};

/** A block's content merged three ways. A block only one side has stays as that side has it. */
const mergeContent = (
  merge: Merge,
  sides: Sides<BlockContent | undefined>,
  place: Place,
  id: BlockId,
): BlockContent => {
  const { draft, live } = sides;
  if (draft === undefined || live === undefined) {
    const kept = draft ?? live;
    if (kept === undefined) throw new Error(`Block ${id} is on neither side.`);
    return kept;
  }
  const block: NamedBlock = { id, title: merge.blockTitle(draft.type) };
  const spot = (name: string, field: string, kind: ValueKind): ValueSpot => ({
    key: key(name, place.target, id),
    place,
    block,
    field,
    kind,
  });
  const variant = merge.value(spot("variant", "Layout", "choice"), {
    base: sides.base?.variant ?? draft.variant,
    draft: draft.variant,
    live: live.variant,
  });
  const surface = merge.value(spot("surface", "Background", "choice"), {
    base: sides.base?.surface,
    draft: draft.surface,
    live: live.surface,
  });
  const props: Record<string, Json> = {};
  const names = new Set([
    ...Object.keys(sides.base?.props ?? {}),
    ...Object.keys(draft.props),
    ...Object.keys(live.props),
  ]);
  for (const name of names) {
    const field = merge.field(draft.type, name);
    const fieldSpot: ValueSpot = {
      key: key("value", place.target, id, name),
      place,
      block,
      field: field?.title ?? name,
      name,
      kind: field === undefined ? "text" : valueKinds[field.kind],
    };
    const values: Sides<Json | undefined> = {
      base: sides.base?.props[name],
      draft: draft.props[name],
      live: live.props[name],
    };
    const value =
      field?.kind === "list"
        ? mergeList(merge, fieldSpot, values, field)
        : field?.kind === "text" || field?.kind === "richText"
          ? merge.text(fieldSpot, values)
          : merge.value(fieldSpot, values);
    if (value !== undefined) props[name] = value;
  }
  const merged = { type: draft.type, variant, props };
  return surface === undefined ? merged : { ...merged, surface };
};

/**
 * A list field merged item by item, or the whole list as one conflict. Each
 * side's list is valid, but together they can break the field's rules, such
 * as its most items; that's a conflict too.
 */
const mergeList = (
  merge: Merge,
  spot: ValueSpot,
  values: Sides<Json | undefined>,
  field: Field,
) => {
  const merged = mergeItems({
    base: itemsOf(values.base),
    draft: itemsOf(values.draft),
    live: itemsOf(values.live),
  });
  const items =
    merged !== "conflict" && Option.isSome(Schema.decodeOption(field.draft)(merged))
      ? merged
      : "conflict";
  if (items === "conflict")
    return merge.conflict({ _tag: "Changed", ...spot, ...values }) === "draft"
      ? values.draft
      : values.live;
  if (!same(items, values.draft) && same(values.draft, values.base))
    merge.changes.push({
      _tag: "ValueChanged",
      place: spot.place,
      block: spot.block ?? null,
      field: spot.field,
    });
  return values.draft === undefined && values.live === undefined ? undefined : items;
};

// Pages -----------------------------------------------------------------------------

const root = "root";

/** A page's lists of blocks, keyed `root` or `{section}/{slot}`, and the list each block is in. */
interface Layout {
  readonly lists: ReadonlyMap<string, ReadonlyArray<BlockId>>;
  readonly parent: ReadonlyMap<BlockId, string>;
}

const slotKey = (section: BlockId, slot: string) => `${section}/${slot}`;

const layoutOf = (page: PageDocument | undefined): Layout => {
  const lists = new Map<string, ReadonlyArray<BlockId>>();
  const parent = new Map<BlockId, string>();
  if (page === undefined) return { lists, parent };
  lists.set(root, page.root);
  for (const section of page.root) {
    parent.set(section, root);
    for (const [slot, items] of Object.entries(page.blocks[section]?.slots ?? {})) {
      lists.set(slotKey(section, slot), items);
      for (const item of items) parent.set(item, slotKey(section, slot));
    }
  }
  return { lists, parent };
};

/** A block with the items in its slots, as far as telling whether a side changed it goes. */
const subtree = (page: PageDocument | undefined, id: BlockId) => {
  const block = page?.blocks[id];
  if (block === undefined) return undefined;
  return {
    block: contentOf(block),
    slots: Object.entries(block.slots ?? {}).map(([slot, items]) => ({
      slot,
      items: items.map((item) => ({ item, block: page?.blocks[item] })),
    })),
  };
};

const metaFields = {
  title: { title: "Title", kind: "text" },
  description: { title: "Description", kind: "text" },
  date: { title: "Date", kind: "text" },
  author: { title: "Author", kind: "text" },
  tags: { title: "Tags", kind: "tags" },
  excerpt: { title: "Excerpt", kind: "text" },
  cover: { title: "Cover image", kind: "media" },
} as const satisfies Record<MetaField, { readonly title: string; readonly kind: ValueKind }>;

const metaOf = (page: PageDocument | undefined): Readonly<Record<string, Json>> => page?.meta ?? {};

const pageTitle = (page: PageDocument) => page.meta.title || page.path;

/** The page as the three sides have it; the base is missing when both sides added it. */
interface PageSides {
  readonly base: PageDocument | undefined;
  readonly draft: PageDocument;
  readonly live: PageDocument;
}

/** A page both sides kept, merged three ways. */
const mergePage = (merge: Merge, sides: PageSides): PageDocument => {
  const { draft, live } = sides;
  const place: Place = { target: draft.id, title: pageTitle(draft) };
  const spot = (name: string, field: string, kind: ValueKind): ValueSpot => ({
    key: key(name, draft.id),
    place,
    block: null,
    field,
    kind,
  });
  const path = merge.value(spot("path", "Address", "address"), {
    base: sides.base?.path ?? draft.path,
    draft: draft.path,
    live: live.path,
  });
  const status = merge.value(spot("status", "Published", "choice"), {
    base: sides.base?.status,
    draft: draft.status,
    live: live.status,
  });
  const meta: Record<string, Json> = {};
  for (const [name, { title, kind }] of Object.entries(metaFields)) {
    const value = merge.value(
      { ...spot("meta", title, kind), key: key("meta", draft.id, name) },
      { base: metaOf(sides.base)[name], draft: metaOf(draft)[name], live: metaOf(live)[name] },
    );
    if (value !== undefined) meta[name] = value;
  }
  const { root: order, blocks } = mergeBlocks(merge, sides, place);
  const { status: _, ...rest } = draft;
  const common = { ...rest, path, root: order, blocks };
  const withStatus = status === undefined ? common : { ...common, status };
  return withStatus.type === "post"
    ? { ...withStatus, meta: Schema.decodeUnknownSync(PostMeta)(meta) }
    : { ...withStatus, meta: Schema.decodeUnknownSync(PageMeta)(meta) };
};

const sideNames = ["base", "draft", "live"] as const;

/** Which blocks a page keeps, what's in them, and where they go. */
const mergeBlocks = (merge: Merge, sides: PageSides, place: Place) => {
  const layouts: Sides<Layout> = {
    base: layoutOf(sides.base),
    draft: layoutOf(sides.draft),
    live: layoutOf(sides.live),
  };
  const has = (side: keyof Sides<unknown>, id: BlockId) => layouts[side].parent.has(id);
  const typeOf = (id: BlockId) =>
    (sides.draft.blocks[id] ?? sides.live.blocks[id] ?? sides.base?.blocks[id])?.type ?? "";
  const named = (id: BlockId): NamedBlock => ({ id, title: merge.blockTitle(typeOf(id)) });
  const sectionOf = (list: string) =>
    list === root ? null : BlockId.make(list.split("/")[0] ?? "");

  // Which blocks stay. A removal against a change on the other side is a
  // conflict, raised for the outermost block removed; an item follows its
  // section.
  const decided = new Map<BlockId, boolean>();
  const decide = (id: BlockId): boolean => {
    const known = decided.get(id);
    if (known !== undefined) return known;
    const [inDraft, inLive] = [has("draft", id), has("live", id)];
    let keep = inDraft || inLive;
    if (has("base", id) && inDraft !== inLive) {
      const keptOn: Side = inDraft ? "draft" : "live";
      const removedOn: Side = inDraft ? "live" : "draft";
      const baseList = layouts.base.parent.get(id) ?? root;
      const section = sectionOf(baseList);
      if (section !== null && !has(removedOn, section)) keep = decide(section) && has(keptOn, id);
      else if (same(subtree(sides.base, id), subtree(sides[keptOn], id))) {
        keep = false;
        if (removedOn === "live")
          merge.changes.push({ _tag: "BlockRemoved", place, block: named(id) });
      } else
        keep =
          merge.conflict({
            _tag: "Removed",
            key: key("removed", place.target, id),
            place,
            block: named(id),
            removedOn,
          }) === keptOn;
    }
    decided.set(id, keep);
    return keep;
  };
  const ids = new Set(sideNames.flatMap((side) => Array.from(layouts[side].parent.keys())));
  const kept = new Set(Array.from(ids).filter(decide));
  for (const id of kept)
    if (!has("base", id) && has("live", id) && !has("draft", id))
      merge.changes.push({ _tag: "BlockAdded", place, block: named(id) });

  // The list each block goes in. A block that moved to a list whose section
  // is gone goes back to the other side's list.
  const listExists = (list: string) => {
    const section = sectionOf(list);
    return section === null || kept.has(section);
  };
  const parents = new Map<BlockId, string>();
  for (const id of kept) {
    const [b, d, l] = sideNames.map((side) => layouts[side].parent.get(id));
    let list: string | undefined;
    if (d === undefined || l === undefined) list = d ?? l;
    else if (same(d, l) || same(l, b)) list = d;
    else if (same(d, b)) list = l;
    else
      list = merge.conflict(reordered(merge, sides, layouts, place, b ?? root)) === "draft" ? d : l;
    if (list !== undefined && !listExists(list))
      list = [d, l].find((other) => other !== undefined && listExists(other));
    if (list !== undefined) parents.set(id, list);
  }

  const order = (list: string): ReadonlyArray<BlockId> => {
    const members = new Set(
      Array.from(parents).flatMap(([id, parent]) => (parent === list ? [id] : [])),
    );
    const lists = {
      base: layouts.base.lists.get(list) ?? [],
      draft: layouts.draft.lists.get(list) ?? [],
      live: layouts.live.lists.get(list) ?? [],
    };
    let merged = mergeOrder(lists, members, null);
    if (merged === "conflict")
      merged = mergeOrder(
        lists,
        members,
        merge.conflict(reordered(merge, sides, layouts, place, list)),
      );
    if (merged === "conflict") throw new Error("A preferred side always gives an order.");
    for (const id of merged.moved)
      merge.changes.push({ _tag: "BlockMoved", place, block: named(id) });
    return merged.order;
  };

  const blocks: Record<BlockId, BlockInstance> = {};
  const sections = order(root);
  for (const [id, parent] of parents) {
    const content = mergeContent(
      merge,
      {
        base: contentOf(sides.base?.blocks[id]),
        draft: contentOf(sides.draft.blocks[id]),
        live: contentOf(sides.live.blocks[id]),
      },
      place,
      id,
    );
    const slots = new Set(
      sideNames.flatMap((side) => Object.keys(sides[side]?.blocks[id]?.slots ?? {})),
    );
    blocks[id] =
      parent !== root || slots.size === 0
        ? content
        : {
            ...content,
            slots: Object.fromEntries(
              Array.from(slots, (slot) => [slot, order(slotKey(id, slot))]),
            ),
          };
  }
  return { root: sections, blocks };
};

/** The conflict for a list both sides reordered, with each side's order of it. */
const reordered = (
  merge: Merge,
  sides: PageSides,
  layouts: Sides<Layout>,
  place: Place,
  list: string,
): Conflict => {
  const named = (page: PageDocument, ids: ReadonlyArray<BlockId>) =>
    ids.map((id) => ({ id, title: merge.blockTitle(page.blocks[id]?.type ?? "") }));
  const section = list === root ? null : BlockId.make(list.split("/")[0] ?? "");
  return {
    _tag: "Reordered",
    key: key("order", place.target, list),
    place,
    section:
      section === null
        ? null
        : { id: section, title: merge.blockTitle(sides.draft.blocks[section]?.type ?? "") },
    draft: named(sides.draft, layouts.draft.lists.get(list) ?? []),
    live: named(sides.live, layouts.live.lists.get(list) ?? []),
  };
};

/** Every page, kept, removed or merged three ways. */
const mergePages = (merge: Merge, sides: Sides<SiteContent["pages"]>): SiteContent["pages"] => {
  const pages: Record<PageId, PageDocument> = {};
  const ids = new Set(
    sideNames.flatMap((side) => Object.values(sides[side]).map((page) => page.id)),
  );
  for (const id of ids) {
    const [base, draft, live] = sideNames.map((side) => sides[side][id]);
    if (draft !== undefined && live !== undefined) {
      pages[id] = mergePage(merge, { base, draft, live });
      continue;
    }
    const kept = draft ?? live;
    if (kept === undefined) continue;
    const keptOn: Side = draft === undefined ? "live" : "draft";
    const place: Place = { target: id, title: pageTitle(kept) };
    if (base === undefined) {
      pages[id] = kept;
      if (keptOn === "live") merge.changes.push({ _tag: "PageAdded", place });
    } else if (same(base, kept)) {
      if (keptOn === "draft") merge.changes.push({ _tag: "PageRemoved", place });
    } else if (
      merge.conflict({
        _tag: "Removed",
        key: key("removed", id),
        place,
        block: null,
        removedOn: keptOn === "draft" ? "live" : "draft",
      }) === keptOn
    )
      pages[id] = kept;
  }
  // Each side's addresses are unique, so at most one page from each shares one.
  for (const [path, sharing] of Map.groupBy(Object.values(pages), (page) => page.path)) {
    const livePage = sharing.find((page) => sides.live[page.id]?.path === path);
    const draftPage = sharing.find((page) => page !== livePage);
    if (sharing.length < 2 || livePage === undefined || draftPage === undefined) continue;
    const side = merge.conflict({
      _tag: "Address",
      key: key("address", path),
      path,
      draft: { id: draftPage.id, title: pageTitle(draftPage) },
      live: { id: livePage.id, title: pageTitle(livePage) },
    });
    delete pages[side === "draft" ? livePage.id : draftPage.id];
  }
  return pages;
};

// The site ---------------------------------------------------------------------------

const siteSpot = (name: string, title: string, field: string, kind: ValueKind): ValueSpot => ({
  key: key("site", name),
  place: { target: "site", title },
  block: null,
  field,
  kind,
});

/**
 * The newer of the two sides' brand revisions. A site only moves forward
 * through its brand's revisions, so brand changes never conflict.
 */
const newerBrand = (merge: Merge, sides: Sides<BrandRevision>) => {
  if (sides.live.number <= sides.draft.number) return sides.draft;
  merge.changes.push({
    _tag: "ValueChanged",
    place: { target: "site", title: "Brand" },
    block: null,
    field: "Theme and identity",
  });
  return sides.live;
};

const decodeMenu = Schema.decodeUnknownSync(Schema.Array(MenuItem));

const mergeMenu = (
  merge: Merge,
  name: "main" | "footer",
  title: string,
  sides: Sides<ReadonlyArray<MenuItem>>,
): ReadonlyArray<MenuItem> => {
  const items = mergeItems(sides);
  const spot = siteSpot(`menu/${name}`, title, "Items", "list");
  if (items === "conflict")
    return merge.conflict({ _tag: "Changed", ...spot, ...sides }) === "draft"
      ? sides.draft
      : sides.live;
  if (!same(items, sides.draft) && same(sides.draft, sides.base))
    merge.changes.push({ _tag: "ValueChanged", place: spot.place, block: null, field: spot.field });
  return decodeMenu(items);
};

const mergeParts = (merge: Merge, sides: Sides<SiteParts>): SiteParts => {
  const blocks = Object.fromEntries(
    [sides.draft.header, sides.draft.footer].map((id) => {
      const title = merge.blockTitle(sides.draft.blocks[id]?.type ?? "");
      const content = mergeContent(
        merge,
        {
          base: contentOf(sides.base.blocks[id]),
          draft: contentOf(sides.draft.blocks[id]),
          live: contentOf(sides.live.blocks[id]),
        },
        { target: "site", title },
        id,
      );
      return [id, content];
    }),
  );
  const menu = (name: "main" | "footer") => ({
    base: sides.base.menus[name],
    draft: sides.draft.menus[name],
    live: sides.live.menus[name],
  });
  return {
    header: sides.draft.header,
    footer: sides.draft.footer,
    blocks,
    menus: {
      main: mergeMenu(merge, "main", "Main menu", menu("main")),
      footer: mergeMenu(merge, "footer", "Footer menu", menu("footer")),
    },
  };
};

/**
 * Merges the release now live into a draft that started from `base`, with
 * the sides people chose for conflicts. `library` holds every block version
 * the three sides pin, and every version between.
 */
export const mergeSites = (
  sides: Sides<SiteContent>,
  library: BlockLibrary,
  resolutions: Resolutions,
): MergeResult => {
  const lockfile = newestLockfile(sideNames.map((side) => sides[side].lockfile));
  const [base, draft, live] = sideNames.map((side) =>
    migrateContent(library, sides[side], lockfile),
  );
  if (base === undefined || draft === undefined || live === undefined)
    throw new Error("A merge has three sides.");
  const merge = new Merge(resolutions, contractsAt(library, lockfile));
  const forms: Record<FormId, FormDefinition> = {};
  const formIds = new Set(
    sideNames.flatMap((side) => Object.values(sides[side].forms).map((form) => form.id)),
  );
  for (const id of formIds) {
    const [b, d, l] = [base.forms[id], draft.forms[id], live.forms[id]];
    const form = merge.value(siteSpot(`form/${id}`, "Forms", (d ?? l ?? b)?.name ?? id, "choice"), {
      base: b,
      draft: d,
      live: l,
    });
    if (form !== undefined) forms[id] = form;
  }
  const content: SiteContent = {
    settings: {
      name: merge.value(siteSpot("settings/name", "Site settings", "Site name", "text"), {
        base: base.settings.name,
        draft: draft.settings.name,
        live: live.settings.name,
      }),
    },
    parts: mergeParts(merge, { base: base.parts, draft: draft.parts, live: live.parts }),
    forms,
    lockfile,
    brand: newerBrand(merge, { base: base.brand, draft: draft.brand, live: live.brand }),
    pages: mergePages(merge, { base: base.pages, draft: draft.pages, live: live.pages }),
  };
  return { content, conflicts: merge.conflicts, changes: merge.changes };
};

/** What changed from one site's content to another's, as merging the second into the first reports it. */
export const changesBetween = (from: SiteContent, to: SiteContent, library: BlockLibrary) =>
  mergeSites({ base: from, draft: from, live: to }, library, {}).changes;
