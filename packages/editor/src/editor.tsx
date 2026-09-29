import { type BlockDefinition, FieldEditingProvider } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BlockType, MediaId, PageId } from "@repo/contracts/ids";
import type { Target } from "@repo/contracts/ops";
import type { MediaSummary } from "@repo/contracts/studio";
import { themeCss } from "@repo/tokens";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { fieldEditing, isSelectedField } from "./canvas/fields.tsx";
import { FormattingToolbar } from "./canvas/formatting.tsx";
import { CanvasFrame } from "./canvas/frame.tsx";
import { MediaPopover } from "./canvas/media-popover.tsx";
import { PageView } from "./canvas/page-view.tsx";
import {
  type ActiveRichText,
  controlId,
  type EditorUi,
  type FieldTarget,
  ServicesProvider,
  UiProvider,
  useEditorState,
  useStore,
} from "./context.tsx";
import { SettingsPanel } from "./settings/panel.tsx";
import { type Connection, EditorStore, type Notice } from "./store.ts";

/** What the canvas shows in Studio beside the page: the media popover and the formatting toolbar. */
interface CanvasControls {
  readonly media: { readonly field: FieldTarget; readonly anchor: HTMLElement } | null;
  readonly richText: ActiveRichText | null;
  readonly document: Document | null;
  readonly closeMedia: () => void;
  readonly setCanvasDocument: (document: Document) => void;
}

const CanvasControlsContext = createContext<CanvasControls | null>(null);

const useCanvasControls = () => {
  const controls = useContext(CanvasControlsContext);
  if (controls === null) throw new Error("The canvas renders only inside <EditorProvider>.");
  return controls;
};

const textEntry = "input, textarea, select, [contenteditable]:not([contenteditable='false'])";

/**
 * The element an event reached. The canvas has its own window, so its nodes
 * are checked against the Element class of the window they belong to.
 */
const elementOf = (target: EventTarget | null, view: (Window & typeof globalThis) | null) =>
  view !== null && target instanceof view.Element ? target : null;

/** Whether a key went to a text field, which handles its own keys, undo included. */
const isInTextEntry = (target: EventTarget | null, view: (Window & typeof globalThis) | null) =>
  elementOf(target, view)?.closest(textEntry) != null;

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

/** The section an item sits in, or undefined for a section. */
const parentOf = (draft: Draft, page: PageId, block: BlockId) => {
  const document = draft.pages[page];
  return document?.root.find((id) =>
    Object.values(document.blocks[id]?.slots ?? {}).some((items) => items.includes(block)),
  );
};

/**
 * Holds the local copy of the draft and the editor's shared state. Studio
 * lays out the panels inside it: `EditorCanvas`, `EditorSettings`, and its
 * own toolbar with `useEditorStatus` and `useEditorCommands`.
 */
export function EditorProvider(props: {
  readonly draft: Draft;
  readonly page: PageId;
  readonly definitions: ReadonlyMap<BlockType, BlockDefinition>;
  readonly media: ReadonlyArray<MediaSummary>;
  readonly mediaSrc: (id: MediaId) => string;
  readonly connection: Connection;
  readonly onNotice: (notice: Notice) => void;
  readonly children: ReactNode;
}) {
  const [store] = useState(
    () =>
      new EditorStore({
        draft: props.draft,
        page: props.page,
        contracts: props.definitions,
        connection: props.connection,
        onNotice: props.onNotice,
      }),
  );
  const [media, setMedia] = useState<CanvasControls["media"]>(null);
  const [richText, setRichText] = useState<ActiveRichText | null>(null);
  const [canvasDocument, setCanvasDocument] = useState<Document | null>(null);

  const services = useMemo(
    () => ({ store, definitions: props.definitions, media: props.media, mediaSrc: props.mediaSrc }),
    [store, props.definitions, props.media, props.mediaSrc],
  );

  const ui = useMemo<EditorUi>(
    () => ({
      openMedia: (field, anchor) => setMedia({ field, anchor }),
      setActiveRichText: setRichText,
      focusInCanvas: (field) => {
        const candidates = canvasDocument?.querySelectorAll<HTMLElement>(
          `[data-pakshi-field="${field.path.join(".")}"]`,
        );
        const element = Array.from(candidates ?? []).find(
          (candidate) =>
            candidate.closest("[data-pakshi-block]")?.getAttribute("data-pakshi-block") ===
            field.block,
        );
        element?.focus();
      },
      revealControl: (field) => {
        // The settings panel shows the field's control once the selection has rendered.
        setTimeout(() => {
          // A field made of parts, such as a button, focuses its first part.
          const control = document.getElementById(controlId(field));
          const focusable = control?.matches("input, textarea, select, button")
            ? control
            : (control?.querySelector<HTMLElement>("input, textarea, select") ??
              control?.querySelector<HTMLElement>("button"));
          focusable?.focus();
        });
      },
    }),
    [canvasDocument],
  );

  const controls = useMemo<CanvasControls>(
    () => ({
      media,
      richText,
      document: canvasDocument,
      closeMedia: () => setMedia(null),
      setCanvasDocument,
    }),
    [media, richText, canvasDocument],
  );

  // Undo and redo work from Studio and from the canvas, except in a text field, which handles its own.
  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const view = event.currentTarget instanceof Document ? event.currentTarget.defaultView : null;
      if (!(event.metaKey || event.ctrlKey) || isInTextEntry(event.target, view)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) store.undo();
      else if ((key === "z" && event.shiftKey) || key === "y") store.redo();
      else return;
      event.preventDefault();
    };
    const targets = canvasDocument === null ? [document] : [document, canvasDocument];
    for (const target of targets) target.addEventListener("keydown", onKeyDown);
    return () => {
      for (const target of targets) target.removeEventListener("keydown", onKeyDown);
    };
  }, [store, canvasDocument]);

  return (
    <ServicesProvider value={services}>
      <UiProvider value={ui}>
        <CanvasControlsContext.Provider value={controls}>
          {props.children}
        </CanvasControlsContext.Provider>
      </UiProvider>
    </ServicesProvider>
  );
}

/**
 * The page rendered in a frame with the site's stylesheet and theme, edited
 * in place. Arrow keys move between blocks, Enter moves into the selected
 * block's first field, and Escape moves back out.
 */
export function EditorCanvas(props: {
  readonly siteCss: string;
  readonly width: number | null;
  readonly scheme: "light" | "dark";
  /** The editor's accent color, from Studio's theme. */
  readonly accent: string;
}) {
  const store = useStore();
  const controls = useCanvasControls();
  const theme = useEditorState((state) => state.view.theme);
  const title = useEditorState((state) => state.view.pages[state.page]?.meta.title ?? "");
  const selection = useEditorState((state) => state.selection);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const css = useMemo(() => themeCss(theme, props.scheme), [theme, props.scheme]);

  // The canvas listens on its own document, since its content has no wrapper to put handlers on.
  const canvasDocument = controls.document;
  useEffect(() => {
    if (canvasDocument === null) return;
    const view = canvasDocument.defaultView;
    const focusBlock = (block: BlockId) => {
      const element = canvasDocument.querySelector<HTMLElement>(`[data-pakshi-block="${block}"]`);
      element?.focus();
      element?.scrollIntoView({ block: "nearest" });
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isInTextEntry(event.target, view)) return;
      const { view: draft, page, selection: current } = store.getState();
      const order = blockOrder(draft, page);
      const index =
        current === null ? -1 : order.findIndex((entry) => entry.block === current.block);
      const move = (next: (typeof order)[number] | undefined) => {
        if (next === undefined) return;
        event.preventDefault();
        store.select({ kind: "block", ...next });
        focusBlock(next.block);
      };
      switch (event.key) {
        case "ArrowDown":
          return move(order[index + 1]);
        case "ArrowUp":
          return move(index === -1 ? order.at(-1) : order[index - 1]);
        case "Enter": {
          // Enter on a field, such as a button, is the field's own; on a block it moves inside.
          if (
            current === null ||
            elementOf(event.target, view)?.hasAttribute("data-pakshi-block") !== true
          )
            return;
          const root = canvasDocument.querySelector(`[data-pakshi-block="${current.block}"]`);
          const field = Array.from(
            root?.querySelectorAll<HTMLElement>("[data-pakshi-field]") ?? [],
          ).find((candidate) => candidate.closest("[data-pakshi-block]") === root);
          if (field === undefined) return;
          event.preventDefault();
          field.focus();
          return;
        }
        case "Escape": {
          if (current === null) return;
          event.preventDefault();
          const parent =
            current.target === "site" ? undefined : parentOf(draft, page, current.block);
          const block = current.kind === "field" ? current.block : parent;
          if (block === undefined) return store.select(null);
          store.select({ kind: "block", target: current.target, block });
          focusBlock(block);
          return;
        }
      }
    };
    // The canvas shows the page as sites renders it, but its links don't navigate and its forms don't submit.
    const onClick = (event: MouseEvent) => {
      if (elementOf(event.target, view)?.closest("a") != null) event.preventDefault();
    };
    const onSubmit = (event: SubmitEvent) => event.preventDefault();
    canvasDocument.addEventListener("keydown", onKeyDown);
    canvasDocument.addEventListener("click", onClick, { capture: true });
    canvasDocument.addEventListener("submit", onSubmit, { capture: true });
    return () => {
      canvasDocument.removeEventListener("keydown", onKeyDown);
      canvasDocument.removeEventListener("click", onClick, { capture: true });
      canvasDocument.removeEventListener("submit", onSubmit, { capture: true });
    };
  }, [canvasDocument, store]);

  return (
    <div ref={setContainer} className="relative size-full">
      <CanvasFrame
        title={`Canvas: ${title || "Untitled page"}`}
        siteCss={props.siteCss}
        themeCss={css}
        accent={props.accent}
        width={props.width}
        onDocument={controls.setCanvasDocument}
      >
        <FieldEditingProvider value={fieldEditing}>
          <PageView />
        </FieldEditingProvider>
      </CanvasFrame>
      {container !== null && controls.media !== null && (
        <MediaPopover
          field={controls.media.field}
          anchor={controls.media.anchor}
          container={container}
          onClose={controls.closeMedia}
        />
      )}
      {container !== null &&
        controls.richText !== null &&
        isSelectedField(selection, controls.richText.target) && (
          <FormattingToolbar active={controls.richText} container={container} />
        )}
    </div>
  );
}

/** The settings panel for the selected block, or the page when nothing is selected. */
export function EditorSettings() {
  return <SettingsPanel />;
}

/** Whether the draft is saved, and whether undo and redo have anything to do. */
export const useEditorStatus = () => ({
  status: useEditorState((state) => state.status),
  canUndo: useEditorState((state) => state.canUndo),
  canRedo: useEditorState((state) => state.canRedo),
});

/** The commands Studio's toolbar offers. */
export const useEditorCommands = () => {
  const store = useStore();
  return { undo: () => store.undo(), redo: () => store.redo(), deselect: () => store.select(null) };
};

/** The title of the page being edited, as the draft has it now. */
export const usePageTitle = () =>
  useEditorState((state) => state.view.pages[state.page]?.meta.title ?? "");
