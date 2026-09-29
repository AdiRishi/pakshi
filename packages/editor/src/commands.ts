import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BlockType, PageId } from "@repo/contracts/ids";
import type { BlockList, Op, Target } from "@repo/contracts/ops";
import type { PageDocument } from "@repo/contracts/page";
import type { BlockContracts } from "@repo/domain/document";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  type LucideIcon,
  PlusIcon,
  Redo2Icon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";

import type { EditorState, Selection } from "./store.ts";
import {
  allowedTypes,
  blockLabel,
  duplicateOp,
  insertOp,
  listOf,
  moveByOne,
  moveDestinations,
  moveOp,
  removeOp,
  sameList,
} from "./structure.ts";

/** A key with modifiers. `mod` is ⌘ on a Mac and Ctrl elsewhere. */
export interface Shortcut {
  readonly key: string;
  readonly mod?: true;
  readonly alt?: true;
  readonly shift?: true;
}

/**
 * Where a command's shortcuts work. Keys typed in a text field always go to
 * the field first.
 *
 * - `editor`: anywhere in Studio or the canvas.
 * - `block`: with a block chosen in the canvas or the outline.
 * - `canvas`: on the page in the canvas.
 */
export type Where = "editor" | "block" | "canvas";

export interface CommandContext {
  readonly state: EditorState;
  readonly contracts: BlockContracts;
}

/** What running a command does. */
export type Effect =
  | {
      readonly kind: "change";
      readonly ops: ReadonlyArray<Op>;
      /** What to select once the ops apply. */
      readonly select?: Selection | null;
      /** What a screen reader hears, from the draft once the ops apply. */
      readonly announce: (draft: Draft) => string;
    }
  | { readonly kind: "select"; readonly selection: Selection | null }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" }
  /** Opens the block picker for a spot in a list. */
  | { readonly kind: "pick"; readonly list: BlockList; readonly after: BlockId | null };

/**
 * A command, defined once: its shortcuts, where it shows in the block menu
 * and the toolbar, and what it does. `plan` is also its availability check: a
 * menu shows the command as available exactly when `plan` returns an effect.
 */
export interface Command<Args = void> {
  readonly title: string;
  readonly icon?: LucideIcon;
  readonly keys?: {
    readonly where: Where;
    /** The first is the one menus show. */
    readonly shortcuts: readonly [Shortcut, ...Array<Shortcut>];
  };
  /** The block menu's group this command shows in. */
  readonly menu?: "move" | "add" | "change";
  readonly toolbar?: true;
  readonly plan: (context: CommandContext, args: Args) => Effect | undefined;
}

// Reading the state ----------------------------------------------------------

interface ChosenBlock {
  readonly page: PageDocument;
  readonly block: BlockId;
}

/** The chosen block, when it's a block on the page rather than a field or the header or footer. */
const chosenBlock = ({ state }: CommandContext): ChosenBlock | undefined => {
  const { selection } = state;
  if (selection?.kind !== "block" || selection.target === "site") return undefined;
  const page = state.view.pages[selection.target];
  return page?.blocks[selection.block] === undefined ? undefined : { page, block: selection.block };
};

const labelOf = (context: CommandContext, page: PageDocument, block: BlockId) => {
  const instance = page.blocks[block];
  return instance === undefined ? "block" : blockLabel(context.contracts, instance);
};

/** Where a block sits in a draft, as a screen reader hears it: "2 of 3 in Why come". */
const whereIn = (context: CommandContext, draft: Draft, chosen: ChosenBlock) => {
  const page = draft.pages[chosen.page.id];
  const position = page === undefined ? undefined : listOf(page, chosen.block);
  if (page === undefined || position === undefined) return "no longer on the page";
  const place = `${position.ids.indexOf(chosen.block) + 1} of ${position.ids.length}`;
  return position.list === "root"
    ? `${place} on the page`
    : `${place} in ${labelOf(context, page, position.list.block)}`;
};

/** The blocks in the order a person moves through them: header, sections and their items, footer. */
const blockOrder = (draft: Draft, page: PageId) => {
  const document = draft.pages[page];
  const sections = (document?.root ?? []).flatMap(
    (id): ReadonlyArray<{ target: Target; block: BlockId }> => [
      { target: page, block: id },
      ...Object.values(document?.blocks[id]?.slots ?? {})
        .flat()
        .map((item) => ({ target: page, block: item })),
    ],
  );
  return [
    { target: "site" as const, block: draft.parts.header },
    ...sections,
    { target: "site" as const, block: draft.parts.footer },
  ];
};

const step = (context: CommandContext, by: 1 | -1): Effect | undefined => {
  const { view, page, selection } = context.state;
  const order = blockOrder(view, page);
  const index = selection === null ? -1 : order.findIndex(({ block }) => block === selection.block);
  const next = index === -1 && by === -1 ? order.at(-1) : order[index + by];
  return next === undefined ? undefined : { kind: "select", selection: { kind: "block", ...next } };
};

// Commands -------------------------------------------------------------------

export const undo: Command = {
  title: "Undo",
  icon: Undo2Icon,
  keys: { where: "editor", shortcuts: [{ key: "z", mod: true }] },
  toolbar: true,
  plan: ({ state }) => (state.canUndo ? { kind: "undo" } : undefined),
};

export const redo: Command = {
  title: "Redo",
  icon: Redo2Icon,
  keys: {
    where: "editor",
    shortcuts: [
      { key: "z", mod: true, shift: true },
      { key: "y", mod: true },
    ],
  },
  toolbar: true,
  plan: ({ state }) => (state.canRedo ? { kind: "redo" } : undefined),
};

export const selectNext: Command = {
  title: "Go to the next block",
  keys: { where: "canvas", shortcuts: [{ key: "ArrowDown" }] },
  plan: (context) => step(context, 1),
};

export const selectPrevious: Command = {
  title: "Go to the previous block",
  keys: { where: "canvas", shortcuts: [{ key: "ArrowUp" }] },
  plan: (context) => step(context, -1),
};

/** Moves from a block into its first field that's edited on the page. */
export const enterBlock: Command = {
  title: "Edit it on the page",
  keys: { where: "canvas", shortcuts: [{ key: "Enter" }] },
  plan: ({ state, contracts }) => {
    const { selection, view } = state;
    if (selection?.kind !== "block") return undefined;
    const holder = selection.target === "site" ? view.parts : view.pages[selection.target];
    const instance = holder?.blocks[selection.block];
    const contract = instance === undefined ? undefined : contracts.get(instance.type);
    const name = Object.entries(contract?.fields ?? {}).find(
      ([field, definition]) =>
        instance?.props[field] !== undefined &&
        ["text", "richText", "media", "cta"].includes(definition.kind),
    )?.[0];
    return name === undefined
      ? undefined
      : { kind: "select", selection: { ...selection, kind: "field", path: [name] } };
  },
};

/** Moves out from a field to its block, or from an item to its section. */
export const exitBlock: Command = {
  title: "Go to the enclosing block",
  keys: { where: "canvas", shortcuts: [{ key: "Escape" }] },
  plan: ({ state }) => {
    const { selection, view } = state;
    if (selection === null) return undefined;
    if (selection.kind === "field")
      return {
        kind: "select",
        selection: { kind: "block", target: selection.target, block: selection.block },
      };
    const page = selection.target === "site" ? undefined : view.pages[selection.target];
    const list = page === undefined ? undefined : listOf(page, selection.block)?.list;
    return {
      kind: "select",
      selection:
        list === undefined || list === "root"
          ? null
          : { kind: "block", target: selection.target, block: list.block },
    };
  },
};

const moveCommand = (direction: "up" | "down"): Command => ({
  title: direction === "up" ? "Move up" : "Move down",
  icon: direction === "up" ? ArrowUpIcon : ArrowDownIcon,
  keys: {
    where: "block",
    shortcuts: [{ key: direction === "up" ? "ArrowUp" : "ArrowDown", alt: true }],
  },
  menu: "move",
  plan: (context) => {
    const chosen = chosenBlock(context);
    if (chosen === undefined) return undefined;
    const op = moveByOne(chosen.page, context.contracts, chosen.block, direction);
    if (op === undefined) return undefined;
    return {
      kind: "change",
      ops: [op],
      announce: (draft) =>
        `Moved ${labelOf(context, chosen.page, chosen.block)} ${direction}, ${whereIn(context, draft, chosen)}.`,
    };
  },
});

export const moveUp = moveCommand("up");
export const moveDown = moveCommand("down");

/** Moves a block to a spot in a list, as a drop does. */
export const place: Command<{
  readonly block: BlockId;
  readonly list: BlockList;
  readonly after: BlockId | null;
}> = {
  title: "Move here",
  plan: (context, { block, list, after }) => {
    const page = context.state.view.pages[context.state.page];
    const op = page === undefined ? undefined : moveOp(page, context.contracts, block, list, after);
    if (page === undefined || op === undefined) return undefined;
    const chosen = { page, block };
    return {
      kind: "change",
      ops: [op],
      select: { kind: "block", target: page.id, block },
      announce: (draft) =>
        `Moved ${labelOf(context, page, block)}, ${whereIn(context, draft, chosen)}.`,
    };
  },
};

/** Moves an item to the end of another section's slot that accepts it. */
export const moveTo: Command<{ readonly list: Exclude<BlockList, "root"> }> = {
  title: "Move to",
  plan: (context, { list }) => {
    const chosen = chosenBlock(context);
    if (chosen === undefined) return undefined;
    const destination = moveDestinations(chosen.page, context.contracts, chosen.block).find(
      (candidate) => sameList(candidate.list, list),
    );
    const op =
      destination === undefined
        ? undefined
        : moveOp(
            chosen.page,
            context.contracts,
            chosen.block,
            list,
            destination.ids.at(-1) ?? null,
          );
    if (op === undefined) return undefined;
    return {
      kind: "change",
      ops: [op],
      announce: (draft) =>
        `Moved ${labelOf(context, chosen.page, chosen.block)} to ${labelOf(context, chosen.page, list.block)}, ${whereIn(context, draft, chosen)}.`,
    };
  },
};

export const duplicate: Command = {
  title: "Duplicate",
  icon: CopyIcon,
  keys: { where: "block", shortcuts: [{ key: "d", mod: true }] },
  menu: "change",
  plan: (context) => {
    const chosen = chosenBlock(context);
    const op = chosen === undefined ? undefined : duplicateOp(chosen.page, chosen.block);
    if (chosen === undefined || op === undefined) return undefined;
    return {
      kind: "change",
      ops: [op],
      select: { kind: "block", target: chosen.page.id, block: op.block.id },
      announce: (draft) =>
        `Duplicated ${labelOf(context, chosen.page, chosen.block)}. The copy is ${whereIn(context, draft, { page: chosen.page, block: op.block.id })}.`,
    };
  },
};

/** Removes the block, and chooses the block that takes its place, or the one before it. */
export const remove: Command = {
  title: "Remove",
  icon: Trash2Icon,
  keys: { where: "block", shortcuts: [{ key: "Backspace" }, { key: "Delete" }] },
  menu: "change",
  plan: (context) => {
    const chosen = chosenBlock(context);
    const position = chosen === undefined ? undefined : listOf(chosen.page, chosen.block);
    if (chosen === undefined || position === undefined) return undefined;
    const index = position.ids.indexOf(chosen.block);
    const next =
      position.ids[index + 1] ??
      position.ids[index - 1] ??
      (position.list === "root" ? undefined : position.list.block);
    return {
      kind: "change",
      ops: [removeOp(chosen.page.id, chosen.block)],
      select: next === undefined ? null : { kind: "block", target: chosen.page.id, block: next },
      announce: () => `Removed ${labelOf(context, chosen.page, chosen.block)}.`,
    };
  },
};

/** Opens the block picker for the spot right after the chosen block. */
export const addAfter: Command = {
  title: "Add after",
  icon: PlusIcon,
  menu: "add",
  plan: (context) => {
    const chosen = chosenBlock(context);
    const position = chosen === undefined ? undefined : listOf(chosen.page, chosen.block);
    return chosen === undefined || position === undefined
      ? undefined
      : { kind: "pick", list: position.list, after: chosen.block };
  },
};

/** Opens the block picker for the end of one of the chosen section's slots. */
export const addInto: Command<{ readonly slot: string }> = {
  title: "Add to",
  icon: PlusIcon,
  plan: (context, { slot }) => {
    const chosen = chosenBlock(context);
    const section = chosen?.page.blocks[chosen.block];
    const contract = section === undefined ? undefined : context.contracts.get(section.type);
    if (chosen === undefined || contract?.placement !== "section" || !(slot in contract.slots))
      return undefined;
    return {
      kind: "pick",
      list: { block: chosen.block, slot },
      after: section?.slots?.[slot]?.at(-1) ?? null,
    };
  },
};

/** Adds a new block of a type, with its placeholder content, and chooses it. */
export const insert: Command<{
  readonly list: BlockList;
  readonly after: BlockId | null;
  readonly type: BlockType;
}> = {
  title: "Add",
  plan: (context, { list, after, type }) => {
    const { page } = context.state;
    const document = context.state.view.pages[page];
    const contract = context.contracts.get(type);
    if (contract === undefined || document === undefined) return undefined;
    if (!allowedTypes(document, context.contracts, list).includes(type)) return undefined;
    const op = insertOp(context.contracts, page, list, after, type);
    return {
      kind: "change",
      ops: [op],
      select: { kind: "block", target: page, block: op.block.id },
      announce: (draft) =>
        `Added ${contract.title}, ${whereIn(context, draft, { page: document, block: op.block.id })}.`,
    };
  },
};

/** The commands that take no arguments, in the order menus show them and shortcuts match. */
const commands: ReadonlyArray<Command> = [
  undo,
  redo,
  addAfter,
  moveUp,
  moveDown,
  duplicate,
  remove,
  selectNext,
  selectPrevious,
  enterBlock,
  exitBlock,
];

export const keyboardCommands = commands.filter((command) => command.keys !== undefined);

export const toolbarCommands = commands.filter((command) => command.toolbar === true);

/** The block menu's commands, by group. */
export const blockMenuGroups = (["move", "add", "change"] as const).map((group) =>
  commands.filter((command) => command.menu === group),
);
