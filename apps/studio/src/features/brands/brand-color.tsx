import { HexColor } from "@repo/tokens";
import { Field, FieldError, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Schema } from "effect";
import { useId, useState } from "react";

const isHexColor = Schema.is(HexColor);

/** A brand's color, as a picker and as text, which only takes a whole color. */
export function BrandColor(props: {
  /** What the color is, such as "Brand color". */
  readonly label?: string;
  readonly value: HexColor;
  readonly disabled: boolean;
  readonly onChange: (value: HexColor) => void;
  /** What's wrong with the color, when something is. */
  readonly error?: string | undefined;
}) {
  const id = useId();
  const [text, setText] = useState(props.value);
  const [shown, setShown] = useState(props.value);
  // A color set from outside, such as by discarding changes, replaces what was typed.
  if (props.value !== shown) {
    setShown(props.value);
    setText(props.value);
  }
  const invalid = props.error !== undefined || undefined;
  const label = props.label ?? "Brand color";
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex gap-2">
        <input
          type="color"
          aria-label={`Pick the ${label.toLowerCase()}`}
          value={props.value}
          disabled={props.disabled}
          className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-background p-1"
          onChange={(event) => {
            const value = event.target.value.toLowerCase();
            setText(value);
            if (isHexColor(value)) props.onChange(value);
          }}
        />
        <Input
          id={id}
          value={text}
          disabled={props.disabled}
          spellCheck={false}
          aria-invalid={invalid}
          onChange={(event) => {
            const value = event.target.value.trim().toLowerCase();
            setText(value);
            if (isHexColor(value)) props.onChange(value);
          }}
        />
      </div>
      {props.error !== undefined && <FieldError>{props.error}</FieldError>}
    </Field>
  );
}
