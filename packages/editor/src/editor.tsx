import { type BlockDefinition, FieldEditingProvider } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId, BlockType, MediaId, PageId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import type { MediaSummary } from "@repo/contracts/studio";
import { themeCss } from "@repo/tokens";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";

import { fieldEditing, isSelectedField } from "./canvas/fields.tsx";
import { FormattingToolbar } from "./canvas/formatting.tsx";
import { CanvasFrame } from "./canvas/frame.tsx";
import { MediaPopover } from "./canvas/media-popover.tsx";
import { CanvasOverlay } from "./canvas/overlay.tsx";
import { PageView } from "./canvas/page-view.tsx";
import { StableView } from "./canvas/stable-view.tsx";
import { keyboardCommands, toolbarCommands, type Where } from "./commands.ts";
import {
  type ActiveRichText,
  controlId,
  type EditorUi,
  type FieldTarget,
  type InsertSpot,
  ServicesProvider,
  UiProvider,
  useEditorState,
  useEditorUi,
  useServices,
  useStore,
} from "./context.tsx";
import { BlockDragDrop } from "./dnd.tsx";
import type { Notice } from "./notices.ts";
import { BlockPicker } from "./picker.tsx";
import { type Origin, runCommand } from "./run-command.ts";
import { SettingsPanel } from "./settings/panel.tsx";
import { ariaShortcuts, formatShortcut, matches } from "./shortcuts.ts";
import { type Connection, EditorStore } from "./store.ts";

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

/** Whether a command's shortcuts reach a key pressed from this origin. */
const reaches = (where: Where, origin: Origin) =>
  where === "editor" || (where === "block" ? origin !== "elsewhere" : origin === "canvas");

/**
 * An element Studio's popovers can be positioned from. An element in the
 * canvas is measured through its frame, so the popover lands beside it.
 */
const hostAnchor = (element: Element) => {
  const frame = element.ownerDocument.defaultView?.frameElement;
  if (frame === null || frame === undefined) return element;
  return {
    contextElement: frame,
    getBoundingClientRect: () => {
      const inner = element.getBoundingClientRect();
      const outer = frame.getBoundingClientRect();
      return new DOMRect(outer.left + inner.left, outer.top + inner.top, inner.width, inner.height);
    },
  };
};

/**
 * Holds the local copy of the draft and the editor's shared state. Studio
 * lays out the panels inside it: `EditorCanvas`, `EditorOutline`,
 * `EditorSettings`, and its own toolbar with `useEditorStatus` and
 * `useToolbarCommands`.
 */
export function EditorProvider(props: {
  readonly draft: Draft;
  readonly page: PageId;
  readonly definitions: ReadonlyMap<BlockType, BlockDefinition>;
  readonly media: ReadonlyArray<MediaSummary>;
  readonly mediaSrc: (id: MediaId) => string;
  readonly siteCss: string;
  readonly scheme: "light" | "dark";
  /** The person editing, as the others see them. */
  readonly person: Collaborator;
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
        person: props.person,
        connection: props.connection,
        onNotice: props.onNotice,
      }),
  );
  useEffect(() => store.connect(), [store]);
  const [media, setMedia] = useState<CanvasControls["media"]>(null);
  const [richText, setRichText] = useState<ActiveRichText | null>(null);
  const [canvasDocument, setCanvasDocument] = useState<Document | null>(null);
  const [picker, setPicker] = useState<{
    readonly spot: InsertSpot;
    readonly anchor: ReturnType<typeof hostAnchor>;
    readonly origin: Origin;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const services = useMemo(
    () => ({
      store,
      definitions: props.definitions,
      media: props.media,
      mediaSrc: props.mediaSrc,
      siteCss: props.siteCss,
      scheme: props.scheme,
    }),
    [store, props.definitions, props.media, props.mediaSrc, props.siteCss, props.scheme],
  );

  const ui = useMemo<EditorUi>(() => {
    const canvasBlock = (block: BlockId) =>
      canvasDocument?.querySelector<HTMLElement>(`[data-pakshi-block="${block}"]`) ?? null;
    const outlineBlock = (block: BlockId) =>
      document.querySelector<HTMLElement>(`[data-pakshi-outline-block="${block}"]`);
    const focusInCanvas = (field: FieldTarget) => {
      const element = Array.from(
        canvasBlock(field.block)?.querySelectorAll<HTMLElement>(
          `[data-pakshi-field="${field.path.join(".")}"]`,
        ) ?? [],
      ).find(
        (candidate) =>
          candidate.closest("[data-pakshi-block]")?.getAttribute("data-pakshi-block") ===
          field.block,
      );
      element?.focus();
    };
    return {
      openMedia: (field, anchor) => setMedia({ field, anchor }),
      setActiveRichText: setRichText,
      focusInCanvas,
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
      announce: (message) => {
        // Clearing first makes a screen reader repeat a message that's the same as the last.
        setAnnouncement("");
        requestAnimationFrame(() => setAnnouncement(message));
      },
      openPicker: (spot, anchor) => {
        // The picker sits beside the block the spot follows, or the section whose empty slot it's in.
        const beside = spot.after ?? (spot.list === "root" ? null : spot.list.block);
        const element =
          anchor instanceof Element
            ? anchor
            : beside === null
              ? null
              : anchor === "outline"
                ? outlineBlock(beside)
                : canvasBlock(beside);
        const shown = element ?? canvasDocument?.defaultView?.frameElement ?? null;
        if (shown === null) return;
        const origin: Origin = !(anchor instanceof Element)
          ? anchor
          : shown.ownerDocument === canvasDocument
            ? "canvas"
            : shown.closest("[data-pakshi-outline]") !== null
              ? "outline"
              : "elsewhere";
        setPicker({ spot, anchor: hostAnchor(shown), origin });
      },
      focusSelection: (origin) => {
        // Focus moves once the change has rendered, since a moved block's element is placed anew.
        requestAnimationFrame(() => {
          const { selection } = store.getState();
          if (selection === null || origin === "elsewhere") return;
          const element = canvasBlock(selection.block);
          // The canvas shows what's chosen wherever the command started.
          element?.scrollIntoView({ block: "nearest" });
          if (origin === "outline") return outlineBlock(selection.block)?.focus();
          if (selection.kind === "field") return focusInCanvas(selection);
          element?.focus({ preventScroll: true });
        });
      },
    };
  }, [canvasDocument, store]);

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

  // Shortcuts work from Studio and from the canvas. A key typed in a text field is the field's own.
  useEffect(() => {
    const listeners = (canvasDocument === null ? [document] : [document, canvasDocument]).map(
      (target) => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
          const view = target.defaultView;
          if (event.defaultPrevented || event.isComposing || isInTextEntry(event.target, view))
            return;
          const origin: Origin =
            target === canvasDocument
              ? "canvas"
              : elementOf(event.target, view)?.closest("[data-pakshi-outline]") != null
                ? "outline"
                : "elsewhere";
          const command = keyboardCommands.find(
            (candidate) =>
              candidate.keys !== undefined &&
              reaches(candidate.keys.where, origin) &&
              candidate.keys.shortcuts.some((shortcut) => matches(shortcut, event)),
          );
          if (command !== undefined && runCommand({ store, ui }, command, undefined, origin))
            event.preventDefault();
        };
        target.addEventListener("keydown", onKeyDown);
        return () => target.removeEventListener("keydown", onKeyDown);
      },
    );
    return () => {
      for (const remove of listeners) remove();
    };
  }, [store, ui, canvasDocument]);

  return (
    <ServicesProvider value={services}>
      <UiProvider value={ui}>
        <CanvasControlsContext.Provider value={controls}>
          <BlockDragDrop>{props.children}</BlockDragDrop>
          {picker !== null && (
            <BlockPicker
              spot={picker.spot}
              anchor={picker.anchor}
              origin={picker.origin}
              onClose={() => setPicker(null)}
            />
          )}
          <div aria-live="polite" className="sr-only">
            {announcement}
          </div>
        </CanvasControlsContext.Provider>
      </UiProvider>
    </ServicesProvider>
  );
}

/**
 * The page rendered in a frame with the site's stylesheet and theme, edited
 * in place.
 */
export function EditorCanvas(props: {
  readonly width: number | null;
  /** The editor's accent color, from Studio's theme. */
  readonly accent: string;
  /** The colors that tell other people apart, from Studio's theme, in order. */
  readonly presence: ReadonlyArray<string>;
}) {
  const { siteCss, scheme } = useServices();
  const controls = useCanvasControls();
  const theme = useEditorState((state) => state.view.theme);
  const title = useEditorState((state) => state.view.pages[state.page]?.meta.title ?? "");
  const selection = useEditorState((state) => state.selection);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const css = useMemo(() => themeCss(theme, scheme), [theme, scheme]);

  // The canvas shows the page as sites renders it, but its links don't navigate and its forms don't submit.
  const canvasDocument = controls.document;
  useEffect(() => {
    if (canvasDocument === null) return;
    const view = canvasDocument.defaultView;
    const onClick = (event: MouseEvent) => {
      if (elementOf(event.target, view)?.closest("a") != null) event.preventDefault();
    };
    const onSubmit = (event: SubmitEvent) => event.preventDefault();
    canvasDocument.addEventListener("click", onClick, { capture: true });
    canvasDocument.addEventListener("submit", onSubmit, { capture: true });
    return () => {
      canvasDocument.removeEventListener("click", onClick, { capture: true });
      canvasDocument.removeEventListener("submit", onSubmit, { capture: true });
    };
  }, [canvasDocument]);

  return (
    <div ref={setContainer} className="relative size-full" data-pakshi-canvas-area>
      <CanvasFrame
        title={`Canvas: ${title || "Untitled page"}`}
        siteCss={siteCss}
        themeCss={css}
        accent={props.accent}
        presence={props.presence}
        width={props.width}
        onDocument={controls.setCanvasDocument}
      >
        <FieldEditingProvider value={fieldEditing}>
          <PageView />
        </FieldEditingProvider>
      </CanvasFrame>
      {canvasDocument !== null && <CanvasOverlay document={canvasDocument} />}
      {canvasDocument !== null && <StableView document={canvasDocument} />}
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

/** Whether the draft is saved. */
export const useEditorStatus = () => useEditorState((state) => state.status);

/** The commands Studio's toolbar shows, each with whether it can run now. */
export const useToolbarCommands = () => {
  const { store } = useServices();
  const ui = useEditorUi();
  const available = useEditorState(
    (state) =>
      toolbarCommands.map(
        (command) => command.plan({ state, contracts: store.contracts }) !== undefined,
      ),
    (a, b) => a.every((value, index) => value === b[index]),
  );
  return toolbarCommands.map((command, index) => ({
    title: command.title,
    icon: command.icon,
    shortcut: command.keys === undefined ? undefined : formatShortcut(command.keys.shortcuts[0]),
    ariaKeyShortcuts:
      command.keys === undefined ? undefined : ariaShortcuts(command.keys.shortcuts),
    disabled: available[index] !== true,
    run: () => runCommand({ store, ui }, command, undefined, "elsewhere"),
  }));
};

/** Clears the selection, so the settings panel shows the page. */
export const useDeselect = () => {
  const store = useStore();
  return () => store.select(null);
};

/** The title of the page being edited, as the draft has it now. */
export const usePageTitle = () =>
  useEditorState((state) => state.view.pages[state.page]?.meta.title ?? "");
