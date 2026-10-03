import { Option, Schema } from "effect";

import { EmailAddress } from "./email.ts";
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
  fields: Schema.Array(FormField).check(
    Schema.isMinLength(1),
    Schema.makeFilter((fields) =>
      new Set(fields.map((field) => field.id)).size === fields.length
        ? undefined
        : "Each field needs its own ID",
    ),
  ),
  submitLabel: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40)),
});
export type FormDefinition = typeof FormDefinition.Type;

const maxLength = { shortText: 500, longText: 10_000, email: 254, phone: 40, select: 120 };

const phonePattern = /^[0-9+()\-.\s]{3,40}$/;

const decodeEmail = Schema.decodeOption(EmailAddress);

/**
 * What's wrong with one answer to a field, or null when it's fine. A
 * checkbox's answer is "Yes" when ticked and empty when not. Visitors' forms
 * check this as they type, and sites-api again when the answers arrive.
 */
export const answerProblem = (field: Exclude<FormField, { kind: "hidden" }>, value: string) => {
  if (field.kind === "checkbox")
    return field.required && value === "" ? "Tick this box to send the form" : null;
  if (value === "") return field.required ? "Answer this question" : null;
  if (value.length > maxLength[field.kind])
    return `Use at most ${maxLength[field.kind]} characters`;
  switch (field.kind) {
    case "email":
      return Option.isNone(decodeEmail(value)) ? "Enter an email address" : null;
    case "phone":
      return phonePattern.test(value) ? null : "Enter a phone number";
    case "select":
      return field.options.includes(value) ? null : "Choose one of the options";
    case "shortText":
    case "longText":
      return null;
  }
};
