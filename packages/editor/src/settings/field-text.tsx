import { Input } from "@repo/ui/components/input";
import { Textarea } from "@repo/ui/components/textarea";
import { type ComponentProps, useLayoutEffect, useRef } from "react";

import { mapOffset } from "../text-changes.ts";

/**
 * A text input that shows a field's stored value. Like the canvas's text
 * fields, it's uncontrolled: typing changes it directly, and the value is
 * written into it only when the stored one differs from what it shows, such
 * as after someone else's change. The caret then keeps its place relative to
 * the text around it. Nothing is written while an input method composes.
 */
const useFieldText = <E extends HTMLInputElement | HTMLTextAreaElement>(value: string) => {
  const ref = useRef<E>(null);
  const composing = useRef(false);

  const show = (text: string) => {
    const element = ref.current;
    if (element === null || composing.current || element.value === text) return;
    const before = element.value;
    const focused = element.ownerDocument.activeElement === element;
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    element.value = text;
    if (focused)
      element.setSelectionRange(mapOffset(before, text, start), mapOffset(before, text, end));
  };

  // Every render, so an edit the store refused is put back too.
  useLayoutEffect(() => show(value));

  return {
    ref,
    defaultValue: value,
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: () => {
      composing.current = false;
    },
  };
};

type TextProps<C extends typeof Input | typeof Textarea> = Omit<
  ComponentProps<C>,
  "value" | "defaultValue" | "ref"
> & {
  readonly value: string;
};

/** An input showing a field's stored text. */
export function FieldInput({ value, ...props }: TextProps<typeof Input>) {
  return <Input {...props} {...useFieldText<HTMLInputElement>(value)} />;
}

/** A textarea showing a field's stored text. */
export function FieldTextarea({ value, ...props }: TextProps<typeof Textarea>) {
  return <Textarea {...props} {...useFieldText<HTMLTextAreaElement>(value)} />;
}
