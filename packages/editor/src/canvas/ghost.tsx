import type { BlockId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import { cn } from "cn";
import { createContext, type ReactNode, useContext } from "react";

import { useEditorState, useEditorUi, useStore, useTarget } from "../context.tsx";
import { type Ghost, type Ghosting, sameGhosting } from "../ghosts.ts";
import type { EditorState } from "../store.ts";

/** Which blocks in the canvas show their missing parts. */
export interface GhostPolicy {
  /** Whether a section's slots end with a way to add an item. */
  readonly slotItems: boolean;
  readonly ghosting: (state: EditorState, target: Target, block: BlockId) => Ghosting | null;
}

const GhostPolicyContext = createContext<GhostPolicy | null>(null);

export const GhostPolicyProvider = GhostPolicyContext.Provider;

/** The ghost policy the canvas has, or null where nothing shows missing parts. */
export const useGhostPolicy = () => useContext(GhostPolicyContext);

/** Which of a block's missing parts show now. */
export const useGhosting = (target: Target, block: BlockId) => {
  const policy = useGhostPolicy();
  return useEditorState(
    (state) => (policy === null ? null : policy.ghosting(state, target, block)),
    sameGhosting,
  );
};

/** The list item a selected field is in, by its ID. */
const selectedItem = (state: EditorState, target: Target, block: BlockId) => {
  const { selection } = state;
  if (selection?.kind !== "field" || selection.target !== target || selection.block !== block)
    return [];
  const [, item] = selection.path;
  return selection.path.length >= 3 && item !== undefined ? [item] : [];
};

/**
 * The site editor's policy: the selected block shows its missing parts and
 * a way to add to its lists, and the list item a selected field is in shows
 * its own. Slots already have the editor's insert points.
 */
export const selectionPolicy: GhostPolicy = {
  slotItems: false,
  ghosting: (state, target, block) =>
    state.selection?.target === target && state.selection.block === block
      ? { parts: true, addItems: true, items: new Set(selectedItem(state, target, block)) }
      : null,
};

/**
 * The block customizer's policy: the block it shows always shows its
 * missing parts, while a list item, or an item block in a slot, shows its
 * own only while it's pointed at or selected.
 */
export const showcasePolicy = (shown: BlockId): GhostPolicy => ({
  slotItems: true,
  ghosting: (state, target, block) => {
    const { pointed, selection } = state;
    const pointedItem =
      pointed?.target === target && pointed.block === block && pointed.item !== null
        ? [pointed.item.id]
        : [];
    const items = new Set([...pointedItem, ...selectedItem(state, target, block)]);
    if (block === shown) return { parts: true, addItems: true, items };
    const active =
      (pointed?.target === target && pointed.block === block) ||
      (selection?.target === target && selection.block === block);
    return active ? { parts: true, addItems: true, items } : null;
  },
});

interface BlockGhosts {
  readonly block: BlockId;
  readonly ghosts: ReadonlyMap<string, Ghost>;
  /** Whether the block itself is a ghost, an item a slot doesn't have yet. */
  readonly ghost: boolean;
}

const GhostsContext = createContext<BlockGhosts | null>(null);

/** Gives the field components of one block the ghosts in it. */
export function GhostsProvider(props: BlockGhosts & { readonly children: ReactNode }) {
  const { children, ...value } = props;
  return <GhostsContext.Provider value={value}>{children}</GhostsContext.Provider>;
}

/** What a field draws in place of a part the draft doesn't have, or undefined for a real part. */
export const useGhost = (block: BlockId, path: ReadonlyArray<string>) => {
  const context = useContext(GhostsContext);
  return context?.block === block ? context.ghosts.get(path.join(".")) : undefined;
};

/** Whether a block is a ghost item, which can't be selected. */
export const useIsGhostBlock = (block: BlockId) => {
  const context = useContext(GhostsContext);
  return context?.block === block && context.ghost;
};

/**
 * The dashed button a ghost draws: it adds the part with the example it
 * stood for, and selects it. `area` makes it fill the part's own box, as an
 * image's ghost does, using the part's classes for its size.
 */
export function GhostButton(props: {
  readonly ghost: Extract<Ghost, { readonly kind: "add" }>;
  readonly area?: string | undefined;
}) {
  const store = useStore();
  const ui = useEditorUi();
  const target = useTarget();
  const { ghost } = props;
  return (
    <button
      type="button"
      className={cn(props.area, "pakshi-add", props.area !== undefined && "pakshi-add-area")}
      data-pakshi-add={ghost.select.path.join(".")}
      onClick={() => {
        if (store.run(ghost.ops).length > 0) return;
        store.select({ kind: "field", target, ...ghost.select });
        ui.focusSelection("canvas");
      }}
    >
      <span aria-hidden className="pakshi-add-plus">
        +
      </span>
      <span className="pakshi-add-label">{ghost.label}</span>
    </button>
  );
}
