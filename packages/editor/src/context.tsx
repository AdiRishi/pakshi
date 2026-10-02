import type { BlockDefinition, Field } from "@repo/blocks";
import type { ExampleSource } from "@repo/blocks/fixtures";
import type { BlockId, BlockType, MediaId } from "@repo/contracts/ids";
import type { BlockList, PropPath, Target } from "@repo/contracts/ops";
import type { PublishedSettings } from "@repo/contracts/settings";
import type { MediaSummary } from "@repo/contracts/studio";
import type { Editor } from "@tiptap/core";
import { createContext, useContext, useRef, useSyncExternalStore } from "react";

import type { Origin } from "./run-command.ts";
import { type EditorState, type EditorStore, fieldKey } from "./store.ts";

/** An image in the library the editor offers: what it shows and places of an image. */
export type EditorImage = Pick<MediaSummary, "id" | "alt" | "width" | "height">;

/**
 * What the editor needs from Studio besides the draft: block versions, images
 * and their addresses, and what a page is rendered with.
 */
export interface EditorServices {
  readonly store: EditorStore;
  readonly definitions: ReadonlyMap<BlockType, BlockDefinition>;
  readonly media: ReadonlyArray<EditorImage>;
  /** The address the canvas loads an image from. */
  readonly mediaSrc: (id: MediaId) => string;
  /** The address of the stylesheet `sites` renders pages with. */
  readonly siteCss: string;
  /** The site's published settings, which pages show with. */
  readonly settings: PublishedSettings;
  /** The color scheme the canvas and block previews show the theme in. */
  readonly scheme: "light" | "dark";
  /**
   * Asks for alt text for an image where a block places it, which answers
   * null when there's none to suggest. Null where nothing can be asked.
   */
  readonly suggestAltText: ((media: MediaId, block: BlockId) => Promise<string | null>) | null;
  /** Where the content of a newly added part or item comes from. */
  readonly examples: ExampleSource;
  /** Adds an image to the site's library, or null for someone who can't. */
  readonly uploadImage: ((file: File) => Promise<MediaSummary>) | null;
}

const ServicesContext = createContext<EditorServices | null>(null);

export const ServicesProvider = ServicesContext.Provider;

export const useServices = () => {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error("The editor's components render only inside <Editor>.");
  return services;
};

export const useStore = () => useServices().store;

/**
 * A slice of the editor's state. The component re-renders only when the
 * slice changes, compared with `isEqual`, which defaults to identity.
 */
export const useEditorState = <T,>(
  selector: (state: EditorState) => T,
  isEqual: (a: T, b: T) => boolean = Object.is,
) => {
  const store = useStore();
  const last = useRef<{ readonly state: EditorState; readonly value: T } | null>(null);
  const select = () => {
    const state = store.getState();
    const previous = last.current;
    if (previous !== null && previous.state === state) return previous.value;
    const value = selector(state);
    const kept = previous !== null && isEqual(previous.value, value) ? previous.value : value;
    last.current = { state, value: kept };
    return kept;
  };
  return useSyncExternalStore(store.subscribe, select, select);
};

/** Which part of the draft a block belongs to: a page, or the site-level header and footer. */
const TargetContext = createContext<Target | null>(null);

export const TargetProvider = TargetContext.Provider;

export const useTarget = () => {
  const target = useContext(TargetContext);
  if (target === null) throw new Error("Editable blocks render only inside the canvas.");
  return target;
};

/** A field on a block, as the editor addresses it. */
export interface FieldTarget {
  readonly target: Target;
  readonly block: BlockId;
  readonly path: PropPath;
}

/** A rich text field with focus, which the formatting toolbar acts on. */
export interface ActiveRichText {
  readonly target: FieldTarget;
  readonly editor: Editor;
  readonly field: Extract<Field, { readonly kind: "richText" }>;
  readonly element: HTMLElement;
}

/** A spot in a list where a new block can go: after a block, or first when `after` is null. */
export interface InsertSpot {
  readonly list: BlockList;
  readonly after: BlockId | null;
}

/** Controls that render in Studio, opened from fields in the canvas, and the way back. */
export interface EditorUi {
  /** Tells a screen reader what just changed. */
  readonly announce: (message: string) => void;
  /** Opens the block picker for a spot, beside the element it's opened from or the block it follows. */
  readonly openPicker: (spot: InsertSpot, origin: Origin, element?: Element) => void;
  /** Moves focus to the selected block or field, where a command started. */
  readonly focusSelection: (origin: Origin) => void;
  readonly openMedia: (field: FieldTarget, anchor: Element) => void;
  /** Opens where a link with no element of its own goes, from its mark on the page or a row naming it. */
  readonly openLink: (field: FieldTarget, anchor: Element) => void;
  /** Opens the choice of a form, from the form on the page. */
  readonly openForm: (field: FieldTarget, anchor: Element) => void;
  /** Opens the control of a setting the page doesn't draw, such as which blog a list shows, from a row naming it. */
  readonly openSetting: (field: FieldTarget, anchor: Element) => void;
  readonly setActiveRichText: (active: ActiveRichText | null) => void;
  /** Moves focus to a field on the page. */
  readonly focusInCanvas: (field: FieldTarget) => void;
  /** Moves focus to a field's control in the settings panel. */
  readonly revealControl: (field: FieldTarget) => void;
}

const UiContext = createContext<EditorUi | null>(null);

export const UiProvider = UiContext.Provider;

export const useEditorUi = () => {
  const ui = useContext(UiContext);
  if (ui === null) throw new Error("The editor's components render only inside <Editor>.");
  return ui;
};

/** The key typing in a field shares, so a burst of keystrokes is one undo step. */
export const burstKey = (field: FieldTarget) => fieldKey(field.target, field.block, field.path);

/** The ID of a field's control in the settings panel. */
export const controlId = (field: FieldTarget) =>
  `pakshi-control-${field.target}-${field.block}-${field.path.join("-")}`;
