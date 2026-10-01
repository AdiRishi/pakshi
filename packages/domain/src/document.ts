import type { BlockContract } from "@repo/blocks/contract";
import type { Field } from "@repo/blocks/fields";
import { fieldParts, propsSchema } from "@repo/blocks/fields";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BlockType, FormId, MediaId, PageId } from "@repo/contracts/ids";
import type {
  BatchError,
  BatchRule,
  BlockList,
  BlockTree,
  InsertBlock,
  ItemTree,
  MoveBlock,
  Op,
  SetForm,
  SetMeta,
  SetProp,
  SetRedirect,
  SetStatus,
  Target,
} from "@repo/contracts/ops";
import { type BlockInstance, PageDocument, PageMeta, PostMeta } from "@repo/contracts/page";
import { FormRef, MediaRef } from "@repo/contracts/references";
import type { MenuItem, Menus, SiteParts } from "@repo/contracts/site";
import { Equal, Predicate, Schema, SchemaIssue, SchemaParser } from "effect";

/*
 * The document module: how ops change a draft, what they may not do, and how
 * to undo them. It's pure and imports no server code, so SiteDoc commits
 * batches with it and the editor shows edits with it before SiteDoc confirms
 * them.
 *
 * Validation holds drafts to the limits enforced while typing. Completeness,
 * such as required values and minimum lengths, is left to freezing.
 */

/** The block versions a draft's lockfile pins, keyed by block type. */
export type BlockContracts = ReadonlyMap<BlockType, BlockContract>;

/** An op that applied, and the draft it applied to. */
export interface Step {
  readonly op: Op;
  readonly before: Draft;
}

export type ApplyResult =
  | {
      readonly ok: true;
      readonly draft: Draft;
      /** Ops that undo the batch, in the order to apply them. */
      readonly inverse: ReadonlyArray<Op>;
      readonly steps: ReadonlyArray<Step>;
    }
  | { readonly ok: false; readonly errors: ReadonlyArray<BatchError> };

type Json = Schema.Json;
type Props = Readonly<Record<string, Json>>;

/** Blocks keyed by ID, as a page and the site-level parts both hold them. */
interface BlockHolder {
  readonly blocks: Readonly<Record<BlockId, BlockInstance>>;
}

class Rejection {
  readonly errors: ReadonlyArray<Omit<BatchError, "op">>;

  constructor(errors: ReadonlyArray<Omit<BatchError, "op">>) {
    this.errors = errors;
  }
}

const reject = (rule: BatchRule, message: string, path: BatchError["path"] = []) =>
  new Rejection([{ rule, message, path }]);

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** A value decoded by a schema, or a rejection listing each issue under `path` with the given rule. */
const check = <T>(
  schema: Schema.Decoder<T>,
  value: Json | undefined,
  rule: BatchRule,
  path: BatchError["path"],
): T => {
  const result = SchemaParser.decodeResult(schema)(value, { errors: "all" });
  if (result._tag === "Success") return result.success;
  throw new Rejection(
    formatIssues(result.failure).issues.map((found) => ({
      rule,
      message: found.message,
      path: [
        ...path,
        ...(found.path ?? []).map((key) =>
          Predicate.isNumber(key) ? key : String(Predicate.isObject(key) ? key.key : key),
        ),
      ],
    })),
  );
};

const contractFor = (contracts: BlockContracts, type: BlockType) => {
  const contract = contracts.get(type);
  if (contract === undefined)
    throw reject("block-type", `This draft's lockfile has no version of ${type}.`);
  return contract;
};

const holderOf = (draft: Draft, target: Target): BlockHolder => {
  if (target === "site") return draft.parts;
  const page = draft.pages[target];
  if (page === undefined) throw reject("unknown-page", `There's no page ${target} in this draft.`);
  return page;
};

const pageOf = (draft: Draft, id: PageId) => {
  const page = draft.pages[id];
  if (page === undefined) throw reject("unknown-page", `There's no page ${id} in this draft.`);
  return page;
};

const blockOf = (holder: BlockHolder, id: BlockId) => {
  const block = holder.blocks[id];
  if (block === undefined) throw reject("unknown-block", `There's no block ${id} here.`);
  return block;
};

const withBlock = (draft: Draft, target: Target, id: BlockId, block: BlockInstance): Draft => {
  if (target === "site") {
    const parts: SiteParts = { ...draft.parts, blocks: { ...draft.parts.blocks, [id]: block } };
    return { ...draft, parts };
  }
  const page = pageOf(draft, target);
  return {
    ...draft,
    pages: { ...draft.pages, [target]: { ...page, blocks: { ...page.blocks, [id]: block } } },
  };
};

// Props --------------------------------------------------------------------

const isItemList = (value: Json | undefined): value is ReadonlyArray<Json> => Array.isArray(value);

const isRecord = (value: Json | undefined): value is Props =>
  Predicate.isObject(value) && !Array.isArray(value);

const itemIndex = (items: ReadonlyArray<Json>, id: string) =>
  items.findIndex((item) => isRecord(item) && item["id"] === id);

const withKey = (record: Props, key: string, value: Json | undefined) => {
  if (value !== undefined) return { ...record, [key]: value };
  const { [key]: _, ...rest } = record;
  return rest;
};

/** The value at a prop path below a field, or undefined when nothing is set there. */
const readAt = (
  field: Field,
  value: Json | undefined,
  rest: ReadonlyArray<string>,
): Json | undefined => {
  const [step, ...deeper] = rest;
  if (step === undefined) return value;
  if (field.kind === "list") {
    const [name, ...below] = deeper;
    if (!isItemList(value) || name === undefined) return undefined;
    const item = value[itemIndex(value, step)];
    const itemField = field.item[name];
    return isRecord(item) && itemField !== undefined
      ? readAt(itemField, item[name], below)
      : undefined;
  }
  return isRecord(value) ? value[step] : undefined;
};

/**
 * The field's new value after setting `rest` below it. Paths step into a
 * list by item ID, then name one of the item's fields; into a media or button
 * field they name one of its parts.
 */
const writeAt = (
  field: Field,
  value: Json | undefined,
  rest: ReadonlyArray<string>,
  next: Json | undefined,
  path: ReadonlyArray<string>,
): Json | undefined => {
  const [step, ...deeper] = rest;
  if (step === undefined) return next;
  if (field.kind === "list") {
    const [name, ...below] = deeper;
    const itemField = name === undefined ? undefined : field.item[name];
    if (name === undefined || itemField === undefined)
      throw reject("field", `${path.join(".")} doesn't name a field of a list item.`, path);
    const items = isItemList(value) ? value : [];
    const index = itemIndex(items, step);
    const item = items[index];
    if (!isRecord(item)) throw reject("unknown-item", `${field.title} has no item ${step}.`, path);
    if (below.length === 0 && next === undefined && !itemField.optional)
      throw reject("value", `${itemField.title} can't be removed.`, path);
    const updated = withKey(item, name, writeAt(itemField, item[name], below, next, path));
    return items.with(index, updated);
  }
  const part = fieldParts(field)[step];
  if (part === undefined || deeper.length > 0)
    throw reject("field", `${path.join(".")} doesn't name a field of this block.`, path);
  if (!isRecord(value))
    throw reject("field", `${field.title} isn't set, so it has no ${step}.`, path);
  return withKey(value, step, next);
};

const setProp = (draft: Draft, op: SetProp, contracts: BlockContracts) => {
  const holder = holderOf(draft, op.target);
  const block = blockOf(holder, op.block);
  const contract = contractFor(contracts, block.type);
  const [name, ...rest] = op.path;
  const field = name === undefined ? undefined : contract.fields[name];
  // A prop an older version left, which this version doesn't have, can be removed.
  const stale = name === undefined || field !== undefined ? undefined : block.props[name];
  if (name !== undefined && stale !== undefined && rest.length === 0 && op.value === undefined)
    return {
      draft: withBlock(draft, op.target, op.block, {
        ...block,
        props: withKey(block.props, name, undefined),
      }),
      inverse: { ...op, value: stale } satisfies SetProp,
    };
  if (name === undefined || field === undefined)
    throw reject("field", `${contract.title} has no field ${op.path.join(".")}.`, op.path);
  if (rest.length === 0 && op.value === undefined && !field.optional)
    throw reject("value", `${field.title} can't be removed.`, op.path);
  const current = block.props[name];
  const next = writeAt(field, current, rest, op.value, op.path);
  if (next !== undefined) check<unknown>(field.draft, next, "value", [name]);
  const previous = readAt(field, current, rest);
  const undo: SetProp = { op: "setProp", target: op.target, block: op.block, path: op.path };
  return {
    draft: withBlock(draft, op.target, op.block, {
      ...block,
      props: withKey(block.props, name, next),
    }),
    inverse: previous === undefined ? undo : { ...undo, value: previous },
  };
};

// Blocks -------------------------------------------------------------------

/** The list a block sits in, and the block before it there. Items sit in the slots of top-level sections. */
const locate = (page: Draft["pages"][PageId], id: BlockId) => {
  const rootIndex = page.root.indexOf(id);
  if (rootIndex !== -1)
    return { list: "root" as const, ids: page.root, after: page.root[rootIndex - 1] ?? null };
  for (const parent of page.root) {
    for (const [slot, items] of Object.entries(page.blocks[parent]?.slots ?? {})) {
      const index = items.indexOf(id);
      if (index !== -1)
        return { list: { block: parent, slot }, ids: items, after: items[index - 1] ?? null };
    }
  }
  throw reject("unknown-block", `There's no block ${id} on this page.`);
};

/** The IDs in a list, after checking the list exists and can hold a block of this contract. */
const listFor = (
  page: Draft["pages"][PageId],
  list: BlockList,
  contract: BlockContract,
  contracts: BlockContracts,
): ReadonlyArray<BlockId> => {
  if (list === "root") {
    if (contract.placement !== "section")
      throw reject("placement", `${contract.title} can't be a section of a page.`);
    return page.root;
  }
  const parent = page.blocks[list.block];
  const parentContract = parent === undefined ? undefined : contractFor(contracts, parent.type);
  const slot =
    parentContract?.placement === "section" ? parentContract.slots[list.slot] : undefined;
  if (parent === undefined || slot === undefined)
    throw reject("unknown-list", `There's no slot ${list.slot} on block ${list.block}.`);
  if (contract.placement !== "item" || !slot.accepts.includes(contract.type))
    throw reject("placement", `${slot.title} can't hold a ${contract.title}.`);
  return parent.slots?.[list.slot] ?? [];
};

const insertAfter = (ids: ReadonlyArray<BlockId>, id: BlockId, after: BlockId | null) => {
  if (after === null) return [id, ...ids];
  const index = ids.indexOf(after);
  if (index === -1) throw reject("unknown-list", `${after} isn't in that list.`);
  return ids.toSpliced(index + 1, 0, id);
};

const withList = (
  page: Draft["pages"][PageId],
  list: BlockList,
  ids: ReadonlyArray<BlockId>,
): Draft["pages"][PageId] => {
  if (list === "root") return { ...page, root: ids };
  const parent = page.blocks[list.block];
  if (parent === undefined) throw new Error(`Block ${list.block} vanished while moving.`);
  return {
    ...page,
    blocks: {
      ...page.blocks,
      [list.block]: { ...parent, slots: { ...parent.slots, [list.slot]: ids } },
    },
  };
};

const propsSchemas = new WeakMap<BlockContract, Schema.Decoder<unknown>>();

/** Checks a new block's type, variant, surface and props against its contract. */
const checkBlock = (
  block: ItemTree & { readonly surface?: BlockTree["surface"] },
  contract: BlockContract,
  path: BatchError["path"],
) => {
  if (!contract.variants.includes(block.variant))
    throw reject("variant", `${contract.title} has no variant ${block.variant}.`, [
      ...path,
      "variant",
    ]);
  if (contract.placement === "item") {
    if (block.surface !== undefined)
      throw reject("surface", `${contract.title} is an item, so it has no surface.`, [
        ...path,
        "surface",
      ]);
  } else if (block.surface === undefined || !contract.surfaces.includes(block.surface))
    throw reject("surface", `${contract.title} needs one of its surfaces.`, [...path, "surface"]);
  let schema = propsSchemas.get(contract);
  if (schema === undefined) {
    schema = propsSchema(contract.fields, "draft");
    propsSchemas.set(contract, schema);
  }
  check(schema, block.props, "value", [...path, "props"]);
};

/** A block and its items as flat instances, checked against their contracts. */
const flattenTree = (
  page: Draft["pages"][PageId],
  tree: BlockTree,
  contracts: BlockContracts,
): ReadonlyArray<readonly [BlockId, BlockInstance]> => {
  const contract = contractFor(contracts, tree.type);
  checkBlock(tree, contract, []);
  const slotSpecs = contract.placement === "section" ? contract.slots : {};
  const entries: Array<readonly [BlockId, BlockInstance]> = [];
  const slots: Record<string, ReadonlyArray<BlockId>> = {};
  for (const [slot, items] of Object.entries(tree.slots ?? {})) {
    const spec = slotSpecs[slot];
    if (spec === undefined)
      throw reject("unknown-list", `${contract.title} has no slot ${slot}.`, ["slots", slot]);
    items.forEach((item, index) => {
      const path = ["slots", slot, index];
      const itemContract = contractFor(contracts, item.type);
      if (itemContract.placement !== "item" || !spec.accepts.includes(item.type))
        throw reject("placement", `${spec.title} can't hold a ${itemContract.title}.`, path);
      checkBlock(item, itemContract, path);
      const { id, ...instance } = item;
      entries.push([id, instance]);
    });
    slots[slot] = items.map((item) => item.id);
  }
  const { id, slots: _, ...instance } = tree;
  const root: BlockInstance = Object.keys(slots).length === 0 ? instance : { ...instance, slots };
  const all = [[id, root] as const, ...entries];
  const seen = new Set<BlockId>();
  for (const [blockId] of all) {
    if (blockId in page.blocks || seen.has(blockId))
      throw reject("block-exists", `A block with ID ${blockId} is already on this page.`);
    seen.add(blockId);
  }
  return all;
};

/** A placed block with its items, as an insert carries it. */
export const blockTree = (page: Draft["pages"][PageId], id: BlockId): BlockTree => {
  const { slots, ...block } = blockOf(page, id);
  const tree: BlockTree = { ...block, id };
  if (slots === undefined) return tree;
  return {
    ...tree,
    slots: Object.fromEntries(
      Object.entries(slots).map(([slot, items]) => [
        slot,
        items.map((item) => ({ ...blockOf(page, item), id: item })),
      ]),
    ),
  };
};

const insertBlock = (draft: Draft, op: InsertBlock, contracts: BlockContracts) => {
  const page = pageOf(draft, op.page);
  const entries = flattenTree(page, op.block, contracts);
  const ids = listFor(page, op.list, contractFor(contracts, op.block.type), contracts);
  const placed = withList(page, op.list, insertAfter(ids, op.block.id, op.after));
  return {
    draft: {
      ...draft,
      pages: {
        ...draft.pages,
        [op.page]: { ...placed, blocks: { ...placed.blocks, ...Object.fromEntries(entries) } },
      },
    },
    inverse: { op: "removeBlock", page: op.page, block: op.block.id } satisfies Op,
  };
};

const moveBlock = (draft: Draft, op: MoveBlock, contracts: BlockContracts) => {
  const page = pageOf(draft, op.page);
  const block = blockOf(page, op.block);
  const from = locate(page, op.block);
  if (op.after === op.block) throw reject("unknown-list", "A block can't move after itself.");
  const removed = withList(
    page,
    from.list,
    from.ids.filter((id) => id !== op.block),
  );
  const target = listFor(removed, op.list, contractFor(contracts, block.type), contracts);
  const moved = withList(removed, op.list, insertAfter(target, op.block, op.after));
  const inverse: MoveBlock = {
    op: "moveBlock",
    page: op.page,
    block: op.block,
    list: from.list,
    after: from.after,
  };
  return {
    draft: { ...draft, pages: { ...draft.pages, [op.page]: moved } },
    inverse,
  };
};

const removeBlock = (draft: Draft, page: PageId, id: BlockId) => {
  const document = pageOf(draft, page);
  const tree = blockTree(document, id);
  const from = locate(document, id);
  const removed = withList(
    document,
    from.list,
    from.ids.filter((candidate) => candidate !== id),
  );
  const gone = new Set<string>([
    id,
    ...Object.values(tree.slots ?? {})
      .flat()
      .map((item) => item.id),
  ]);
  return {
    draft: {
      ...draft,
      pages: {
        ...draft.pages,
        [page]: {
          ...removed,
          blocks: Object.fromEntries(
            Object.entries(removed.blocks).filter(([candidate]) => !gone.has(candidate)),
          ),
        },
      },
    },
    inverse: {
      op: "insertBlock",
      page,
      list: from.list,
      after: from.after,
      block: tree,
    } satisfies Op,
  };
};

// Pages --------------------------------------------------------------------

const postOnly = new Set<SetMeta["field"]>(["date", "author", "tags", "excerpt", "cover"]);

const optionalMeta = new Set<SetMeta["field"]>(["cover", "image", "canonical", "noindex"]);

const setMeta = (draft: Draft, op: SetMeta) => {
  const page = pageOf(draft, op.page);
  if (page.type === "page" && postOnly.has(op.field))
    throw reject("meta", `A page has no ${op.field}; only posts do.`, [op.field]);
  if (op.value === undefined && !optionalMeta.has(op.field))
    throw reject("meta", `A ${page.type}'s ${op.field} can't be removed.`, [op.field]);
  const meta: Props = page.meta;
  const next = withKey(meta, op.field, op.value);
  const updated: Draft["pages"][PageId] =
    page.type === "post"
      ? { ...page, meta: check(PostMeta, next, "meta", []) }
      : { ...page, meta: check(PageMeta, next, "meta", []) };
  const previous = meta[op.field];
  const undo: SetMeta = { op: "setMeta", page: op.page, field: op.field };
  return {
    draft: { ...draft, pages: { ...draft.pages, [op.page]: updated } },
    inverse: previous === undefined ? undo : { ...undo, value: previous },
  };
};

/** Rejects a page whose address another page in the draft has too. A page that's gone has none. */
const checkPathFree = (draft: Draft, id: PageId) => {
  const path = draft.pages[id]?.path;
  const taken = Object.values(draft.pages).find((other) => other.path === path && other.id !== id);
  if (taken !== undefined)
    throw reject("path-taken", `${taken.meta.title || taken.id} already has the address ${path}.`);
};

const createPage = (draft: Draft, page: Draft["pages"][PageId], contracts: BlockContracts) => {
  if (page.id in draft.pages) throw reject("page-exists", `There's already a page ${page.id}.`);
  check(PageDocument, page, "page", []);
  const inPlace = (id: BlockId, path: BatchError["path"]) => {
    const block = blockOf(page, id);
    checkBlock({ ...block, id }, contractFor(contracts, block.type), path);
  };
  page.root.forEach((id) => {
    const block = blockOf(page, id);
    const contract = contractFor(contracts, block.type);
    if (contract.placement !== "section")
      throw reject("placement", `${contract.title} can't be a section of a page.`, ["blocks", id]);
    inPlace(id, ["blocks", id]);
    for (const [slot, items] of Object.entries(block.slots ?? {})) {
      const spec = contract.slots[slot];
      if (spec === undefined)
        throw reject("unknown-list", `${contract.title} has no slot ${slot}.`, [
          "blocks",
          id,
          "slots",
          slot,
        ]);
      for (const item of items) {
        const itemBlock = blockOf(page, item);
        if (!spec.accepts.includes(itemBlock.type))
          throw reject("placement", `${spec.title} can't hold a ${itemBlock.type}.`, [
            "blocks",
            item,
          ]);
        inPlace(item, ["blocks", item]);
      }
    }
  });
  return {
    draft: { ...draft, pages: { ...draft.pages, [page.id]: page } },
    inverse: { op: "deletePage", page: page.id } satisfies Op,
  };
};

const deletePage = (draft: Draft, id: PageId) => {
  const page = pageOf(draft, id);
  const { [id]: _, ...pages } = draft.pages;
  return {
    draft: { ...draft, pages },
    inverse: { op: "createPage", page } satisfies Op,
  };
};

const setStatus = (draft: Draft, op: SetStatus) => {
  const { status, ...page } = pageOf(draft, op.page);
  const updated: Draft["pages"][PageId] =
    op.status === "unpublished" ? { ...page, status: "unpublished" } : page;
  return {
    draft: { ...draft, pages: { ...draft.pages, [op.page]: updated } },
    inverse: {
      op: "setStatus",
      page: op.page,
      status: status ?? "published",
    } satisfies Op,
  };
};

// Forms, menus and redirects ---------------------------------------------------

const isFormRef = Schema.is(FormRef);
const isMediaRef = Schema.is(MediaRef);

/** The library images a value holds, wherever they sit in it. */
const imagesIn = (value: Json): ReadonlyArray<MediaId> => {
  if (isMediaRef(value)) return [value.id];
  if (isItemList(value)) return value.flatMap(imagesIn);
  return isRecord(value) ? Object.values(value).flatMap(imagesIn) : [];
};

/** The library images some blocks show. */
export const imagesUsedBy = (blocks: BlockHolder["blocks"]): ReadonlySet<MediaId> =>
  new Set(Object.values(blocks).flatMap((block) => Object.values(block.props).flatMap(imagesIn)));

/** The library images a page shows: in its blocks, and as its sharing image or a post's cover. */
export const imagesOnPage = (page: Draft["pages"][PageId]): ReadonlySet<MediaId> =>
  new Set([
    ...imagesUsedBy(page.blocks),
    ...(page.meta.image === undefined ? [] : [page.meta.image.id]),
    ...(page.type === "post" && page.meta.cover !== undefined ? [page.meta.cover.id] : []),
  ]);

/** The forms a value uses, wherever they sit in it. */
const formsIn = (value: Json): ReadonlyArray<FormId> => {
  if (isFormRef(value)) return [value.id];
  if (isItemList(value)) return value.flatMap(formsIn);
  return isRecord(value) ? Object.values(value).flatMap(formsIn) : [];
};

/** The forms some blocks use. */
export const formsUsedBy = (blocks: BlockHolder["blocks"]): ReadonlySet<FormId> =>
  new Set(Object.values(blocks).flatMap((block) => Object.values(block.props).flatMap(formsIn)));

const setForm = (draft: Draft, op: SetForm) => {
  const previous = draft.forms[op.form.id];
  return {
    draft: { ...draft, forms: { ...draft.forms, [op.form.id]: op.form } },
    inverse:
      previous === undefined
        ? ({ op: "removeForm", form: op.form.id } satisfies Op)
        : ({ op: "setForm", form: previous } satisfies Op),
  };
};

const removeForm = (draft: Draft, id: FormId) => {
  const { [id]: previous, ...forms } = draft.forms;
  if (previous === undefined) throw reject("unknown-form", `There's no form ${id}.`);
  const holders = [
    { title: "the header or footer", blocks: draft.parts.blocks },
    ...Object.values(draft.pages).map((page) => ({
      title: page.meta.title || page.path,
      blocks: page.blocks,
    })),
  ];
  const user = holders.find((holder) => formsUsedBy(holder.blocks).has(id));
  if (user !== undefined)
    throw reject("in-use", `${previous.name} is still on ${user.title}. Remove it there first.`);
  return { draft: { ...draft, forms }, inverse: { op: "setForm", form: previous } satisfies Op };
};

const linksTo = (target: MenuItem["target"], page: PageId) =>
  !Predicate.isString(target) && target.id === page;

/**
 * The ops that take every link to a page out of the draft's menus, with the
 * sub-items under a main menu item that goes. Unpublishing or deleting a
 * page sends them in the same batch.
 */
export const menusWithout = (menus: Menus, page: PageId): ReadonlyArray<Op> => {
  const { main, footer } = menus;
  const keptMain = main.flatMap((item) =>
    linksTo(item.target, page)
      ? []
      : [
          item.children === undefined
            ? item
            : { ...item, children: item.children.filter((child) => !linksTo(child.target, page)) },
        ],
  );
  const keptFooter = footer.filter((item) => !linksTo(item.target, page));
  const ops: Array<Op> = [];
  if (!Equal.equals(keptMain, main)) ops.push({ op: "setMenu", menu: "main", items: keptMain });
  if (keptFooter.length !== footer.length)
    ops.push({ op: "setMenu", menu: "footer", items: keptFooter });
  return ops;
};

const setRedirect = (draft: Draft, op: SetRedirect) => {
  const { [op.from]: previous, ...others } = draft.redirects;
  const undo: SetRedirect = { op: "setRedirect", from: op.from };
  return {
    draft: {
      ...draft,
      redirects: op.to === undefined ? others : { ...others, [op.from]: op.to },
    },
    inverse: previous === undefined ? undo : { ...undo, to: previous },
  };
};

// Batches ------------------------------------------------------------------

/** A draft after one op, and the op that undoes it. */
const applyOp = (draft: Draft, op: Op, contracts: BlockContracts) => {
  switch (op.op) {
    case "setProp":
      return setProp(draft, op, contracts);
    case "setVariant": {
      const block = blockOf(holderOf(draft, op.target), op.block);
      const contract = contractFor(contracts, block.type);
      if (!contract.variants.includes(op.variant))
        throw reject("variant", `${contract.title} has no variant ${op.variant}.`);
      return {
        draft: withBlock(draft, op.target, op.block, { ...block, variant: op.variant }),
        inverse: { ...op, variant: block.variant },
      };
    }
    case "setSurface": {
      const block = blockOf(holderOf(draft, op.target), op.block);
      const contract = contractFor(contracts, block.type);
      if (contract.placement === "item" || !contract.surfaces.includes(op.surface))
        throw reject("surface", `${contract.title} has no surface ${op.surface}.`);
      if (block.surface === undefined)
        throw new Error(`Block ${op.block} has no surface to replace.`);
      return {
        draft: withBlock(draft, op.target, op.block, { ...block, surface: op.surface }),
        inverse: { ...op, surface: block.surface },
      };
    }
    case "insertBlock":
      return insertBlock(draft, op, contracts);
    case "moveBlock":
      return moveBlock(draft, op, contracts);
    case "removeBlock":
      return removeBlock(draft, op.page, op.block);
    case "setMeta":
      return setMeta(draft, op);
    case "setPath": {
      const page = pageOf(draft, op.page);
      return {
        draft: { ...draft, pages: { ...draft.pages, [op.page]: { ...page, path: op.path } } },
        inverse: { ...op, path: page.path },
      };
    }
    case "createPage":
      return createPage(draft, op.page, contracts);
    case "deletePage":
      return deletePage(draft, op.page);
    case "setStatus":
      return setStatus(draft, op);
    case "setForm":
      return setForm(draft, op);
    case "removeForm":
      return removeForm(draft, op.form);
    case "setMenu": {
      const menus = draft.parts.menus;
      return {
        draft: {
          ...draft,
          parts: {
            ...draft.parts,
            menus:
              op.menu === "main" ? { ...menus, main: op.items } : { ...menus, footer: op.items },
          },
        },
        inverse: (op.menu === "main"
          ? { op: "setMenu", menu: "main", items: menus.main }
          : { op: "setMenu", menu: "footer", items: menus.footer }) satisfies Op,
      };
    }
    case "setRedirect":
      return setRedirect(draft, op);
    case "rebase":
      return {
        draft: { ...draft, base: op.base, lockfile: op.lockfile, brand: op.brand },
        inverse: {
          op: "rebase",
          base: draft.base,
          lockfile: draft.lockfile,
          brand: draft.brand,
        } satisfies Op,
      };
  }
};

/** The page an op gives an address to, if it gives one. */
const addressedBy = (op: Op) => {
  if (op.op === "setPath") return op.page;
  if (op.op === "createPage") return op.page.id;
  return null;
};

/**
 * Applies a batch of ops to a draft, all or none. A rejected batch reports
 * the first op that failed, with every problem found in it.
 */
export const applyOps = (
  draft: Draft,
  ops: ReadonlyArray<Op>,
  contracts: BlockContracts,
): ApplyResult => {
  let current = draft;
  const inverse: Array<Op> = [];
  const steps: Array<Step> = [];
  // Addresses are checked once the whole batch has applied, so a batch can
  // swap two pages' addresses. Each page maps to the last op that addressed it.
  const addressed = new Map<PageId, number>();
  const rejected = (error: Rejection, index: number): ApplyResult => ({
    ok: false,
    errors: error.errors.map((found) => ({ ...found, op: index })),
  });
  for (const [index, op] of ops.entries()) {
    try {
      const applied = applyOp(current, op, contracts);
      steps.push({ op, before: current });
      current = applied.draft;
      inverse.unshift(applied.inverse);
      const page = addressedBy(op);
      if (page !== null) addressed.set(page, index);
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      return rejected(error, index);
    }
  }
  for (const [page, index] of addressed) {
    try {
      checkPathFree(current, page);
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      return rejected(error, index);
    }
  }
  return { ok: true, draft: current, inverse, steps };
};

/**
 * Applies each op that `keep` accepts and that still applies, and passes
 * over the rest. Undo works this way: the parts of a command that others
 * have changed since, or that no longer exist, are left as they are.
 */
export const applyEach = (
  draft: Draft,
  ops: ReadonlyArray<Op>,
  contracts: BlockContracts,
  keep: (op: Op, draft: Draft) => boolean,
) => {
  let current = draft;
  const inverse: Array<Op> = [];
  const steps: Array<Step> = [];
  const skipped: Array<number> = [];
  for (const [index, op] of ops.entries()) {
    if (!keep(op, current)) {
      skipped.push(index);
      continue;
    }
    try {
      const result = applyOp(current, op, contracts);
      const page = addressedBy(op);
      if (page !== null) checkPathFree(result.draft, page);
      steps.push({ op, before: current });
      current = result.draft;
      inverse.unshift(result.inverse);
    } catch (error) {
      if (!(error instanceof Rejection)) throw error;
      skipped.push(index);
    }
  }
  return { draft: current, inverse, steps, skipped };
};
