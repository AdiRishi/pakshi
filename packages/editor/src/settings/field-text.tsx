import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { type ComponentProps, useLayoutEffect, useRef } from "react";

import { mapOffset, rebaseText } from "../text-changes.ts";

/**
 * A text input that shows a field's stored value and reports the person's
 * edits through `onValue`. Like the canvas's text fields, it's uncontrolled:
 * typing changes it directly, and the value is written into it only when the
 * stored one differs from what it shows, such as after someone else's change.
 * The caret then keeps its place relative to the text around it.
 *
 * While an input method composes, nothing is written into the input and
 * nothing is reported. When it ends, a change that arrived meanwhile is made
 * again around what was composed, and the result is reported once.
 */
const useFieldText = <E extends HTMLInputElement | HTMLTextAreaElement>(
  value: string,
  onValue: (value: string) => void,
) => {
  const ref = useRef<E>(null);
  const stored = useRef(value);
  /** The input's text when an input method started composing, or null when none is. */
  const composingFrom = useRef<string | null>(null);

  const show = (text: string) => {
    const element = ref.current;
    if (element === null || composingFrom.current !== null || element.value === text) return;
    const before = element.value;
    const focused = element.ownerDocument.activeElement === element;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    element.value = text;
    if (focused)
      element.setSelectionRange(mapOffset(before, text, start), mapOffset(before, text, end));
  };

  // Every render, so an edit the store refused is put back too.
  useLayoutEffect(() => {
    stored.current = value;
    show(value);
  });

  return {
    ref,
    defaultValue: value,
    onChange: (event: { readonly currentTarget: E }) => {
      if (composingFrom.current === null) onValue(event.currentTarget.value);
    },
    onCompositionStart: (event: { readonly currentTarget: E }) => {
      composingFrom.current = event.currentTarget.value;
    },
    onCompositionEnd: (event: { readonly currentTarget: E }) => {
      const base = composingFrom.current;
      composingFrom.current = null;
      if (base !== null && stored.current !== base)
        show(rebaseText(base, event.currentTarget.value, stored.current));
      onValue(event.currentTarget.value);
    },
  };
};

type TextProps<C extends typeof Input | typeof Textarea> = Omit<
  ComponentProps<C>,
  "value" | "defaultValue" | "ref" | "onChange" | "onCompositionStart" | "onCompositionEnd"
> & {
  readonly value: string;
  /** The person's edit, as the whole new text. */
  readonly onValue: (value: string) => void;
};

/** An input showing a field's stored text. */
export function FieldInput({ value, onValue, ...props }: TextProps<typeof Input>) {
  return <Input {...props} {...useFieldText<HTMLInputElement>(value, onValue)} />;
}

/** A textarea showing a field's stored text. */
export function FieldTextarea({ value, onValue, ...props }: TextProps<typeof Textarea>) {
  return <Textarea {...props} {...useFieldText<HTMLTextAreaElement>(value, onValue)} />;
}
