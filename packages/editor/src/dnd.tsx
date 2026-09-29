import { type CollisionDetector, CollisionPriority, CollisionType } from "@dnd-kit/abstract";
import {
  AutoScroller,
  Cursor,
  type Draggable,
  Droppable,
  Feedback,
  PointerActivationConstraints,
  PointerSensor,
  PreventSelection,
} from "@dnd-kit/dom";
import { DragDropProvider, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/react";
import { BlockId, type BlockType } from "@repo/contracts/ids";
import { BlockList, type Target } from "@repo/contracts/ops";
import { Schema } from "effect";
import { GripVerticalIcon } from "lucide-react";
import { createContext, type ReactNode, useContext, useRef, useState } from "react";

import { place } from "./commands.ts";
import { useEditorState, useEditorUi, useServices } from "./context.tsx";
import { runCommand } from "./run-command.ts";
import { allowedTypes, listOf, sameList } from "./structure.ts";

/*
 * Dragging blocks in the canvas and the outline. A drag never changes the
 * document or the page's DOM: dnd-kit only reports where the pointer is, the
 * canvas and the outline draw a line where the block would land, and the
 * drop runs the same `place` command a menu or shortcut would, as one
 * moveBlock.
 */

/** Where a drag started or would land: the page in the canvas, or the outline. */
export type Surface = "canvas" | "outline";

const SurfaceSchema = Schema.Literals(["canvas", "outline"]);

/** What a draggable carries: the block it moves. */
const Moving = Schema.Struct({
  kind: Schema.Literal("block"),
  surface: SurfaceSchema,
  block: BlockId,
  label: Schema.String,
});

/** What a droppable carries: the spot in a list beside a block, or an empty slot when `block` is null. */
const Spot = Schema.Struct({
  kind: Schema.Literal("spot"),
  surface: SurfaceSchema,
  list: BlockList,
  block: Schema.NullOr(BlockId),
});

type EditorData = typeof Moving.Type | typeof Spot.Type;

const isMoving = Schema.is(Moving);
const isSpot = Schema.is(Spot);

/** Where a dragged block would land, which the canvas and the outline draw a line at. */
export interface DropTarget {
  readonly surface: Surface;
  readonly list: BlockList;
  readonly block: BlockId | null;
  readonly edge: "before" | "after";
}

const DropTargetContext = createContext<DropTarget | null>(null);

export const useDropTarget = () => useContext(DropTargetContext);

/** Whether an element's list lays its blocks out side by side, like a grid's items. */
export const flowsInRow = (element: Element) => {
  const rect = element.getBoundingClientRect();
  return [element.previousElementSibling, element.nextElementSibling].some(
    (sibling) => sibling !== null && Math.abs(sibling.getBoundingClientRect().top - rect.top) < 1,
  );
};

/**
 * Which edge of a block the pointer is nearer, along the way its list flows.
 * A block is never a target for itself, and an empty slot only for its inside.
 */
const edgeDetector: CollisionDetector = ({ droppable, dragOperation }) => {
  const bounds = droppable.shape;
  const point = dragOperation.position.current;
  const spot = droppable.data;
  const source = dragOperation.source?.data;
  if (bounds === undefined || !bounds.containsPoint(point) || !isSpot(spot)) return null;
  if (isMoving(source) && spot.block === source.block) return null;
  const box = bounds.boundingRectangle;
  const element = droppable instanceof Droppable ? droppable.element : undefined;
  const edge =
    element !== undefined && flowsInRow(element)
      ? point.x < box.left + box.width / 2
        ? "before"
        : "after"
      : point.y < box.top + box.height / 2
        ? "before"
        : "after";
  return {
    id: droppable.id,
    type: CollisionType.PointerIntersection,
    // A block beats the slot it sits in, so an empty slot only wins where there's no block.
    priority: spot.block === null ? CollisionPriority.Low : CollisionPriority.High,
    value: 1,
    data: { edge },
  };
};

/** The list a page block sits in and the block types that list accepts, for dropping beside it. */
export const useDropPlacement = (target: Target, block: BlockId) => {
  const { definitions } = useServices();
  return useEditorState(
    (state) => {
      const document = target === "site" ? undefined : state.view.pages[target];
      const list = document === undefined ? undefined : listOf(document, block)?.list;
      return {
        list,
        accepts:
          document === undefined || list === undefined
            ? []
            : allowedTypes(document, definitions, list),
      };
    },
    (a, b) =>
      (a.list === undefined || b.list === undefined
        ? a.list === b.list
        : sameList(a.list, b.list)) && a.accepts.join() === b.accepts.join(),
  );
};

/** Makes an element drag a block. The element is the drag handle. */
export const useBlockDrag = (options: {
  readonly surface: Surface;
  readonly block: BlockId;
  readonly type: BlockType;
  readonly label: string;
  readonly disabled?: boolean;
}) =>
  useDraggable<EditorData>({
    id: `${options.surface}:drag:${options.block}`,
    type: options.type,
    disabled: options.disabled === true,
    data: { kind: "block", surface: options.surface, block: options.block, label: options.label },
  });

/**
 * Makes an element a place to drop blocks the list accepts: beside a block,
 * or inside an empty slot when `block` is null.
 */
export const useBlockDrop = (options: {
  readonly surface: Surface;
  readonly list: BlockList;
  readonly block: BlockId | null;
  readonly accepts: ReadonlyArray<BlockType>;
}) => {
  const listKey = options.list === "root" ? "root" : `${options.list.block}.${options.list.slot}`;
  return useDroppable<EditorData>({
    id: `${options.surface}:drop:${listKey}:${options.block ?? "end"}`,
    accept: [...options.accepts],
    collisionDetector: edgeDetector,
    data: { kind: "spot", surface: options.surface, list: options.list, block: options.block },
  });
};

const sensors = [
  PointerSensor.configure({
    // A click on a handle stays a click, and a touch waits a moment so the page can scroll.
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 4 })],
  }),
];

// Moving a block by keyboard is the move commands' job, which say where it landed.
const plugins = [AutoScroller, Cursor, Feedback, PreventSelection];

/** Lets blocks be dragged in the canvas and the outline, and drops them with the `place` command. */
export function BlockDragDrop(props: { readonly children: ReactNode }) {
  const { store } = useServices();
  const ui = useEditorUi();
  const [target, setTarget] = useState<DropTarget | null>(null);
  const latest = useRef<DropTarget | null>(null);
  const show = (next: DropTarget | null) => {
    const current = latest.current;
    // Collisions are recomputed whenever a droppable moves, often to the same spot.
    if (
      next === current ||
      (next !== null &&
        current !== null &&
        next.surface === current.surface &&
        next.block === current.block &&
        next.edge === current.edge &&
        sameList(next.list, current.list))
    )
      return;
    latest.current = next;
    setTarget(next);
  };

  return (
    <DragDropProvider<EditorData>
      sensors={sensors}
      plugins={plugins}
      onDragStart={(event) => {
        const source = event.operation.source?.data;
        if (source?.kind === "block")
          store.select({ kind: "block", target: store.getState().page, block: source.block });
      }}
      onDragMove={(event, manager) => {
        // Released over neither the canvas nor the outline, a drag moves nothing.
        const { x, y } = event.to ?? manager.dragOperation.position.current;
        const over = document
          .elementsFromPoint(x, y)
          .some((element) => element.closest("[data-pakshi-outline], [data-pakshi-canvas-area]"));
        if (!over) show(null);
      }}
      onCollision={(event, manager) => {
        const [collision] = event.collisions;
        // Between blocks nothing collides, so the line stays where it was.
        if (collision === undefined) return;
        const spot = manager.registry.droppables.get(collision.id)?.data;
        const edge = collision.data?.["edge"];
        if (isSpot(spot) && (edge === "before" || edge === "after"))
          show({ surface: spot.surface, list: spot.list, block: spot.block, edge });
      }}
      onDragEnd={(event) => {
        const source = event.operation.source?.data;
        const drop = latest.current;
        show(null);
        if (event.canceled || drop === null || source?.kind !== "block") return;
        const { view, page } = store.getState();
        const document = view.pages[page];
        const ids =
          document === undefined
            ? []
            : drop.list === "root"
              ? document.root
              : (document.blocks[drop.list.block]?.slots?.[drop.list.slot] ?? []);
        const others = ids.filter((id) => id !== source.block);
        const after =
          drop.block === null
            ? (others.at(-1) ?? null)
            : drop.edge === "after"
              ? drop.block
              : (others[others.indexOf(drop.block) - 1] ?? null);
        runCommand(
          { store, ui },
          place,
          { block: source.block, list: drop.list, after },
          source.surface,
        );
      }}
    >
      <DropTargetContext.Provider value={target}>{props.children}</DropTargetContext.Provider>
      <DragOverlay dropAnimation={null}>
        {(source: Draggable<EditorData>) =>
          source.data.kind === "block" ? (
            <div className="pointer-events-none flex w-max items-center gap-1.5 rounded-md border bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md">
              <GripVerticalIcon className="size-4 text-muted-foreground" />
              {source.data.label}
            </div>
          ) : null
        }
      </DragOverlay>
    </DragDropProvider>
  );
}
