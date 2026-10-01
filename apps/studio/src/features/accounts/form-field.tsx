import { Field, FieldDescription, FieldLabel } from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { type ComponentProps, useId } from "react";

/** A labelled input in a signed-out form, which the browser checks before posting. */
export function FormField(
  props: { readonly label: string; readonly description?: string } & Omit<
    ComponentProps<typeof Input>,
    "id"
  >,
) {
  const { label, description, ...input } = props;
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} required {...input} />
      {description && <FieldDescription>{description}</FieldDescription>}
    </Field>
  );
}
