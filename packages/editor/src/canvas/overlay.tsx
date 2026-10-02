import { placeholderPaths } from "@repo/blocks";
import { BlockId, type PageId } from "@repo/contracts/ids";
import type { Focus, Peer } from "@repo/contracts/live";
import type { BlockInstance, PageDocument } from "@repo/contracts/page";
import type { BlockContracts } from "@repo/domain/document";
import { Option, Predicate, Schema } from "effect";
import { GripVerticalIcon, PlusIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  type InsertSpot,
  useEditorState,
  useEditorUi,
  useServices,
  useStore,
} from "../context.tsx";
import { type DropTarget, flowsInRow, useBlockDrag, useDropTarget } from "../dnd.tsx";
import { peerColor, peerName } from "../presence.ts";
import { blockLabel, listOf, slotOf } from "../structure.ts";

/*
 * The editor's controls on the page: a handle and insert points on the block
 * under the pointer and the chosen one, a badge on every block that still has
 * placeholder content, and the line where a dragged block would land. They're
 * drawn in one layer positioned in page coordinates, so they scroll with the
 * page and never change its layout.
 */

interface Box {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

const boxOf = (element: Element): Box => {
  const view = element.ownerDocument.defaultView;
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top + (view?.scrollY ?? 0),
    left: rect.left + (view?.scrollX ?? 0),
    width: rect.width,
    height: rect.height,
  };
};

const placeholders = new WeakMap<BlockInstance, boolean>();

/** Page blocks with placeholder content, by the IDs that stay the same while the instances change. */
const useBlocksNeedingContent = () => {
  const { definitions } = useServices();
  return useEditorState(
    (state) => {
      const page = state.view.pages[state.page];
      const placed = (page?.root ?? []).flatMap((id) => [
        id,
        ...Object.values(page?.blocks[id]?.slots ?? {}).flat(),
      ]);
      return placed.flatMap((id) => {
        const instance = page?.blocks[id];
        if (instance === undefined) return [];
        let needs = placeholders.get(instance);
        if (needs === undefined) {
          needs = placeholderPaths(definitions, instance).length > 0;
          placeholders.set(instance, needs);
        }
        return needs ? [id] : [];
      });
    },
    (a, b) => a.length === b.length && a.every((id, index) => id === b[index]),
  );
};

/** A block's handle: it names the block, chooses it when clicked and moves it when dragged. */
function Handle(props: {
  readonly page: PageId;
  readonly block: BlockId;
  readonly instance: BlockInstance;
  readonly box: Box;
}) {
  const store = useStore();
  const { definitions } = useServices();
  const title = definitions.get(props.instance.type)?.title ?? props.instance.type;
  const { ref: attach } = useBlockDrag({
    surface: "canvas",
    block: props.block,
    type: props.instance.type,
    label: blockLabel(definitions, props.instance),
  });
  return (
    <button
      ref={attach}
      type="button"
      // The block menu and move shortcuts do what dragging does, from the keyboard.
      tabIndex={-1}
      aria-hidden
      className="pakshi-handle"
      style={{ top: props.box.top + 8, left: props.box.left + 8 }}
      onClick={() => store.select({ kind: "block", target: props.page, block: props.block })}
    >
      <GripVerticalIcon width={14} height={14} />
      {title}
    </button>
  );
}

/** A "+" that opens the block picker for a spot, beside the block it's drawn on. */
function InsertPoint(props: {
  readonly spot: InsertSpot;
  readonly label?: string | undefined;
  readonly x: number;
  readonly y: number;
}) {
  const ui = useEditorUi();
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      className={props.label === undefined ? "pakshi-insert pakshi-insert-round" : "pakshi-insert"}
      style={{ top: props.y, left: props.x }}
      onClick={(event) => ui.openPicker(props.spot, "canvas", event.currentTarget)}
    >
      <PlusIcon width={14} height={14} />
      {props.label}
    </button>
  );
}

interface InsertPointAt {
  readonly spot: InsertSpot;
  readonly label?: string;
  readonly x: number;
  readonly y: number;
}

/** The controls drawn on one block: its handle and the insert points around it. */
interface Chrome {
  readonly block: BlockId;
  readonly instance: BlockInstance;
  readonly box: Box;
  readonly insertPoints: ReadonlyArray<InsertPointAt>;
}

const blockElement = (document: Document, block: BlockId) =>
  document.querySelector(`[data-pakshi-block="${block}"]`);

/**
 * Where new blocks can go around a block: before and after a section, and at
 * the end of each of its slots; after an item, along the way its slot flows.
 */
const insertPointsOf = (
  page: PageDocument,
  contracts: BlockContracts,
  block: BlockId,
  element: Element,
): ReadonlyArray<InsertPointAt> => {
  const position = listOf(page, block);
  if (position === undefined) return [];
  const box = boxOf(element);
  if (position.list !== "root") {
    const row = flowsInRow(element);
    return [
      {
        spot: { list: position.list, after: block },
        x: row ? box.left + box.width : box.left + box.width / 2,
        y: row ? box.top + box.height / 2 : box.top + box.height,
      },
    ];
  }
  const center = box.left + box.width / 2;
  const before = position.ids[position.ids.indexOf(block) - 1] ?? null;
  const slots = Array.from(element.querySelectorAll("[data-pakshi-slot]"))
    .filter((slotElement) => slotElement.closest("[data-pakshi-block]") === element)
    .map((slotElement): InsertPointAt => {
      const list = { block, slot: slotElement.getAttribute("data-pakshi-slot") ?? "" };
      const slotBox = boxOf(slotElement);
      return {
        spot: { list, after: page.blocks[block]?.slots?.[list.slot]?.at(-1) ?? null },
        label: `Add to ${slotOf(page, contracts, list)?.title ?? list.slot}`,
        x: slotBox.left + slotBox.width / 2,
        y: slotBox.top + slotBox.height + 16,
      };
    });
  return [
    { spot: { list: "root", after: before }, label: "Add a section", x: center, y: box.top },
    {
      spot: { list: "root", after: block },
      label: "Add a section",
      x: center,
      y: box.top + box.height,
    },
    ...slots,
  ];
};

/** The line where a dragged block would land: at an edge of a block, or across an empty slot. */
const dropLineOf = (document: Document, target: DropTarget): Box | null => {
  const element =
    target.block !== null
      ? blockElement(document, target.block)
      : target.list === "root"
        ? null
        : document.querySelector(
            `[data-pakshi-block="${target.list.block}"] [data-pakshi-slot="${target.list.slot}"]`,
          );
  if (element === null) return null;
  const box = boxOf(element);
  if (target.block === null) return { ...box, top: box.top + box.height / 2 - 2, height: 4 };
  if (flowsInRow(element))
    return {
      ...box,
      width: 4,
      left: target.edge === "before" ? box.left - 2 : box.left + box.width - 2,
    };
  return {
    ...box,
    height: 4,
    top: target.edge === "before" ? box.top - 2 : box.top + box.height - 2,
  };
};

/** Someone else's place on the page: the block or field they're on, outlined in their color. */
interface PresenceMark {
  readonly key: string;
  readonly box: Box;
  readonly color: number;
  readonly label: string;
}

const samePeers = (a: ReadonlyArray<Peer>, b: ReadonlyArray<Peer>) =>
  a.length === b.length && a.every((peer, index) => peer === b[index]);

/** The element a person's focus is on: a field in a block, or the block itself. */
const focusElement = (document: Document, focus: Focus) => {
  const block = blockElement(document, focus.block);
  if (block === null || focus.path === undefined) return block;
  const path = focus.path.join(".");
  // A field of this block, not of an item inside it.
  return (
    Array.from(block.querySelectorAll(`[data-pakshi-field="${CSS.escape(path)}"]`)).find(
      (field) => field.closest("[data-pakshi-block]") === block,
    ) ?? block
  );
};

const presenceMarksOf = (document: Document, peers: ReadonlyArray<Peer>, page: PageId) =>
  peers.flatMap((peer): ReadonlyArray<PresenceMark> => {
    const presence = peer.presence;
    if (presence === null || presence.page !== page || presence.focus === null) return [];
    const element = focusElement(document, presence.focus);
    if (element === null) return [];
    const firstName = peer.person.name.split(/\s+/)[0] ?? peer.person.name;
    return [
      {
        key: peer.connection,
        box: boxOf(element),
        color: peerColor(peer),
        label: presence.typing ? `${firstName} is typing` : peerName(peer),
      },
    ];
  });

/** The editor's layer of controls on the page, drawn in the canvas frame's own document. */
export function CanvasOverlay(props: { readonly document: Document }) {
  const { definitions } = useServices();
  const page = useEditorState((state) => state.page);
  const document = useEditorState((state) => state.view.pages[state.page]);
  const headerBlock = useEditorState((state) => state.view.parts.header);
  const selected = useEditorState((state) =>
    state.selection?.kind === "block" ? state.selection.block : undefined,
  );
  const needingContent = useBlocksNeedingContent();
  const peers = useEditorState((state) => state.peers, samePeers);
  const highlights = useEditorState((state) => state.highlights);
  const dropTarget = useDropTarget();
  const [hovered, setHovered] = useState<BlockId | undefined>(undefined);
  const [resized, setResized] = useState(0);
  const [layout, setLayout] = useState<{
    readonly chrome: ReadonlyArray<Chrome>;
    readonly badges: ReadonlyArray<{ readonly block: BlockId; readonly box: Box }>;
    readonly line: Box | null;
    readonly start: InsertPointAt | null;
    readonly presence: ReadonlyArray<PresenceMark>;
    readonly highlights: ReadonlyArray<{ readonly block: BlockId; readonly box: Box }>;
  }>({ chrome: [], badges: [], line: null, start: null, presence: [], highlights: [] });

  // The block under the pointer. Moving onto its controls keeps it.
  useEffect(() => {
    const frame = props.document.defaultView;
    const onMove = (event: PointerEvent) => {
      const element = frame !== null && event.target instanceof frame.Element ? event.target : null;
      if (element?.closest(".pakshi-overlay") != null) return;
      const id = element?.closest("[data-pakshi-block]")?.getAttribute("data-pakshi-block");
      setHovered(Option.getOrUndefined(Schema.decodeOption(BlockId)(id ?? "")));
    };
    const onLeave = () => setHovered(undefined);
    props.document.addEventListener("pointermove", onMove);
    props.document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      props.document.removeEventListener("pointermove", onMove);
      props.document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [props.document]);

  // Anything that moves the page's blocks, such as fonts loading or a narrower frame, remeasures.
  useEffect(() => {
    const Observer = props.document.defaultView?.ResizeObserver;
    if (Observer === undefined) return;
    const observer = new Observer(() => setResized((count) => count + 1));
    observer.observe(props.document.body);
    return () => observer.disconnect();
  }, [props.document]);

  // Measured once the page has rendered, so the controls sit on the blocks as they are now.
  useLayoutEffect(() => {
    const chrome = [...new Set([hovered, selected])]
      .filter(Predicate.isNotUndefined)
      .flatMap((block): ReadonlyArray<Chrome> => {
        const instance = document?.blocks[block];
        const element = blockElement(props.document, block);
        if (document === undefined || instance === undefined || element === null) return [];
        return [
          {
            block,
            instance,
            box: boxOf(element),
            insertPoints: insertPointsOf(document, definitions, block, element),
          },
        ];
      });
    const badges = needingContent.flatMap((block) => {
      const element = blockElement(props.document, block);
      return element === null ? [] : [{ block, box: boxOf(element) }];
    });
    const line = dropTarget?.surface === "canvas" ? dropLineOf(props.document, dropTarget) : null;
    // An empty page has no block to add beside, so its first section goes under the header.
    const header = blockElement(props.document, headerBlock);
    const headerBox = header === null ? null : boxOf(header);
    const start =
      document?.root.length === 0 && headerBox !== null
        ? {
            spot: { list: "root" as const, after: null },
            label: "Add a section",
            x: headerBox.left + headerBox.width / 2,
            y: headerBox.top + headerBox.height + 48,
          }
        : null;
    // Measuring layout before the browser paints, then drawing from it, is what layout effects are for.
    // oxlint-disable-next-line react/set-state-in-effect
    setLayout({
      chrome,
      badges,
      line,
      start,
      presence: presenceMarksOf(props.document, peers, page),
      highlights: highlights.flatMap(({ target, block }) => {
        const element =
          target === page || target === "site" ? blockElement(props.document, block) : null;
        return element === null ? [] : [{ block, box: boxOf(element) }];
      }),
    });
  }, [
    document,
    page,
    peers,
    highlights,
    headerBlock,
    hovered,
    selected,
    needingContent,
    dropTarget,
    resized,
    definitions,
    props.document,
  ]);

  return createPortal(
    <div className="pakshi-overlay">
      {layout.highlights.map(({ block, box }) => (
        <div
          key={block}
          className="pakshi-highlight"
          style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
        />
      ))}
      {layout.presence.map((mark) => (
        <div
          key={mark.key}
          className="pakshi-presence"
          style={{
            top: mark.box.top - 3,
            left: mark.box.left - 3,
            width: mark.box.width + 6,
            height: mark.box.height + 6,
          }}
          data-color={mark.color}
        >
          <span className="pakshi-presence-label">{mark.label}</span>
        </div>
      ))}
      {layout.badges.map(({ block, box }) => (
        <span
          key={block}
          className="pakshi-badge"
          style={{ top: box.top + 8, left: box.left + box.width - 8 }}
        >
          Needs content
        </span>
      ))}
      {layout.chrome.map((chrome) => (
        <div key={chrome.block}>
          <Handle page={page} block={chrome.block} instance={chrome.instance} box={chrome.box} />
          {chrome.insertPoints.map((point) => (
            <InsertPoint
              key={`${point.x}:${point.y}`}
              spot={point.spot}
              label={point.label}
              x={point.x}
              y={point.y}
            />
          ))}
        </div>
      ))}
      {layout.start !== null && (
        <InsertPoint
          spot={layout.start.spot}
          label={layout.start.label}
          x={layout.start.x}
          y={layout.start.y}
        />
      )}
      {layout.line !== null && (
        <span
          className="pakshi-drop-line"
          style={{
            top: layout.line.top,
            left: layout.line.left,
            width: layout.line.width,
            height: layout.line.height,
          }}
        />
      )}
    </div>,
    props.document.body,
  );
}
