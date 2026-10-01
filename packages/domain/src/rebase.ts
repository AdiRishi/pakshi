import type { Draft, SiteContent } from "@repo/contracts/draft";
import { type BlockId, FormId } from "@repo/contracts/ids";
import type { BlockList, ItemTree, MetaField, Op, SetProp, Target } from "@repo/contracts/ops";
import type { BlockInstance, PageDocument } from "@repo/contracts/page";
import type { LiveRelease } from "@repo/contracts/snapshot";
import { Equal } from "effect";

import { applyOps, type BlockContracts } from "./document.ts";

/*
 * A merge ends in content the draft should have. SiteDoc commits the way
 * there as one batch of ordinary ops, so it reaches everyone editing the
 * draft like any other change, and records who wrote each part it changes.
 */

const metaFields: ReadonlyArray<MetaField> = [
  "title",
  "description",
  "date",
  "author",
  "tags",
  "excerpt",
  "cover",
  "image",
  "canonical",
  "noindex",
];

const same = <T>(a: T, b: T) => Equal.equals(a, b);

/** The ops that set a block's variant, surface and props to another's. */
const contentOps = (
  target: Target,
  block: BlockId,
  from: BlockInstance,
  to: BlockInstance,
): ReadonlyArray<Op> => {
  const ops: Array<Op> = [];
  if (from.variant !== to.variant)
    ops.push({ op: "setVariant", target, block, variant: to.variant });
  if (to.surface !== undefined && from.surface !== to.surface)
    ops.push({ op: "setSurface", target, block, surface: to.surface });
  for (const name of new Set([...Object.keys(from.props), ...Object.keys(to.props)])) {
    const value = to.props[name];
    if (same(from.props[name], value)) continue;
    const op: SetProp = { op: "setProp", target, block, path: [name] };
    ops.push(value === undefined ? op : { ...op, value });
  }
  return ops;
};

/** Each block's list in a page, keyed `root` or `{section}/{slot}`. */
const parentsOf = (page: PageDocument) =>
  new Map<BlockId, string>([
    ...page.root.map((id) => [id, "root"] as const),
    ...page.root.flatMap((section) =>
      Object.entries(page.blocks[section]?.slots ?? {}).flatMap(([slot, items]) =>
        items.map((item) => [item, `${section}/${slot}`] as const),
      ),
    ),
  ]);

/** The positions in a sequence that form its longest increasing run, which can stay where they are. */
const longestIncreasing = (values: ReadonlyArray<number>): ReadonlySet<number> => {
  const tails: Array<number> = [];
  const previous = Array.from<number>({ length: values.length }).fill(-1);
  for (const [index, value] of values.entries()) {
    let low = 0;
    let high = tails.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((values[tails[middle] ?? 0] ?? 0) < value) low = middle + 1;
      else high = middle;
    }
    previous[index] = low > 0 ? (tails[low - 1] ?? -1) : -1;
    tails[low] = index;
  }
  const kept = new Set<number>();
  for (let index = tails.at(-1) ?? -1; index !== -1; index = previous[index] ?? -1) kept.add(index);
  return kept;
};

/**
 * The ops that take a draft to `content` on a new base: a rebase first, then
 * forms, menus, redirects, the header and footer, pages, blocks, fields and
 * addresses, and last the forms `content` doesn't have, once no block uses
 * them. `contracts` are the block versions `content` pins.
 */
export const rebaseOps = (
  draft: Draft,
  content: SiteContent,
  base: LiveRelease,
  contracts: BlockContracts,
): ReadonlyArray<Op> => {
  const ops: Array<Op> = [];
  // Ops that give pages their addresses come last, and apply together, so
  // pages can swap addresses.
  const addresses: Array<Op> = [];
  let working = draft;
  const emit = (op: Op) => {
    const applied = applyOps(working, [op], contracts);
    if (!applied.ok)
      throw new Error(
        `A rebase op doesn't apply: ${applied.errors.map((error) => error.message).join(" ")}`,
      );
    working = applied.draft;
    ops.push(op);
  };

  emit({ op: "rebase", base, lockfile: content.lockfile, brand: content.brand });
  for (const form of Object.values(content.forms))
    if (!same(working.forms[form.id], form)) emit({ op: "setForm", form });
  if (!same(working.parts.menus.main, content.parts.menus.main))
    emit({ op: "setMenu", menu: "main", items: content.parts.menus.main });
  if (!same(working.parts.menus.footer, content.parts.menus.footer))
    emit({ op: "setMenu", menu: "footer", items: content.parts.menus.footer });
  for (const from of new Set([
    ...Object.keys(working.redirects),
    ...Object.keys(content.redirects),
  ])) {
    const [current, to] = [working.redirects[from], content.redirects[from]];
    if (!same(current, to))
      emit(to === undefined ? { op: "setRedirect", from } : { op: "setRedirect", from, to });
  }
  for (const id of [content.parts.header, content.parts.footer]) {
    const [from, to] = [working.parts.blocks[id], content.parts.blocks[id]];
    if (from === undefined || to === undefined)
      throw new Error(`The header and footer keep their blocks, but ${id} is missing.`);
    contentOps("site", id, from, to).forEach(emit);
  }

  for (const page of Object.values(working.pages))
    if (!(page.id in content.pages)) emit({ op: "deletePage", page: page.id });
  for (const target of Object.values(content.pages)) {
    const current = working.pages[target.id];
    if (current === undefined) {
      addresses.push({ op: "createPage", page: target });
      continue;
    }
    if (current.status !== target.status)
      emit({ op: "setStatus", page: target.id, status: target.status ?? "published" });
    pageOps(target, () => working.pages[target.id] ?? current, emit);
    for (const field of metaFields) {
      const [from, to] = [metaOf(current)[field], metaOf(target)[field]];
      if (same(from, to)) continue;
      emit(
        to === undefined
          ? { op: "setMeta", page: target.id, field }
          : { op: "setMeta", page: target.id, field, value: to },
      );
    }
    if (current.path !== target.path)
      addresses.push({ op: "setPath", page: target.id, path: target.path });
  }
  const removedForms: ReadonlyArray<Op> = Object.keys(working.forms)
    .filter((id) => !(id in content.forms))
    .map((id) => ({ op: "removeForm", form: FormId.make(id) }));
  return [...ops, ...addresses, ...removedForms];
};

const metaOf = (page: PageDocument): Readonly<Record<string, SetProp["value"]>> => page.meta;

/** The ops that give an existing page another's blocks, in its order. */
const pageOps = (target: PageDocument, current: () => PageDocument, emit: (op: Op) => void) => {
  const page = target.id;
  const itemTree = (id: BlockId): ItemTree => {
    const block = target.blocks[id];
    if (block === undefined) throw new Error(`Block ${id} isn't on the page.`);
    return { id, type: block.type, variant: block.variant, props: block.props };
  };

  // New sections, with the items that are new too.
  for (const id of target.root) {
    const section = target.blocks[id];
    if (id in current().blocks) continue;
    if (section === undefined) throw new Error(`Section ${id} isn't on the page.`);
    const { slots, ...block } = section;
    const newItems = Object.fromEntries(
      Object.entries(slots ?? {}).map(([slot, items]) => [
        slot,
        items.filter((item) => !(item in current().blocks)).map(itemTree),
      ]),
    );
    emit({
      op: "insertBlock",
      page,
      list: "root",
      after: null,
      block: slots === undefined ? { ...block, id } : { ...block, id, slots: newItems },
    });
  }
  // Items into their sections: new ones inserted, others moved there.
  const targetParents = parentsOf(target);
  for (const [item, parent] of targetParents) {
    if (parent === "root") continue;
    const section = target.root.find((id) => parent.startsWith(`${id}/`));
    if (section === undefined) continue;
    const into: BlockList = { block: section, slot: parent.slice(section.length + 1) };
    if (!(item in current().blocks))
      emit({ op: "insertBlock", page, list: into, after: null, block: itemTree(item) });
    else if (parentsOf(current()).get(item) !== parent)
      emit({ op: "moveBlock", page, block: item, list: into, after: null });
  }
  // Blocks the target doesn't have. A section takes its remaining items with it.
  const before = current();
  const currentParents = parentsOf(before);
  const removed = new Set(Array.from(currentParents.keys()).filter((id) => !(id in target.blocks)));
  for (const id of removed) {
    const section = before.root.find((candidate) =>
      (currentParents.get(id) ?? "root").startsWith(`${candidate}/`),
    );
    if (section === undefined || !removed.has(section))
      emit({ op: "removeBlock", page, block: id });
  }
  // Each list in the target's order, moving as few blocks as possible.
  const lists: ReadonlyArray<readonly [BlockList, ReadonlyArray<BlockId>]> = [
    ["root", target.root],
    ...target.root.flatMap((section) =>
      Object.entries(target.blocks[section]?.slots ?? {}).map(
        ([slot, items]) => [{ block: section, slot }, items] as const,
      ),
    ),
  ];
  for (const [list, wanted] of lists) {
    const now =
      list === "root" ? current().root : (current().blocks[list.block]?.slots?.[list.slot] ?? []);
    const stay = longestIncreasing(wanted.map((id) => now.indexOf(id)));
    for (const [index, id] of wanted.entries())
      if (!stay.has(index))
        emit({ op: "moveBlock", page, block: id, list, after: wanted[index - 1] ?? null });
  }
  // Fields.
  for (const id of targetParents.keys()) {
    const [from, to] = [current().blocks[id], target.blocks[id]];
    if (from !== undefined && to !== undefined) contentOps(page, id, from, to).forEach(emit);
  }
};
