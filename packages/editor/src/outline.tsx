import { placeholderPaths } from "@repo/blocks";
import type { BlockId, PageId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import { Button } from "@repo/ui/components/button";
import { cn } from "cn";
import {
  ChevronRightIcon,
  CircleAlertIcon,
  EllipsisIcon,
  PanelBottomIcon,
  PanelTopIcon,
  PlusIcon,
  RectangleHorizontalIcon,
  SquareIcon,
} from "lucide-react";
import { type KeyboardEvent, type ReactNode, useCallback, useState } from "react";

import { BlockMenu } from "./block-menu.tsx";
import { enterBlock, moveDown, moveUp } from "./commands.ts";
import { useEditorState, useEditorUi, useServices } from "./context.tsx";
import { useBlockDrag, useBlockDrop, useDropPlacement, useDropTarget } from "./dnd.tsx";
import { runCommand } from "./run-command.ts";
import { formatShortcut } from "./shortcuts.ts";
import { allowedTypes, blockLabel } from "./structure.ts";

/** A section's slots and the items in them: all the outline needs to lay out its rows. */
interface SectionSlots {
  readonly id: BlockId;
  readonly slots: ReadonlyArray<{ readonly slot: string; readonly items: ReadonlyArray<BlockId> }>;
}

const sameSections = (a: ReadonlyArray<SectionSlots>, b: ReadonlyArray<SectionSlots>) =>
  a.length === b.length &&
  a.every((section, index) => {
    const other = b[index];
    return (
      other !== undefined &&
      section.id === other.id &&
      section.slots.length === other.slots.length &&
      section.slots.every(
        (slot, slotIndex) =>
          slot.slot === other.slots[slotIndex]?.slot &&
          slot.items.length === other.slots[slotIndex]?.items.length &&
          slot.items.every((item, itemIndex) => item === other.slots[slotIndex]?.items[itemIndex]),
      )
    );
  });

/** A row the keyboard can reach: shown, so not inside a collapsed section. */
interface VisibleRow {
  readonly target: Target;
  readonly block: BlockId;
  readonly parent: BlockId | undefined;
}

function Row(props: {
  readonly target: Target;
  readonly block: BlockId;
  readonly level: 1 | 2;
  readonly position: readonly [number, number];
  readonly focusable: boolean;
  readonly expanded?: boolean | undefined;
  readonly onToggle?: (() => void) | undefined;
  readonly children?: ReactNode;
}) {
  const { store, definitions } = useServices();
  const ui = useEditorUi();
  const instance = useEditorState(
    (state) =>
      (props.target === "site" ? state.view.parts : state.view.pages[props.target])?.blocks[
        props.block
      ],
  );
  const selected = useEditorState(
    (state) => state.selection?.kind === "block" && state.selection.block === props.block,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const { list, accepts } = useDropPlacement(props.target, props.block);
  const drag = useBlockDrag({
    surface: "outline",
    block: props.block,
    type: instance?.type ?? "",
    label: instance === undefined ? "" : blockLabel(definitions, instance),
    disabled: props.target === "site",
  });
  const drop = useBlockDrop({
    surface: "outline",
    list: list ?? "root",
    block: props.block,
    accepts,
  });
  const { ref: dragRef } = drag;
  const { ref: dropRef } = drop;
  const rowRef = useCallback(
    (element: HTMLDivElement | null) => {
      dragRef(element);
      dropRef(element);
    },
    [dragRef, dropRef],
  );
  const dropTarget = useDropTarget();
  const line =
    dropTarget?.surface === "outline" && dropTarget.block === props.block
      ? dropTarget.edge
      : undefined;
  if (instance === undefined) return null;
  const contract = definitions.get(instance.type);
  const placement = contract?.placement;
  const shared = placement === "header" || placement === "footer";
  // The header and footer are one of a kind, so their type names them.
  const label = shared ? (contract?.title ?? instance.type) : blockLabel(definitions, instance);
  const secondary = shared ? "On every page" : (contract?.title ?? instance.type);
  const needsContent = placeholderPaths(definitions, instance).length > 0;
  const Icon =
    placement === "header"
      ? PanelTopIcon
      : placement === "footer"
        ? PanelBottomIcon
        : placement === "item"
          ? SquareIcon
          : RectangleHorizontalIcon;

  return (
    <li
      role="treeitem"
      aria-level={props.level}
      aria-posinset={props.position[0]}
      aria-setsize={props.position[1]}
      aria-selected={selected}
      aria-expanded={props.expanded}
      aria-label={`${label}, ${secondary}${needsContent ? ", needs content" : ""}`}
      tabIndex={props.focusable ? 0 : -1}
      data-pakshi-outline-block={props.block}
      data-target={props.target}
      className="group/row outline-none"
      onFocus={(event) => {
        // Selection follows focus, as in any tree. A click focuses the row it lands in.
        if (event.target !== event.currentTarget) return;
        store.select({ kind: "block", target: props.target, block: props.block });
        ui.focusSelection("outline");
      }}
      onKeyDown={(event) => {
        if (
          props.target !== "site" &&
          event.target === event.currentTarget &&
          (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
        ) {
          event.preventDefault();
          setMenuOpen(true);
        }
      }}
    >
      <div
        ref={rowRef}
        className={cn(
          "relative flex h-9 items-center gap-2 rounded-md pr-1 text-sm",
          props.level === 1 ? "pl-1" : "pl-7",
          selected ? "bg-accent text-accent-foreground" : "hover:bg-muted",
          "group-focus-visible/row:ring-2 group-focus-visible/row:ring-ring",
        )}
      >
        {props.onToggle === undefined ? (
          <span className="size-5 shrink-0" />
        ) : (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            onClick={(event) => {
              event.stopPropagation();
              props.onToggle?.();
            }}
          >
            <ChevronRightIcon
              className={cn("size-4 transition-transform", props.expanded === true && "rotate-90")}
            />
          </button>
        )}
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {needsContent && (
          <CircleAlertIcon
            className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden
          />
        )}
        <span className="shrink-0 text-xs text-muted-foreground">{secondary}</span>
        {line !== undefined && <DropLine edge={line} />}
        {props.target === "site" ? (
          <span className="size-7 shrink-0" />
        ) : (
          <BlockMenu
            page={props.target}
            block={props.block}
            origin="outline"
            open={menuOpen}
            onOpenChange={setMenuOpen}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                tabIndex={-1}
                aria-label={`Actions for ${label}`}
                className={cn(
                  "shrink-0",
                  !selected && !menuOpen && "opacity-0 group-hover/row:opacity-100",
                )}
                onClick={(event) => event.stopPropagation()}
              >
                <EllipsisIcon />
              </Button>
            }
          />
        )}
      </div>
      {props.children}
    </li>
  );
}

/** Where a dragged block would land, at the top or bottom of a row. */
function DropLine(props: { readonly edge: "before" | "after" }) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-1 h-0.5 rounded-full bg-ring",
        props.edge === "before" ? "-top-px" : "-bottom-px",
      )}
    />
  );
}

/** A button that opens the block picker at the end of a list. */
function AddButton(props: {
  readonly label: string;
  readonly inset: boolean;
  readonly onClick: (anchor: HTMLElement) => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      // Inside the tree, a section's menu adds items; the button after it is the way to add a section.
      tabIndex={props.inset ? -1 : undefined}
      className={cn("justify-start text-muted-foreground", props.inset ? "ml-7" : "ml-1")}
      onClick={(event) => props.onClick(event.currentTarget)}
    >
      <PlusIcon />
      {props.label}
    </Button>
  );
}

/**
 * The page's structure as a tree: the header, each section and its items,
 * and the footer. It follows the ARIA tree pattern: arrow keys move between
 * rows and open and close sections, and selection follows focus.
 */
export function Outline() {
  const { store, definitions } = useServices();
  const ui = useEditorUi();
  const page = useEditorState((state): PageId => state.page);
  const title = useEditorState((state) => state.view.pages[state.page]?.meta.title ?? "");
  const header = useEditorState((state) => state.view.parts.header);
  const footer = useEditorState((state) => state.view.parts.footer);
  const sections = useEditorState((state): ReadonlyArray<SectionSlots> => {
    const document = state.view.pages[state.page];
    return (document?.root ?? []).map((id) => {
      const section = document?.blocks[id];
      const contract = section === undefined ? undefined : definitions.get(section.type);
      return {
        id,
        slots:
          contract?.placement === "section"
            ? Object.keys(contract.slots).map((slot) => ({
                slot,
                items: section?.slots?.[slot] ?? [],
              }))
            : [],
      };
    });
  }, sameSections);
  const selected = useEditorState((state) => state.selection?.block);
  const [closed, setClosed] = useState<ReadonlySet<BlockId>>(new Set());
  // A section holding the selected item stays open, so the selection always has a row.
  const holdingSelection = sections.find((section) =>
    section.slots.some(({ items }) => items.some((item) => item === selected)),
  )?.id;
  const collapsed: ReadonlySet<BlockId> = new Set(
    Array.from(closed).filter((id) => id !== holdingSelection),
  );

  const toggle = (id: BlockId, open = collapsed.has(id)) =>
    setClosed((current) => {
      const next = new Set(current);
      if (open) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: ReadonlyArray<VisibleRow> = [
    { target: "site", block: header, parent: undefined },
    ...sections.flatMap((section): ReadonlyArray<VisibleRow> => [
      { target: page, block: section.id, parent: undefined },
      ...(collapsed.has(section.id)
        ? []
        : section.slots.flatMap(({ items }) =>
            items.map((item) => ({ target: page, block: item, parent: section.id })),
          )),
    ]),
    { target: "site", block: footer, parent: undefined },
  ];
  const focusable =
    rows.find((row) => row.block === selected)?.block ?? rows[0]?.block ?? undefined;

  const focusRow = (row: VisibleRow | undefined) => {
    if (row === undefined) return;
    store.select({ kind: "block", target: row.target, block: row.block });
    ui.focusSelection("outline");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.altKey || event.metaKey || event.ctrlKey || event.shiftKey) return;
    const element =
      event.target instanceof Element ? event.target.closest("[data-pakshi-outline-block]") : null;
    const index = rows.findIndex(
      (row) => row.block === element?.getAttribute("data-pakshi-outline-block"),
    );
    const row = rows[index];
    if (row === undefined) return;
    const section = sections.find((candidate) => candidate.id === row.block);
    const expandable = section !== undefined && section.slots.length > 0;
    const handled = () => event.preventDefault();
    switch (event.key) {
      case "ArrowDown":
        handled();
        return focusRow(rows[index + 1]);
      case "ArrowUp":
        handled();
        return focusRow(rows[index - 1]);
      case "Home":
        handled();
        return focusRow(rows[0]);
      case "End":
        handled();
        return focusRow(rows.at(-1));
      case "ArrowRight":
        handled();
        if (!expandable) return;
        if (collapsed.has(row.block)) return toggle(row.block, true);
        // An open section with no items keeps focus, rather than skipping to the next section.
        return rows[index + 1]?.parent === row.block ? focusRow(rows[index + 1]) : undefined;
      case "ArrowLeft":
        handled();
        if (expandable && !collapsed.has(row.block)) return toggle(row.block, false);
        return focusRow(rows.find((candidate) => candidate.block === row.parent));
      case "Enter": {
        handled();
        store.select({ kind: "block", target: row.target, block: row.block });
        if (!runCommand({ store, ui }, enterBlock, undefined, "canvas"))
          ui.focusSelection("canvas");
        return;
      }
    }
  };

  const openPicker = (anchor: HTMLElement, list: "root" | { block: BlockId; slot: string }) => {
    const ids =
      list === "root"
        ? sections.map((section) => section.id)
        : (sections
            .find((section) => section.id === list.block)
            ?.slots.find((slot) => slot.slot === list.slot)?.items ?? []);
    ui.openPicker({ list, after: ids.at(-1) ?? null }, anchor);
  };

  return (
    <nav aria-label="Outline" data-pakshi-outline className="flex min-h-0 flex-col gap-3 p-3">
      <div className="flex flex-col gap-1 px-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate font-semibold">{title || "Untitled page"}</h2>
          <span className="shrink-0 text-xs text-muted-foreground">
            {sections.length === 1 ? "1 section" : `${sections.length} sections`}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Drag a row to move it, or use its menu. A line shows where it will land.
        </p>
      </div>
      <ul
        role="tree"
        aria-label="Page outline"
        className="flex flex-col gap-0.5"
        onKeyDown={onKeyDown}
      >
        <Row
          target="site"
          block={header}
          level={1}
          position={[1, sections.length + 2]}
          focusable={focusable === header}
        />
        {sections.map((section, index) => {
          const expanded = section.slots.length > 0 ? !collapsed.has(section.id) : undefined;
          return (
            <Row
              key={section.id}
              target={page}
              block={section.id}
              level={1}
              position={[index + 2, sections.length + 2]}
              focusable={focusable === section.id}
              expanded={expanded}
              onToggle={section.slots.length > 0 ? () => toggle(section.id) : undefined}
            >
              {expanded === true && (
                // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the ARIA tree pattern nests a section's items in a list with the group role
                <ul role="group" className="mt-0.5 flex flex-col gap-0.5">
                  {section.slots.map(({ slot, items }) => (
                    <SlotRows
                      key={slot}
                      page={page}
                      section={section.id}
                      slot={slot}
                      items={items}
                      focusable={focusable}
                      onAdd={(anchor) => openPicker(anchor, { block: section.id, slot })}
                    />
                  ))}
                </ul>
              )}
            </Row>
          );
        })}
        <Row
          target="site"
          block={footer}
          level={1}
          position={[sections.length + 2, sections.length + 2]}
          focusable={focusable === footer}
        />
      </ul>
      <AddButton
        label="Add a section"
        inset={false}
        onClick={(anchor) => openPicker(anchor, "root")}
      />
      <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md bg-muted p-3 text-xs">
        <dt className="font-medium">↑ ↓</dt>
        <dd className="text-muted-foreground">Go to the previous or next block</dd>
        <dt className="font-medium">→ ←</dt>
        <dd className="text-muted-foreground">Open or close a section</dd>
        <dt className="font-medium">{formatShortcut({ key: "Enter" })}</dt>
        <dd className="text-muted-foreground">Edit it on the page</dd>
        <dt className="font-medium">
          {moveUp.keys !== undefined && formatShortcut(moveUp.keys.shortcuts[0])}{" "}
          {moveDown.keys !== undefined && formatShortcut(moveDown.keys.shortcuts[0])}
        </dt>
        <dd className="text-muted-foreground">Move the selected block</dd>
      </dl>
    </nav>
  );
}

/** One slot's items, and the button that adds to it. */
function SlotRows(props: {
  readonly page: PageId;
  readonly section: BlockId;
  readonly slot: string;
  readonly items: ReadonlyArray<BlockId>;
  readonly focusable: BlockId | undefined;
  readonly onAdd: (anchor: HTMLElement) => void;
}) {
  const { definitions } = useServices();
  const spec = useEditorState((state) => {
    const section = state.view.pages[props.page]?.blocks[props.section];
    const contract = section === undefined ? undefined : definitions.get(section.type);
    return contract?.placement === "section" ? contract.slots[props.slot] : undefined;
  });
  return (
    <>
      {props.items.map((item, index) => (
        <Row
          key={item}
          target={props.page}
          block={item}
          level={2}
          position={[index + 1, props.items.length]}
          focusable={props.focusable === item}
        />
      ))}
      <SlotEnd
        page={props.page}
        section={props.section}
        slot={props.slot}
        label={`Add to ${spec?.title ?? props.slot}`}
        onAdd={props.onAdd}
      />
    </>
  );
}

/** The end of a slot: it adds a block there, and takes a dropped one. */
function SlotEnd(props: {
  readonly page: PageId;
  readonly section: BlockId;
  readonly slot: string;
  readonly label: string;
  readonly onAdd: (anchor: HTMLElement) => void;
}) {
  const { definitions } = useServices();
  const list = { block: props.section, slot: props.slot };
  const accepts = useEditorState(
    (state) => {
      const document = state.view.pages[props.page];
      return document === undefined ? [] : allowedTypes(document, definitions, list);
    },
    (a, b) => a.join() === b.join(),
  );
  const { ref: attach } = useBlockDrop({ surface: "outline", list, block: null, accepts });
  const dropTarget = useDropTarget();
  const targeted =
    dropTarget?.surface === "outline" &&
    dropTarget.block === null &&
    dropTarget.list !== "root" &&
    dropTarget.list.block === props.section &&
    dropTarget.list.slot === props.slot;
  return (
    <li role="none" ref={attach} className="relative">
      <AddButton label={props.label} inset onClick={props.onAdd} />
      {targeted && <DropLine edge="before" />}
    </li>
  );
}
