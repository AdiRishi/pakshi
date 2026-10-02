import { type BlockDefinition, FieldEditingProvider } from "@repo/blocks";
import type { Selected } from "@repo/contracts/agent";
import { type Draft, isBehind } from "@repo/contracts/draft";
import type { BlockId, BlockType, MediaId, PageId } from "@repo/contracts/ids";
import type { Collaborator } from "@repo/contracts/live";
import type { Target, PropPath } from "@repo/contracts/ops";
import type { PublishedSettings } from "@repo/contracts/settings";
import type { LiveRelease } from "@repo/contracts/snapshot";
import type { MediaSummary } from "@repo/contracts/studio";
import { Equal } from "effect";
import { type ReactNode, useEffect, useMemo, useState } from "react";

import { screenRect } from "./canvas/anchor.tsx";
import {
  CanvasChrome,
  type CanvasControls,
  CanvasControlsProvider,
  type CanvasPopover,
  useCanvasControls,
} from "./canvas/controls.tsx";
import { fieldEditing } from "./canvas/fields.tsx";
import { CanvasFrame } from "./canvas/frame.tsx";
import { GhostPolicyProvider, selectionPolicy } from "./canvas/ghost.tsx";
import { CanvasOverlay } from "./canvas/overlay.tsx";
import { PageView } from "./canvas/page-view.tsx";
import { StableView } from "./canvas/stable-view.tsx";
import { type Command, keyboardCommands, toolbarCommands, type Where } from "./commands.ts";
import {
  type ActiveRichText,
  controlId,
  type EditorImage,
  type EditorServices,
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
    getBoundingClientRect: () => screenRect(element) ?? element.getBoundingClientRect(),
  };
};

/**
 * The editor's shared state around a store: its services, the controls
 * Studio shows for the canvas, the keyboard shortcuts `keys` lists, and
 * announcements for screen readers. A form opened from the page goes to its
 * control in the settings panel, or to a popover beside it where there's no
 * panel.
 */
export function EditorRoot(
  props: Omit<EditorServices, "store"> & {
    readonly store: EditorStore;
    readonly keys: ReadonlyArray<Command>;
    readonly forms: "settings" | "popover";
    readonly children: ReactNode;
  },
) {
  const { store } = props;
  const [popover, setPopover] = useState<CanvasPopover | null>(null);
  const [richText, setRichText] = useState<ActiveRichText | null>(null);
  const [canvasDocument, setCanvasDocument] = useState<Document | null>(null);
  const [picker, setPicker] = useState<{
    readonly spot: InsertSpot;
    readonly anchor: ReturnType<typeof hostAnchor>;
    readonly origin: Origin;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Images uploaded while the editor is open, which the library shows first.
  const [uploaded, setUploaded] = useState<ReadonlyArray<EditorImage>>([]);
  const upload = props.uploadImage;

  const services = useMemo<EditorServices>(
    () => ({
      store,
      definitions: props.definitions,
      media: [...uploaded, ...props.media],
      mediaSrc: props.mediaSrc,
      suggestAltText: props.suggestAltText,
      examples: props.examples,
      uploadImage:
        upload === null
          ? null
          : async (file: File) => {
              const image = await upload(file);
              setUploaded((current) => [image, ...current]);
              return image;
            },
      siteCss: props.siteCss,
      settings: props.settings,
      scheme: props.scheme,
    }),
    [
      store,
      props.definitions,
      uploaded,
      props.media,
      upload,
      props.mediaSrc,
      props.suggestAltText,
      props.examples,
      props.siteCss,
      props.settings,
      props.scheme,
    ],
  );

  const forms = props.forms;
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
    const revealControl = (field: FieldTarget) => {
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
    };
    return {
      openMedia: (field, anchor) => setPopover({ kind: "media", field, anchor }),
      openLink: (field, anchor) => setPopover({ kind: "link", field, anchor }),
      openForm: (field, anchor) =>
        forms === "popover" ? setPopover({ kind: "form", field, anchor }) : revealControl(field),
      setActiveRichText: setRichText,
      focusInCanvas,
      revealControl,
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
  }, [canvasDocument, store, forms]);

  const controls = useMemo<CanvasControls>(
    () => ({
      popover,
      richText,
      document: canvasDocument,
      closePopover: () => setPopover(null),
      setCanvasDocument,
    }),
    [popover, richText, canvasDocument],
  );

  // Shortcuts work from Studio and from the canvas. A key typed in a text field is the field's own.
  const keys = props.keys;
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
          const command = keys.find(
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
  }, [store, ui, canvasDocument, keys]);

  return (
    <ServicesProvider value={services}>
      <UiProvider value={ui}>
        <CanvasControlsProvider value={controls}>
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
        </CanvasControlsProvider>
      </UiProvider>
    </ServicesProvider>
  );
}

/**
 * Holds the local copy of the draft and the editor's shared state. Studio
 * lays out the panels inside it: `EditorCanvas`, `EditorOutline`,
 * `EditorSettings`, and its own toolbar with `useEditorStatus` and
 * `useToolbarCommands`.
 */
export function EditorProvider(props: {
  readonly draft: Draft;
  /** The release the site serves as the editor opens. */
  readonly live: LiveRelease;
  readonly page: PageId;
  readonly definitions: ReadonlyMap<BlockType, BlockDefinition>;
  readonly media: ReadonlyArray<EditorImage>;
  readonly mediaSrc: (id: MediaId) => string;
  readonly suggestAltText: (media: MediaId, block: BlockId) => Promise<string | null>;
  /** Adds an image to the site's library, or null for someone who can't. */
  readonly uploadImage: ((file: File) => Promise<MediaSummary>) | null;
  readonly siteCss: string;
  /** The site's published settings, which pages show with, such as its name. */
  readonly settings: PublishedSettings;
  readonly scheme: "light" | "dark";
  /** The person editing, as the others see them. */
  readonly person: Collaborator;
  readonly connection: Connection;
  readonly onNotice: (notice: Notice) => void;
  readonly children: ReactNode;
}) {
  const { draft, live, page, person, connection, onNotice, children, ...services } = props;
  const [store] = useState(
    () =>
      new EditorStore({
        draft,
        live,
        page,
        contracts: props.definitions,
        person,
        connection,
        onNotice,
      }),
  );
  useEffect(() => store.connect(), [store]);
  return (
    <EditorRoot
      {...services}
      store={store}
      examples="placeholder"
      keys={keyboardCommands}
      forms="settings"
    >
      {children}
    </EditorRoot>
  );
}

/** The page in a canvas shows as sites renders it, but its links don't navigate and its forms don't submit. */
export const useStillPage = (canvasDocument: Document | null) => {
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
};

/**
 * The page rendered in a frame with the site's stylesheet and theme, edited
 * in place.
 */
export function EditorCanvas(props: {
  readonly width: number | null;
  /** The editor's accent color, from Studio's theme. */
  readonly accent: string;
  /** The color the canvas marks unfinished parts with, from Studio's theme. */
  readonly warning: string;
  /** The colors that tell other people apart, from Studio's theme, in order. */
  readonly presence: ReadonlyArray<string>;
}) {
  const { siteCss, scheme } = useServices();
  const controls = useCanvasControls();
  const theme = useEditorState((state) => state.view.brand.theme);
  const title = useEditorState((state) => state.view.pages[state.page]?.meta.title ?? "");
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const canvasDocument = controls.document;
  useStillPage(canvasDocument);

  return (
    <div ref={setContainer} className="relative size-full" data-pakshi-canvas-area>
      <CanvasFrame
        title={`Canvas: ${title || "Untitled page"}`}
        siteCss={siteCss}
        theme={theme}
        scheme={scheme}
        accent={props.accent}
        warning={props.warning}
        presence={props.presence}
        width={props.width}
        onDocument={controls.setCanvasDocument}
      >
        <FieldEditingProvider value={fieldEditing}>
          <GhostPolicyProvider value={selectionPolicy}>
            <PageView />
          </GhostPolicyProvider>
        </FieldEditingProvider>
      </CanvasFrame>
      {canvasDocument !== null && <CanvasOverlay document={canvasDocument} />}
      {canvasDocument !== null && <StableView document={canvasDocument} />}
      {container !== null && canvasDocument !== null && (
        <CanvasChrome container={container} document={canvasDocument} clip />
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

/** Whether the draft started from a release that's no longer live, so it must merge before it's published. */
export const useBehind = () =>
  useEditorState((state) => isBehind(state.confirmed.base, state.live));

/** Who published or closed the draft, once someone has. */
export const useDraftClosure = () => useEditorState((state) => state.closed);

/** Whether the draft must be opened again, because a merge moved it to other block versions. */
export const useOutdated = () => useEditorState((state) => state.outdated);

/** Whether the draft's sharing changed so the person can no longer edit it. */
export const useAccessEnded = () => useEditorState((state) => state.accessEnded);

/** The title of the page being edited, as the draft has it now. */
export const usePageTitle = () =>
  useEditorState((state) => state.view.pages[state.page]?.meta.title ?? "");

/**
 * The block or field the person has selected, for the agent to know what
 * "this" means, with the block's title for the chat panel.
 */
export const useSelected = (): Selected | null => {
  const { definitions } = useServices();
  return useEditorState(
    ({ selection, page, view }) => {
      if (selection === null) return null;
      const holder = selection.target === "site" ? view.parts : view.pages[selection.target];
      const block = holder?.blocks[selection.block];
      const title = block === undefined ? undefined : definitions.get(block.type)?.title;
      if (title === undefined) return null;
      return {
        page,
        focus:
          selection.kind === "field"
            ? { target: selection.target, block: selection.block, path: selection.path }
            : { target: selection.target, block: selection.block },
        title,
      };
    },
    (a, b) => Equal.equals(a, b),
  );
};

/**
 * Selects a block on the page being edited, or with a path one of its
 * fields, scrolls the canvas to it, and focuses it there.
 */
export const useShowBlock = () => {
  const store = useStore();
  const ui = useEditorUi();
  return (target: Target, block: BlockId, path?: PropPath) => {
    store.select(
      path === undefined
        ? { kind: "block", target, block }
        : { kind: "field", target, block, path },
    );
    ui.focusSelection("canvas");
  };
};

/** The draft as the person sees it, their unconfirmed changes included. */
export const useDraftView = () => useEditorState((state) => state.view);

/** The draft revision SiteDoc last confirmed, which moves on with every committed change. */
export const useConfirmedRevision = () => useEditorState((state) => state.confirmed.revision);

/** The page being edited. */
export const usePage = () => useEditorState((state) => state.page);

/** A block type's title at the version the draft pins, such as "Rich text" for `rich-text`. */
export const useBlockTitle = () => {
  const { definitions } = useServices();
  return (type: BlockType) => definitions.get(type)?.title ?? type;
};
