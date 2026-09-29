import { Schema } from "effect";

import { FormFieldId, FormId } from "./ids.ts";
import { Link } from "./references.ts";

const Label = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120));

const inputField = <Kind extends string>(kind: Kind) =>
  Schema.Struct({
    kind: Schema.Literal(kind),
    id: FormFieldId,
    label: Label,
    required: Schema.Boolean,
  });

/** One field a visitor fills in. Submissions are keyed by field ID and keep the label they were sent with. */
export const FormField = Schema.Union([
  inputField("shortText"),
  inputField("longText"),
  inputField("email"),
  inputField("phone"),
  Schema.Struct({
    ...inputField("select").fields,
    options: Schema.Array(Label).check(Schema.isMinLength(1)),
  }),
  /** A consent checkbox, with a link to the privacy policy it refers to. */
  Schema.Struct({ ...inputField("checkbox").fields, link: Schema.optionalKey(Link) }),
  /** A value sent with every submission, such as a tracking code. */
  Schema.Struct({
    kind: Schema.Literal("hidden"),
    id: FormFieldId,
    label: Label,
    value: Schema.String.check(Schema.isMaxLength(500)),
  }),
]);
export type FormField = typeof FormField.Type;

/**
 * A form, defined in a draft and shipped in its snapshot. Where notifications
 * go is a site setting, not part of the form.
 */
export const FormDefinition = Schema.Struct({
  id: FormId,
  name: Label,
  fields: Schema.Array(FormField).check(Schema.isMinLength(1)),
  submitLabel: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40)),
});
export type FormDefinition = typeof FormDefinition.Type;
