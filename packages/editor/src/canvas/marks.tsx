import { type BlockContract, type Field, fieldAt } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import { BlockId } from "@repo/contracts/ids";
import type { Op, Target } from "@repo/contracts/ops";
import { Button } from "@repo/ui/components/button";
import { cn } from "cn";
import { Option, Schema } from "effect";
import { ArrowDownIcon, ArrowUpIcon, LayersIcon, LinkIcon, XIcon } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

import { useEditorState, useEditorUi, useServices, useStore } from "../context.tsx";
import { neededParts } from "../layouts.ts";
import { listIds, listRoom, moveListItem, moveSlotItem, removeListItem } from "../lists.ts";
import { fewestLabel, fullLabel, itemLabel, itemNaming, listNaming } from "../naming.ts";
import { valueAt } from "../settings/controls.tsx";
import type { EditorState, ItemKey, Pointed } from "../store.ts";
import { listOf, removeOp } from "../structure.ts";
import { type Rect, rectIn } from "./anchor.tsx";
import { blockElement, fieldElement, itemAt, itemElement, itemOf, partsOf } from "./regions.ts";

/*
 * The marks Studio draws over the canvas for the part under the pointer or
 * selected: a list item's toolbar, the × that removes an optional part, the
 * label and length of the words being typed, and the mark of a link with no
 * element of its own. They're Studio's own elements, laid over the frame, so
 * they keep Studio's look and size however the frame is scaled.
 */

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

const decodeBlockId = Schema.decodeUnknownOption(BlockId);

const sameKey = (a: ItemKey | null, b: ItemKey | null) =>
  a !== null && b !== null && a.list === b.list && a.id === b.id;

/** A block's place in the draft and its contract, read from the state. */
const placed = (
  state: EditorState,
  contracts: ReadonlyMap<string, BlockContract>,
  target: Target,
  block: BlockId,
) => {
  const instance = holderOf(state.view, target)?.blocks[block];
  const contract = instance === undefined ? undefined : contracts.get(instance.type);
  return instance === undefined || contract === undefined ? undefined : { instance, contract };
};

/** Where a block sits in the draft: the header and footer belong to the site, the rest to the page. */
const targetOf = (state: EditorState, block: BlockId): Target =>
  block in state.view.parts.blocks ? "site" : state.page;

// What the pointer is over ------------------------------------------------

/**
 * Follows the pointer over the canvas into the store. Moving onto one of
 * the marks keeps what it was over, so the marks stay while they're used.
 */
const usePointer = (document: Document) => {
  const store = useStore();
  const held = useRef(false);
  const leaving = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    const view = document.defaultView;
    const onMove = (event: PointerEvent) => {
      clearTimeout(leaving.current);
      const element = view !== null && event.target instanceof view.Element ? event.target : null;
      const root = element?.closest("[data-pakshi-block]") ?? null;
      const block = Option.getOrUndefined(
        decodeBlockId(root?.getAttribute("data-pakshi-block") ?? ""),
      );
      if (root === null || element === null || block === undefined) return store.point(null);
      const field = element.closest("[data-pakshi-field]");
      const path =
        field !== null && field.closest("[data-pakshi-block]") === root
          ? (field.getAttribute("data-pakshi-field")?.split(".") ?? null)
          : null;
      const item =
        (path === null ? null : itemOf(path)) ?? itemAt(root, event.clientX, event.clientY);
      const pointed: Pointed = { target: targetOf(store.getState(), block), block, path, item };
      store.point(pointed);
    };
    const onLeave = () => {
      clearTimeout(leaving.current);
      leaving.current = setTimeout(() => {
        if (!held.current) store.point(null);
      }, 200);
    };
    document.addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      clearTimeout(leaving.current);
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [document, store]);
  return {
    onPointerEnter: () => {
      held.current = true;
      clearTimeout(leaving.current);
    },
    onPointerLeave: () => {
      held.current = false;
      leaving.current = setTimeout(() => store.point(null), 200);
    },
  };
};

// The marks ---------------------------------------------------------------

/** A list item, or an item block in a slot, with what can be done to it from its toolbar. */
interface ItemMark {
  readonly key: string;
  readonly rect: Rect;
  readonly label: string;
  readonly earlier: Op | undefined;
  readonly later: Op | undefined;
  readonly remove: Op | undefined;
  /** Why it can't be removed, when its list has the fewest it can. */
  readonly fewest: string | null;
  /** How the length of the words being typed in it stands. */
  readonly typing: Pick<StatusMark, "status" | "tone"> | null;
}

/** The × on an optional part, or the note that the chosen layout needs it. */
interface RemovalMark {
  readonly key: string;
  readonly rect: Rect;
  readonly remove: Op | null;
}

/** The name of the words being typed and how their length stands. */
interface StatusMark {
  readonly rect: Rect;
  readonly label: string;
  readonly status: string | null;
  readonly tone: "plain" | "limit" | "short";
  readonly beside: "start" | "end";
}

interface LinkMark {
  readonly key: string;
  readonly rect: Rect;
  readonly field: {
    readonly target: Target;
    readonly block: BlockId;
    readonly path: ReadonlyArray<string>;
  };
  readonly set: boolean;
  readonly label: string;
}

interface NoteMark {
  readonly key: string;
  readonly rect: Rect;
  readonly text: string;
  readonly icon: "form" | null;
}

interface Marks {
  readonly items: ReadonlyArray<ItemMark>;
  readonly removals: ReadonlyArray<RemovalMark>;
  readonly status: StatusMark | null;
  readonly links: ReadonlyArray<LinkMark>;
  readonly notes: ReadonlyArray<NoteMark>;
}

const noMarks: Marks = { items: [], removals: [], status: null, links: [], notes: [] };

/** The parts that a block draws on the page, which can be removed with an ×. */
const drawnKinds: ReadonlySet<Field["kind"]> = new Set(["text", "richText", "media", "cta"]);

/** How far typed words are from their limits, as the chip over them says it. */
const lengthStatus = (
  text: string,
  limits: { readonly min: number; readonly max: number },
): Pick<StatusMark, "status" | "tone"> => {
  const length = text.length;
  const short = limits.min - text.trim().length;
  if (length === 0 && limits.min > 0) return { status: "Can't be empty", tone: "short" };
  if (short > 0)
    return {
      status: `Needs ${short} more ${short === 1 ? "character" : "characters"}`,
      tone: "short",
    };
  if (length >= limits.max) return { status: "That's the limit", tone: "limit" };
  if (length >= limits.max * 0.75) {
    const left = limits.max - length;
    return { status: `${left} ${left === 1 ? "character" : "characters"} left`, tone: "plain" };
  }
  return { status: null, tone: "plain" };
};

const measureMarks = (
  document: Document,
  container: HTMLElement,
  state: EditorState,
  contracts: ReadonlyMap<string, BlockContract>,
  forms: Draft["forms"],
): Marks => {
  const rect = (element: Element | null | undefined) =>
    element === null || element === undefined ? null : rectIn(element, container);
  const { pointed, selection } = state;
  const items: Array<ItemMark> = [];
  const removals: Array<RemovalMark> = [];
  const links: Array<LinkMark> = [];
  const notes: Array<NoteMark> = [];
  let status: StatusMark | null = null;

  // Parts under the pointer or selected, each as a block and a path in it.
  const pointedField =
    pointed !== null && pointed.path !== null
      ? { target: pointed.target, block: pointed.block, path: pointed.path }
      : null;
  const selectedField = selection?.kind === "field" ? selection : null;
  const activeItems = [
    ...(pointed?.item === null || pointed === null ? [] : [{ ...pointed, item: pointed.item }]),
    ...(selectedField === null || itemOf(selectedField.path) === null
      ? []
      : [{ ...selectedField, item: itemOf(selectedField.path) }]),
  ];

  // A list item's toolbar, for the item under the pointer and the one holding the selection.
  const seenItems = new Set<string>();
  for (const active of activeItems) {
    if (active.item === null) continue;
    const key = `${active.block}:${active.item.list}:${active.item.id}`;
    if (seenItems.has(key)) continue;
    seenItems.add(key);
    const found = placed(state, contracts, active.target, active.block);
    const root = blockElement(document, active.block);
    const field = found?.contract.fields[active.item.list];
    if (found === undefined || root === null || field?.kind !== "list") continue;
    const region = rect(itemElement(root, active.item));
    if (region === null) continue;
    const ids = listIds(found.instance.props, active.item.list);
    const index = ids.indexOf(active.item.id);
    if (index === -1) continue;
    const change = {
      target: active.target,
      block: active.block,
      props: found.instance.props,
      list: active.item.list,
      id: active.item.id,
    };
    const room = listRoom(field, ids.length);
    items.push({
      key,
      rect: region,
      label: itemLabel(listNaming(found.contract, active.item.list), index),
      earlier: moveListItem({ ...change, by: -1 }),
      later: moveListItem({ ...change, by: 1 }),
      remove: removeListItem({ ...change, field }),
      fewest: room.canRemove ? null : fewestLabel(field.min),
      typing: null,
    });
    if (!room.canAdd && index === ids.length - 1)
      notes.push({
        key: `${key}:full`,
        rect: { ...region, top: region.top + region.height + 8, height: 0 },
        text: fullLabel(listNaming(found.contract, active.item.list), field.max),
        icon: null,
      });
  }

  // An item block's toolbar, for the item under the pointer and the selected one.
  const page = state.view.pages[state.page];
  for (const block of new Set([pointed?.block, selection?.block])) {
    if (block === undefined || page === undefined) continue;
    const position = listOf(page, block);
    const contract = contracts.get(page.blocks[block]?.type ?? "");
    if (position === undefined || position.list === "root" || contract === undefined) continue;
    const region = rect(blockElement(document, block));
    if (region === null) continue;
    const slot = { page, list: position.list, contracts };
    items.push({
      key: block,
      rect: region,
      label: itemLabel(itemNaming(contract), position.ids.indexOf(block)),
      earlier: moveSlotItem(slot, block, -1),
      later: moveSlotItem(slot, block, 1),
      remove: removeOp(page.id, block),
      fewest: null,
      typing: null,
    });
  }

  // The × on an optional part, or what says the layout needs it.
  for (const field of [pointedField, selectedField]) {
    if (field === null) continue;
    const found = placed(state, contracts, field.target, field.block);
    const definition = found === undefined ? undefined : fieldAt(found.contract.fields, field.path);
    const root = blockElement(document, field.block);
    if (found === undefined || definition === undefined || root === null) continue;
    if (!definition.optional || !drawnKinds.has(definition.kind)) continue;
    if (valueAt(found.instance.props, field.path) === undefined) continue;
    const key = `${field.block}:${field.path.join(".")}`;
    if (removals.some((removal) => removal.key === key)) continue;
    const region = rect(fieldElement(root, field.path));
    if (region === null) continue;
    const [name] = field.path;
    const needed =
      field.path.length === 1 &&
      name !== undefined &&
      neededParts(found.contract, found.instance.variant).has(name);
    removals.push({
      key,
      rect: region,
      remove: needed
        ? null
        : { op: "setProp", target: field.target, block: field.block, path: field.path },
    });
  }

  // The name and length of the words being typed.
  if (selectedField !== null) {
    const found = placed(state, contracts, selectedField.target, selectedField.block);
    const definition =
      found === undefined ? undefined : fieldAt(found.contract.fields, selectedField.path);
    const root = blockElement(document, selectedField.block);
    const element = root === null ? undefined : fieldElement(root, selectedField.path);
    const region = rect(element);
    const value =
      found === undefined ? undefined : valueAt(found.instance.props, selectedField.path);
    const removable = removals.some(
      (removal) => removal.key === `${selectedField.block}:${selectedField.path.join(".")}`,
    );
    const beside = removable ? "start" : "end";
    if (region !== null && definition !== undefined && value !== undefined) {
      if (definition.kind === "text") {
        const text = Schema.decodeOption(definition.draft)(value);
        if (Option.isSome(text))
          status = {
            rect: region,
            label: definition.title,
            beside,
            ...lengthStatus(text.value, definition),
          };
      }
      if (definition.kind === "cta") {
        const label = Schema.decodeOption(definition.draft)(value);
        if (Option.isSome(label))
          status = {
            rect: region,
            label: definition.title,
            beside,
            ...lengthStatus(label.value.label, definition.parts.label),
          };
      }
      if (definition.kind === "richText")
        status = {
          rect: region,
          label: definition.title,
          beside,
          ...(Schema.is(definition.complete)(value)
            ? { status: null, tone: "plain" as const }
            : { status: "Can't be empty", tone: "short" as const }),
        };
    }
  }

  // Each link with no element of its own, on the part it belongs to.
  for (const root of Array.from(document.querySelectorAll("[data-pakshi-block]"))) {
    const block = Option.getOrUndefined(decodeBlockId(root.getAttribute("data-pakshi-block")));
    if (block === undefined) continue;
    const target = targetOf(state, block);
    const found = placed(state, contracts, target, block);
    if (found === undefined) continue;
    for (const [name, field] of Object.entries(found.contract.fields)) {
      if (field.kind !== "list") continue;
      for (const [part, itemField] of Object.entries(field.item)) {
        if (itemField.kind !== "link") continue;
        for (const id of listIds(found.instance.props, name)) {
          const path = [name, id, part];
          const set = valueAt(found.instance.props, path) !== undefined;
          const active = activeItems.some(
            (active) => active.block === block && sameKey(active.item, { list: name, id }),
          );
          if (!set && !active) continue;
          const owner = partsOf(root).find(
            (candidate) =>
              candidate.path[0] === name &&
              candidate.path[1] === id &&
              candidate.element.hasAttribute("data-pakshi-field"),
          );
          const region = rect(owner?.element);
          if (region !== null)
            links.push({
              key: path.join("."),
              rect: region,
              field: { target, block, path },
              set,
              label: itemField.title,
            });
        }
      }
    }
  }

  // Which shared form a form shows.
  for (const field of [pointedField, selectedField]) {
    if (field === null) continue;
    const found = placed(state, contracts, field.target, field.block);
    const definition = found === undefined ? undefined : fieldAt(found.contract.fields, field.path);
    const root = blockElement(document, field.block);
    if (definition?.kind !== "form" || found === undefined || root === null) continue;
    const id = Schema.decodeOption(definition.draft)(valueAt(found.instance.props, field.path));
    const form = Option.isSome(id) ? forms[id.value.id] : undefined;
    const region = rect(fieldElement(root, field.path));
    if (region === null || form === undefined || notes.some((note) => note.icon === "form"))
      continue;
    notes.push({
      key: "form",
      rect: { ...region, top: region.top - 8, height: 0 },
      text: `Shared form: ${form.name}`,
      icon: "form",
    });
  }

  // Words typed in an item say how they stand on the item's toolbar, which already names them.
  const typedIn =
    selectedField === null
      ? undefined
      : items.findIndex(
          (item) =>
            item.key === selectedField.block ||
            item.key === `${selectedField.block}:${selectedField.path.slice(0, 2).join(":")}`,
        );
  if (status !== null && typedIn !== undefined && typedIn !== -1) {
    const item = items[typedIn];
    if (item !== undefined) items[typedIn] = { ...item, typing: status };
    status = null;
  }

  return { items, removals, status, links, notes };
};

/** One of the toolbar's buttons. */
function ToolbarButton(props: {
  readonly label: string;
  readonly disabled: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      className="text-background hover:bg-background/15 hover:text-background disabled:opacity-40"
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

/**
 * The editor's marks over the canvas, for what's under the pointer and
 * what's selected. They follow the page as it scrolls, resizes or changes.
 */
export function CanvasMarks(props: {
  readonly document: Document;
  readonly container: HTMLElement;
  readonly clip: boolean;
}) {
  const store = useStore();
  const ui = useEditorUi();
  const { definitions } = useServices();
  const hold = usePointer(props.document);
  const state = useEditorState((current) => current);
  const [marks, setMarks] = useState<Marks>(noMarks);
  const [moved, setMoved] = useState(0);

  // Anything that moves the page's parts, such as fonts loading or scrolling, remeasures.
  useEffect(() => {
    const view = props.document.defaultView;
    const Observer = view?.ResizeObserver;
    if (view === null || Observer === undefined) return;
    const remeasure = () => setMoved((count) => count + 1);
    const observer = new Observer(remeasure);
    observer.observe(props.document.body);
    view.addEventListener("scroll", remeasure, { passive: true });
    const outer = new ResizeObserver(remeasure);
    outer.observe(props.container);
    return () => {
      observer.disconnect();
      outer.disconnect();
      view.removeEventListener("scroll", remeasure);
    };
  }, [props.document, props.container]);

  // Measured once the page has rendered, so the marks sit on the parts as they are now.
  useLayoutEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- measuring layout before the browser paints, then drawing from it, is what layout effects are for
    setMarks(measureMarks(props.document, props.container, state, definitions, state.view.forms));
  }, [props.document, props.container, state, definitions, moved]);

  const run = (op: Op | undefined, message: string) => {
    if (op === undefined || store.run([op]).length > 0) return;
    ui.announce(message);
  };

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-30", props.clip && "overflow-clip")}>
      {marks.items.map((item) => (
        <div key={item.key}>
          <div
            className="absolute rounded-sm outline-2 outline-offset-2 outline-ring/60 outline-dashed"
            style={{
              top: item.rect.top,
              left: item.rect.left,
              width: item.rect.width,
              height: item.rect.height,
            }}
          />
          <div
            role="toolbar"
            aria-label={item.label}
            className="pointer-events-auto absolute flex -translate-x-full -translate-y-full items-center gap-0.5 rounded-lg bg-foreground py-0.5 pr-0.5 pl-2.5 text-xs font-medium whitespace-nowrap text-background shadow-md"
            style={{ top: item.rect.top - 6, left: item.rect.left + item.rect.width }}
            {...hold}
          >
            <span className="pr-1.5 whitespace-nowrap">{item.label}</span>
            <ToolbarButton
              label="Move earlier"
              disabled={item.earlier === undefined}
              onClick={() => run(item.earlier, `Moved ${item.label} earlier.`)}
            >
              <ArrowUpIcon />
            </ToolbarButton>
            <ToolbarButton
              label="Move later"
              disabled={item.later === undefined}
              onClick={() => run(item.later, `Moved ${item.label} later.`)}
            >
              <ArrowDownIcon />
            </ToolbarButton>
            <ToolbarButton
              label={item.fewest === null ? "Remove" : `Remove: ${item.fewest.toLowerCase()}`}
              disabled={item.remove === undefined}
              onClick={() => {
                run(item.remove, `Removed ${item.label}.`);
                store.point(null);
              }}
            >
              <XIcon />
            </ToolbarButton>
            {item.fewest !== null && <span className="px-1.5 text-warning">{item.fewest}</span>}
            {item.typing?.status != null && (
              <span
                aria-live="polite"
                className={cn(
                  "ml-1 rounded-md px-2 py-1 font-normal",
                  item.typing.tone === "short"
                    ? "bg-warning-foreground text-warning"
                    : "bg-background/15",
                )}
              >
                {item.typing.status}
              </span>
            )}
          </div>
        </div>
      ))}
      {marks.removals.map((removal) =>
        removal.remove === null ? (
          <span
            key={removal.key}
            className="absolute -translate-x-full -translate-y-full rounded-full bg-foreground px-2.5 py-1 text-xs font-medium whitespace-nowrap text-background shadow-md"
            style={{ top: removal.rect.top - 6, left: removal.rect.left + removal.rect.width }}
          >
            This layout needs it
          </span>
        ) : (
          <Button
            key={removal.key}
            size="icon-xs"
            aria-label="Remove this part"
            title="Remove this part"
            className="pointer-events-auto absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground text-background shadow-md ring-2 ring-background hover:bg-foreground/85"
            style={{ top: removal.rect.top, left: removal.rect.left + removal.rect.width }}
            {...hold}
            onClick={() => {
              const remove = removal.remove;
              if (remove === null || store.run([remove]).length > 0) return;
              store.select(null);
              store.point(null);
              ui.announce("Removed it. Its button to add it back is where it was.");
            }}
          >
            <XIcon />
          </Button>
        ),
      )}
      {marks.status !== null && (
        <span
          className={cn(
            "absolute flex -translate-y-full items-center gap-2 rounded-t-md px-2 py-1 text-xs font-semibold whitespace-nowrap",
            marks.status.beside === "end" && "-translate-x-full",
            marks.status.tone === "plain" && "bg-ring text-background",
            marks.status.tone === "limit" && "bg-foreground text-background",
            marks.status.tone === "short" && "bg-warning-foreground text-warning",
          )}
          style={{
            top: marks.status.rect.top - 4,
            left:
              marks.status.beside === "end"
                ? marks.status.rect.left + marks.status.rect.width + 4
                : marks.status.rect.left - 4,
          }}
        >
          {marks.status.label}
          {marks.status.status !== null && (
            <span aria-live="polite" className="font-normal">
              {marks.status.status}
            </span>
          )}
        </span>
      )}
      {marks.links.map((link) => (
        <button
          key={link.key}
          type="button"
          aria-label={
            link.set ? `${link.label}: where it goes` : `Add a ${link.label.toLowerCase()}`
          }
          title={link.set ? "Where it goes" : `Add a ${link.label.toLowerCase()}`}
          className={cn(
            "pointer-events-auto absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border bg-card text-link shadow-sm hover:border-ring focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-3.5",
            link.set ? "border-border" : "border-dashed border-ring/60",
          )}
          style={{ top: link.rect.top + link.rect.height, left: link.rect.left + link.rect.width }}
          {...hold}
          onClick={(event) => ui.openLink(link.field, event.currentTarget)}
        >
          <LinkIcon />
        </button>
      ))}
      {marks.notes.map((note) => (
        <span
          key={note.key}
          className={cn(
            "absolute flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap",
            note.icon === "form"
              ? "-translate-y-full bg-foreground text-background shadow-md"
              : "rounded-md bg-muted text-muted-foreground ring-1 ring-border",
          )}
          style={{ top: note.rect.top, left: note.rect.left }}
        >
          {note.icon === "form" && <LayersIcon aria-hidden className="size-3.5" />}
          {note.text}
        </span>
      ))}
    </div>
  );
}
