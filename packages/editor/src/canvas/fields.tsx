import {
  type FieldAddress,
  type FieldEditing,
  richTextExtensions,
  toJsonContent,
} from "@repo/blocks";
import type { PageId } from "@repo/contracts/ids";
import { Editor } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { Mapping } from "@tiptap/pm/transform";
import { Option, Schema } from "effect";
import {
  type ComponentProps,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
} from "react";

import {
  burstKey,
  type FieldTarget,
  useEditorState,
  useEditorUi,
  useServices,
  useStore,
  useTarget,
} from "../context.tsx";
import { useBlockDrop, useDropPlacement } from "../dnd.tsx";
import type { Selection } from "../store.ts";
import { allowedTypes } from "../structure.ts";
import { mapOffset, rebaseText } from "../text-changes.ts";
import { changeTo, rebaseOnto, remoteChange } from "./rich-text-sync.ts";

const samePath = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  a.length === b.length && a.every((step, index) => step === b[index]);

export const isSelectedField = (selection: Selection | null, field: FieldTarget) =>
  selection?.kind === "field" &&
  selection.target === field.target &&
  selection.block === field.block &&
  samePath(selection.path, field.path);

/** The field an editing component edits, and whether it's selected. */
const useField = (address: FieldAddress) => {
  const target = useTarget();
  const field: FieldTarget = { target, block: address.block, path: address.path };
  const selected = useEditorState((state) => isSelectedField(state.selection, field));
  return { field, selected };
};

// Caret -------------------------------------------------------------------

/** How many characters of an element's text come before a point in it. */
const textOffset = (element: HTMLElement, node: Node, offset: number) => {
  const before = element.ownerDocument.createRange();
  before.selectNodeContents(element);
  before.setEnd(node, offset);
  return before.toString().length;
};

/** The selection in an element, as character offsets of its text, or null when it's elsewhere. */
const selectionIn = (element: HTMLElement) => {
  const selection = element.ownerDocument.getSelection();
  if (selection === null || selection.anchorNode === null || selection.focusNode === null)
    return null;
  if (!element.contains(selection.anchorNode) || !element.contains(selection.focusNode))
    return null;
  return {
    anchor: textOffset(element, selection.anchorNode, selection.anchorOffset),
    focus: textOffset(element, selection.focusNode, selection.focusOffset),
  };
};

/** The text node and offset in it at a character offset of an element's text. */
const pointAt = (element: HTMLElement, offset: number) => {
  const walker = element.ownerDocument.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) return { node, offset: remaining };
    remaining -= length;
  }
  return { node: element, offset: element.childNodes.length };
};

const placeSelection = (element: HTMLElement, anchor: number, focus: number) => {
  const start = pointAt(element, anchor);
  const end = pointAt(element, focus);
  element.ownerDocument
    .getSelection()
    ?.setBaseAndExtent(start.node, start.offset, end.node, end.offset);
};

/**
 * Shows new text in a field, keeping the person's caret or selection in the
 * same place relative to the text around it.
 */
const replaceText = (element: HTMLElement, text: string) => {
  const before = element.textContent ?? "";
  const selection = element.ownerDocument.activeElement === element ? selectionIn(element) : null;
  element.textContent = text;
  if (selection !== null)
    placeSelection(
      element,
      mapOffset(before, text, selection.anchor),
      mapOffset(before, text, selection.focus),
    );
};

/** Inserts text at the caret, replacing any selection, as typing would. */
const insertAtCaret = (element: HTMLElement, text: string) => {
  const selection = element.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const node = element.ownerDocument.createTextNode(text);
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
};

// Plain text ----------------------------------------------------------------

/**
 * Plain text edited in place. The element is uncontrolled: typing changes it
 * directly, and the editor writes to it only when the stored value differs
 * from what it shows, keeping the caret where it was in the text.
 */
const EditableText: FieldEditing["Text"] = (props) => {
  const store = useStore();
  const { field, selected } = useField(props);
  const element = useRef<HTMLElement>(null);
  /** The field's text when an input method started composing, or null when none is. */
  const composingFrom = useRef<string | null>(null);
  const value = useRef(props.value);
  const definition = props.definition;
  if (definition.kind !== "text") throw new Error(`${props.path.join(".")} isn't plain text.`);
  const { max, multiline } = definition;

  // Nothing is written into the field while an input method composes in it.
  useLayoutEffect(() => {
    value.current = props.value;
    const current = element.current;
    if (current === null || composingFrom.current !== null || current.textContent === props.value)
      return;
    replaceText(current, props.value);
  }, [props.value]);

  const commit = () => {
    const current = element.current;
    if (current === null || composingFrom.current !== null) return;
    const text = current.textContent ?? "";
    const errors = store.run(
      [{ op: "setProp", target: field.target, block: field.block, path: field.path, value: text }],
      burstKey(field),
    );
    // A refused edit leaves the stored value, so the element shows it again.
    if (errors.length > 0) current.textContent = props.value;
  };

  // React's onBeforeInput doesn't report deletions, so the native event checks the length.
  useEffect(() => {
    const current = element.current;
    if (current === null) return;
    const guard = (event: InputEvent) => {
      if (!event.inputType.startsWith("insert")) return;
      if (
        !multiline &&
        (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak")
      ) {
        event.preventDefault();
        return;
      }
      const selected = current.ownerDocument.getSelection()?.toString().length ?? 0;
      const adding = event.data?.length ?? 1;
      if ((current.textContent?.length ?? 0) - selected + adding > max) event.preventDefault();
    };
    current.addEventListener("beforeinput", guard);
    return () => current.removeEventListener("beforeinput", guard);
  }, [max, multiline]);

  const Element = props.as;
  return (
    <Element
      ref={(node: HTMLElement | null) => {
        element.current = node;
      }}
      className={props.className}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a heading edited in place must stay a heading, so it's an editable element with the textbox role
      role="textbox"
      tabIndex={0}
      aria-label={definition.title}
      aria-multiline={multiline}
      data-pakshi-field={field.path.join(".")}
      data-pakshi-selected={selected || undefined}
      data-pakshi-empty={props.value === "" || undefined}
      data-pakshi-placeholder={definition.title}
      onFocus={() => store.select({ kind: "field", ...field })}
      onBlur={() => store.endBurst()}
      onInput={commit}
      onCompositionStart={() => {
        composingFrom.current = element.current?.textContent ?? "";
      }}
      onCompositionEnd={() => {
        const current = element.current;
        const base = composingFrom.current;
        composingFrom.current = null;
        // A change that arrived while composing applies now, with the composed text made again on it.
        if (current !== null && base !== null && value.current !== base)
          replaceText(current, rebaseText(base, current.textContent ?? "", value.current));
        commit();
      }}
      onPaste={(event) => {
        event.preventDefault();
        const current = element.current;
        if (current === null) return;
        const pasted = event.clipboardData.getData("text/plain");
        const text = multiline ? pasted : pasted.replace(/\s*\n\s*/g, " ");
        const room =
          max -
          (current.textContent?.length ?? 0) +
          (current.ownerDocument.getSelection()?.toString().length ?? 0);
        insertAtCaret(current, text.slice(0, Math.max(0, room)));
        commit();
      }}
      onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          store.cancelBurst();
          element.current?.closest<HTMLElement>("[data-pakshi-block]")?.focus();
        } else if (event.key === "Enter" && !multiline) {
          event.preventDefault();
          store.endBurst();
        }
      }}
    />
  );
};

// Rich text -----------------------------------------------------------------

/**
 * Rich text edited in place with TipTap, mounted on the field's own element so
 * no wrapper changes the layout. It offers only the field's marks and nodes,
 * the same extensions `sites` renders with. While the field has focus, undo
 * goes to TipTap's own history, which never holds other people's changes.
 */
const EditableRichText: FieldEditing["RichText"] = (props) => {
  const store = useStore();
  const ui = useEditorUi();
  const { field, selected } = useField(props);
  const element = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
  const value = useRef(props.value);
  /**
   * While an input method composes: the document when it started, and how
   * the composing has changed it since. Nothing is saved or written into the
   * field until it ends.
   */
  const composition = useRef<{ readonly base: DocumentNode; readonly mapping: Mapping } | null>(
    null,
  );
  const definition = props.definition;
  if (definition.kind !== "richText") throw new Error(`${props.path.join(".")} isn't rich text.`);
  const pathKey = field.path.join(".");

  const onChange = useEffectEvent((updated: Editor) => {
    // Decoding through the field's schema also drops attributes TipTap fills with nulls.
    const decoded = Schema.decodeOption(definition.draft)(updated.getJSON());
    const errors = Option.isNone(decoded)
      ? [{ message: "Not allowed here" }]
      : store.run([{ op: "setProp", ...field, value: decoded.value }], burstKey(field));
    if (errors.length > 0)
      updated.commands.setContent(toJsonContent(value.current), { emitUpdate: false });
  });
  const onFocused = useEffectEvent((focused: Editor, mount: HTMLElement) => {
    store.select({ kind: "field", ...field });
    ui.setActiveRichText({ target: field, editor: focused, field: definition, element: mount });
  });
  const initialContent = useEffectEvent(() => toJsonContent(props.value));

  /** Shows the stored value, unless it's what the field already holds or someone is composing. */
  const showValue = useEffectEvent(() => {
    const instance = editor.current;
    if (instance === null || composition.current !== null) return;
    const next = instance.schema.nodeFromJSON(toJsonContent(value.current));
    if (!next.eq(instance.state.doc)) instance.view.dispatch(changeTo(instance.state, next));
  });

  /** Ends a composition: a change that arrived meanwhile is made on the composed text, and the result saved. */
  const endComposition = useEffectEvent(() => {
    const instance = editor.current;
    const ended = composition.current;
    if (instance === null || ended === null || instance.view.composing) return;
    composition.current = null;
    const theirs = instance.schema.nodeFromJSON(toJsonContent(value.current));
    if (!theirs.eq(ended.base))
      instance.view.dispatch(rebaseOnto(instance.state, ended.base, theirs, ended.mapping));
    if (!instance.state.doc.eq(ended.base)) onChange(instance);
  });

  useEffect(() => {
    const mount = element.current;
    if (mount === null) return;
    const instance = new Editor({
      element: { mount },
      extensions: [...richTextExtensions(definition.marks, definition.nodes), UndoRedo],
      content: initialContent(),
      injectCSS: false,
      editorProps: {
        attributes: {
          role: "textbox",
          "aria-label": definition.title,
          "aria-multiline": "true",
          "data-pakshi-field": pathKey,
          "data-pakshi-rich": "",
        },
        handleKeyDown: (view, event) => {
          if (event.key !== "Escape") return false;
          view.dom.blur();
          view.dom.closest<HTMLElement>("[data-pakshi-block]")?.focus();
          return true;
        },
        handleDOMEvents: {
          compositionstart: (view) => {
            composition.current ??= { base: view.state.doc, mapping: new Mapping() };
            return false;
          },
          // ProseMirror reads what was composed a moment after the event, so this waits for it.
          compositionend: () => {
            requestAnimationFrame(() => endComposition());
            return false;
          },
        },
      },
      onTransaction: ({ transaction }) => {
        if (transaction.docChanged) composition.current?.mapping.appendMapping(transaction.mapping);
        if (composition.current !== null && !instance.view.composing) endComposition();
      },
      onUpdate: ({ editor: updated, transaction }) => {
        if (transaction.getMeta(remoteChange) === true || composition.current !== null) return;
        onChange(updated);
      },
      onFocus: ({ editor: focused }) => onFocused(focused, mount),
      // The toolbar stays while the field is selected, so its link popover can take focus.
      onBlur: () => store.endBurst(),
    });
    editor.current = instance;
    return () => {
      instance.destroy();
      editor.current = null;
    };
    // Later values reach the editor through the effect below, not by making a new one.
  }, [definition, pathKey, store]);

  // Someone else's change applies as the smallest edit, so the cursor stays where it was.
  useEffect(() => {
    value.current = props.value;
    showValue();
  }, [props.value]);

  return (
    <div ref={element} className={props.className} data-pakshi-selected={selected || undefined} />
  );
};

// Media and buttons ---------------------------------------------------------

/** An image placed on the page. Choosing it opens the media popover in Studio. */
const EditableMedia: FieldEditing["Media"] = (props) => {
  const store = useStore();
  const ui = useEditorUi();
  const { field, selected } = useField(props);
  const open = (image: HTMLImageElement) => {
    store.select({ kind: "field", ...field });
    ui.openMedia(field, image);
  };
  return (
    <img
      src={props.file.src}
      alt={props.value.alt ?? ""}
      width={props.file.width}
      height={props.file.height}
      sizes={props.sizes}
      loading={props.priority === true ? "eager" : "lazy"}
      decoding="async"
      className={props.className}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role -- a button element would change the page's markup, so the image itself becomes the control
      role="button"
      tabIndex={0}
      aria-label={`Change image: ${props.value.alt === undefined || props.value.alt === "" ? props.definition.title : props.value.alt}`}
      aria-haspopup="dialog"
      data-pakshi-field={field.path.join(".")}
      data-pakshi-selected={selected || undefined}
      onClick={(event) => open(event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open(event.currentTarget);
        }
      }}
    />
  );
};

/** A button on the page. Choosing it selects it, and the settings panel edits its label and link. */
const EditableCta: FieldEditing["Cta"] = (props) => {
  const store = useStore();
  const ui = useEditorUi();
  const { field, selected } = useField(props);
  return (
    <a
      href={props.href}
      className={props.className}
      data-pakshi-field={field.path.join(".")}
      data-pakshi-selected={selected || undefined}
      onClick={(event) => {
        event.preventDefault();
        store.select({ kind: "field", ...field });
        ui.revealControl(field);
      }}
      onFocus={() => store.select({ kind: "field", ...field })}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          ui.revealControl(field);
        }
      }}
    >
      {props.value.label}
    </a>
  );
};

// Blocks --------------------------------------------------------------------

type RootProps = ComponentProps<FieldEditing["Root"]>;

/**
 * A block's root element, which carries its identity. Clicking it selects the
 * block, unless the click lands on one of its fields or on an item inside it.
 */
function RootElement({
  attach,
  ...props
}: RootProps & { readonly attach?: (element: Element | null) => void }) {
  const store = useStore();
  const target = useTarget();
  const selected = useEditorState(
    (state) => state.selection?.kind === "block" && state.selection.block === props.block,
  );
  const Tag = props.element;
  return (
    <Tag
      ref={attach}
      data-surface={props.surface}
      className={props.className}
      data-pakshi-block={props.block}
      data-pakshi-selected={selected || undefined}
      tabIndex={-1}
      onClick={(event) => {
        // Canvas nodes belong to the frame's window, so they're checked against its Element.
        const frame = event.currentTarget.ownerDocument.defaultView;
        const clicked =
          frame !== null && event.target instanceof frame.Element ? event.target : null;
        if (clicked === null || clicked.closest("[data-pakshi-block]") !== event.currentTarget)
          return;
        if (clicked.closest("[data-pakshi-field]") !== null) return;
        store.select({ kind: "block", target, block: props.block });
      }}
    >
      {props.children}
    </Tag>
  );
}

/** A block on the page, which a dragged block can be dropped beside. */
function PageBlockRoot(props: RootProps & { readonly page: PageId }) {
  const { list, accepts } = useDropPlacement(props.page, props.block);
  const { ref: attach } = useBlockDrop({
    surface: "canvas",
    list: list ?? "root",
    block: props.block,
    accepts,
  });
  return <RootElement {...props} attach={attach} />;
}

/** The header and footer belong to every page, so nothing is dropped beside them. */
const EditableRoot: FieldEditing["Root"] = (props) => {
  const target = useTarget();
  return target === "site" ? (
    <RootElement {...props} />
  ) : (
    <PageBlockRoot {...props} page={target} />
  );
};

/** A section's slot. It takes a dropped item where no item is under the pointer, such as when it's empty. */
const EditableSlot: FieldEditing["Slot"] = (props) => {
  const page = useTarget();
  const { definitions } = useServices();
  const accepts = useEditorState(
    (state) => {
      const document = page === "site" ? undefined : state.view.pages[page];
      return document === undefined
        ? []
        : allowedTypes(document, definitions, { block: props.block, slot: props.name });
    },
    (a, b) => a.join() === b.join(),
  );
  const { ref: attachDrop } = useBlockDrop({
    surface: "canvas",
    list: { block: props.block, slot: props.name },
    block: null,
    accepts,
  });
  const empty = props.children.length === 0;
  // An empty slot has no height to drop on, so its section's area takes the drop instead.
  const attach = useCallback(
    (element: HTMLElement | null) =>
      attachDrop(empty ? (element?.closest("[data-pakshi-block]") ?? element) : element),
    [attachDrop, empty],
  );
  const Element = props.as ?? "div";
  return (
    <Element ref={attach} className={props.className} data-pakshi-slot={props.name}>
      {props.children}
    </Element>
  );
};

/** The editing versions of the field components, which the canvas supplies to every block. */
export const fieldEditing: FieldEditing = {
  Root: EditableRoot,
  Text: EditableText,
  RichText: EditableRichText,
  Media: EditableMedia,
  Cta: EditableCta,
  Slot: EditableSlot,
};
