import {
  type FieldAddress,
  type FieldEditing,
  richTextExtensions,
  toJsonContent,
} from "@repo/blocks";
import type { PageId } from "@repo/contracts/ids";
import { Editor } from "@tiptap/core";
import { UndoRedo } from "@tiptap/extensions";
import { Option, Schema } from "effect";
import {
  type ComponentProps,
  type KeyboardEvent,
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

/** The caret's position in an element, counted in characters of its text. */
const caretOffset = (element: HTMLElement) => {
  const selection = element.ownerDocument.getSelection();
  if (selection === null || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!element.contains(range.endContainer)) return null;
  const before = range.cloneRange();
  before.selectNodeContents(element);
  before.setEnd(range.endContainer, range.endOffset);
  return before.toString().length;
};

const placeCaret = (element: HTMLElement, offset: number) => {
  const document = element.ownerDocument;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let node = walker.nextNode();
  while (node !== null) {
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.collapse(true);
      document.getSelection()?.removeAllRanges();
      document.getSelection()?.addRange(range);
      return;
    }
    remaining -= length;
    node = walker.nextNode();
  }
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
  const composing = useRef(false);
  const definition = props.definition;
  if (definition.kind !== "text") throw new Error(`${props.path.join(".")} isn't plain text.`);
  const { max, multiline } = definition;

  useLayoutEffect(() => {
    const current = element.current;
    if (current === null || composing.current || current.textContent === props.value) return;
    const focused = current.ownerDocument.activeElement === current;
    const offset = focused ? caretOffset(current) : null;
    current.textContent = props.value;
    if (offset !== null) placeCaret(current, Math.min(offset, props.value.length));
  }, [props.value]);

  const commit = () => {
    const current = element.current;
    if (current === null || composing.current) return;
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
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
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
 * goes to TipTap's own history.
 */
const EditableRichText: FieldEditing["RichText"] = (props) => {
  const store = useStore();
  const ui = useEditorUi();
  const { field, selected } = useField(props);
  const element = useRef<HTMLDivElement>(null);
  const editor = useRef<Editor | null>(null);
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
      updated.commands.setContent(toJsonContent(props.value), { emitUpdate: false });
  });
  const onFocused = useEffectEvent((focused: Editor, mount: HTMLElement) => {
    store.select({ kind: "field", ...field });
    ui.setActiveRichText({ target: field, editor: focused, field: definition, element: mount });
  });
  const initialContent = useEffectEvent(() => toJsonContent(props.value));

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
      },
      onUpdate: ({ editor: updated }) => onChange(updated),
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

  useEffect(() => {
    const instance = editor.current;
    if (instance === null || instance.isFocused) return;
    if (JSON.stringify(instance.getJSON()) !== JSON.stringify(props.value))
      instance.commands.setContent(toJsonContent(props.value), { emitUpdate: false });
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
  const { ref: attach } = useBlockDrop({
    surface: "canvas",
    list: { block: props.block, slot: props.name },
    block: null,
    accepts,
  });
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
