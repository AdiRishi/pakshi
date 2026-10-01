import { FormDefinition, type FormField } from "@repo/contracts/form";
import { FormFieldId, FormId, type PageId, randomId } from "@repo/contracts/ids";
import { Button } from "@repo/ui/components/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { Switch } from "@repo/ui/components/switch";
import { Textarea } from "@repo/ui/components/textarea";
import { Option, Predicate, Schema, SchemaIssue, SchemaParser } from "effect";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";

import { useEditorState, useStore } from "../context.tsx";

const kinds = [
  { kind: "shortText", title: "Short answer" },
  { kind: "longText", title: "Long answer" },
  { kind: "email", title: "Email address" },
  { kind: "phone", title: "Phone number" },
  { kind: "select", title: "Choice from a list" },
  { kind: "checkbox", title: "Checkbox" },
  { kind: "hidden", title: "Hidden value" },
] as const satisfies ReadonlyArray<{ readonly kind: FormField["kind"]; readonly title: string }>;

const decodeKind = Schema.decodeUnknownOption(Schema.Literals(kinds.map(({ kind }) => kind)));

const decodeForm = SchemaParser.decodeResult(FormDefinition);

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

/** A new form with the fields most forms start from, and the consent its email address needs. */
export const newForm = (): FormDefinition => ({
  id: FormId.make(randomId("frm")),
  name: "New form",
  submitLabel: "Send",
  fields: [
    { kind: "shortText", id: FormFieldId.make(randomId("ff")), label: "Your name", required: true },
    { kind: "email", id: FormFieldId.make(randomId("ff")), label: "Email", required: true },
    {
      kind: "checkbox",
      id: FormFieldId.make(randomId("ff")),
      label: "I agree to the privacy policy",
      required: true,
    },
  ],
});

/** A field as another kind, keeping its ID, label and whether it's required. */
const withKind = (field: FormField, kind: FormField["kind"]): FormField => {
  const base = { id: field.id, label: field.label };
  const required = "required" in field ? field.required : false;
  switch (kind) {
    case "select":
      return {
        kind,
        ...base,
        required,
        options: field.kind === "select" ? field.options : ["First choice"],
      };
    case "hidden":
      return { kind, ...base, value: field.kind === "hidden" ? field.value : "" };
    case "checkbox":
    case "shortText":
    case "longText":
    case "email":
    case "phone":
      return { kind, ...base, required };
  }
};

/** A text box whose value is saved when it's left or Enter is pressed. */
function SavedText(props: {
  readonly label: string;
  readonly value: string;
  readonly max: number;
  readonly multiline?: boolean;
  readonly description?: string;
  readonly onSave: (value: string) => void;
}) {
  const id = useId();
  const [typed, setTyped] = useState(props.value);
  const save = () => typed !== props.value && props.onSave(typed);
  return (
    <Field>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      {props.multiline === true ? (
        <Textarea
          id={id}
          value={typed}
          maxLength={props.max}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={save}
        />
      ) : (
        <Input
          id={id}
          value={typed}
          maxLength={props.max}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
        />
      )}
      {props.description !== undefined && <FieldDescription>{props.description}</FieldDescription>}
    </Field>
  );
}

function FieldEditor(props: {
  readonly field: FormField;
  readonly number: number;
  readonly count: number;
  readonly pages: ReadonlyArray<{ readonly id: PageId; readonly title: string }>;
  readonly onChange: (field: FormField) => void;
  readonly onMove: (by: -1 | 1) => void;
  readonly onRemove: () => void;
}) {
  const { field, number } = props;
  const ids = { kind: useId(), link: useId() };
  return (
    <FieldSet className="rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <FieldLegend variant="label">Field {number}</FieldLegend>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Move field ${number} up`}
            disabled={number === 1}
            onClick={() => props.onMove(-1)}
          >
            <ArrowUpIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Move field ${number} down`}
            disabled={number === props.count}
            onClick={() => props.onMove(1)}
          >
            <ArrowDownIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove field ${number}`}
            disabled={props.count === 1}
            onClick={props.onRemove}
          >
            <Trash2Icon />
          </Button>
        </div>
      </div>
      <SavedText
        key={field.label}
        label="Question"
        value={field.label}
        max={120}
        onSave={(label) => props.onChange({ ...field, label })}
      />
      <Field>
        <FieldLabel htmlFor={ids.kind}>Answer</FieldLabel>
        <NativeSelect
          id={ids.kind}
          className="w-full"
          value={field.kind}
          onChange={(event) => {
            const kind = decodeKind(event.target.value);
            if (Option.isSome(kind)) props.onChange(withKind(field, kind.value));
          }}
        >
          {kinds.map(({ kind, title }) => (
            <NativeSelectOption key={kind} value={kind}>
              {title}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      {field.kind === "select" && (
        <SavedText
          key={field.options.join("\n")}
          label="Choices"
          value={field.options.join("\n")}
          max={2000}
          multiline
          description="One choice on each line."
          onSave={(typed) =>
            props.onChange({
              ...field,
              options: typed
                .split("\n")
                .map((option) => option.trim())
                .filter((option) => option !== ""),
            })
          }
        />
      )}
      {field.kind === "checkbox" && (
        <Field>
          <FieldLabel htmlFor={ids.link}>Links to</FieldLabel>
          <NativeSelect
            id={ids.link}
            className="w-full"
            value={field.link !== undefined && !Predicate.isString(field.link) ? field.link.id : ""}
            onChange={(event) => {
              const page = props.pages.find((candidate) => candidate.id === event.target.value);
              const { link: _, ...rest } = field;
              props.onChange(
                page === undefined ? rest : { ...rest, link: { $ref: "page", id: page.id } },
              );
            }}
          >
            <NativeSelectOption value="">No link</NativeSelectOption>
            {props.pages.map((page) => (
              <NativeSelectOption key={page.id} value={page.id}>
                {page.title}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldDescription>
            A form that asks for an email address or phone number needs a checkbox linking to the
            privacy policy.
          </FieldDescription>
        </Field>
      )}
      {field.kind === "hidden" ? (
        <SavedText
          key={field.value}
          label="Value"
          value={field.value}
          max={500}
          description="Sent with every entry, such as where a campaign came from."
          onSave={(value) => props.onChange({ ...field, value })}
        />
      ) : (
        <Label className="font-normal">
          <Switch
            checked={field.required}
            onCheckedChange={(required) => props.onChange({ ...field, required })}
          />
          Must be answered
        </Label>
      )}
    </FieldSet>
  );
}

/**
 * A form's name, button and fields. Each change saves the whole form to the
 * draft, once it's a form that can be saved.
 */
export function FormEditor(props: { readonly form: FormDefinition }) {
  const store = useStore();
  const { form } = props;
  const pages = useEditorState((state) =>
    Object.values(state.view.pages).map((page) => ({
      id: page.id,
      title: page.meta.title || page.path,
    })),
  );
  const [problems, setProblems] = useState<ReadonlyArray<string>>([]);
  const save = (next: FormDefinition) => {
    const decoded = decodeForm(next, { errors: "all" });
    if (decoded._tag === "Failure") {
      setProblems(formatIssues(decoded.failure).issues.map((issue) => issue.message));
      return;
    }
    setProblems(
      store.run([{ op: "setForm", form: decoded.success }]).map((error) => error.message),
    );
  };
  const fields = form.fields;
  const changeField = (index: number, field: FormField) =>
    save({ ...form, fields: fields.map((current, at) => (at === index ? field : current)) });
  return (
    <FieldSet>
      <FieldLegend variant="label">The form</FieldLegend>
      <FieldDescription>
        Every page that shows this form changes with it. Where its entries are emailed is set in the
        site's settings.
      </FieldDescription>
      <FieldGroup>
        <SavedText
          key={form.name}
          label="Form name"
          value={form.name}
          max={120}
          description="Studio lists entries under this name. Visitors don't see it."
          onSave={(name) => save({ ...form, name })}
        />
        {fields.map((field, index) => (
          <FieldEditor
            key={field.id}
            field={field}
            number={index + 1}
            count={fields.length}
            pages={pages}
            onChange={(next) => changeField(index, next)}
            onMove={(by) => {
              const moved = [...fields];
              const [taken] = moved.splice(index, 1);
              if (taken !== undefined) moved.splice(index + by, 0, taken);
              save({ ...form, fields: moved });
            }}
            onRemove={() => save({ ...form, fields: fields.filter((_, at) => at !== index) })}
          />
        ))}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            save({
              ...form,
              fields: [
                ...fields,
                {
                  kind: "shortText",
                  id: FormFieldId.make(randomId("ff")),
                  label: "New question",
                  required: false,
                },
              ],
            })
          }
        >
          <PlusIcon />
          Add a field
        </Button>
        <SavedText
          key={form.submitLabel}
          label="Button"
          value={form.submitLabel}
          max={40}
          onSave={(submitLabel) => save({ ...form, submitLabel })}
        />
        <FieldError errors={problems.map((message) => ({ message }))} />
      </FieldGroup>
    </FieldSet>
  );
}
