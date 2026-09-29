import type { Field, FieldKind } from "@repo/blocks";
import { MediaId } from "@repo/contracts/ids";
import type { BatchError, Op } from "@repo/contracts/ops";
import { ExternalUrl } from "@repo/contracts/references";
import { Button } from "@repo/ui/components/button";
import {
  Field as FieldRow,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { Textarea } from "@repo/ui/components/textarea";
import { Option, Predicate, Schema } from "effect";
import { type ComponentType, type ReactNode, useRef, useState } from "react";

import {
  burstKey,
  controlId,
  type FieldTarget,
  useEditorState,
  useEditorUi,
  useServices,
  useStore,
} from "../context.tsx";

type Json = Schema.Json;

const isRecord = (value: Json | undefined): value is { readonly [key: string]: Json } =>
  Predicate.isObject(value) && !Array.isArray(value);

/** The value stored at a prop path, stepping into lists by item ID. */
export const valueAt = (props: Readonly<Record<string, Json>>, path: ReadonlyArray<string>) => {
  let current: Json | undefined = props;
  for (const step of path) {
    if (Array.isArray(current))
      current = current.find((item: Json) => isRecord(item) && item["id"] === step);
    else current = isRecord(current) ? current[step] : undefined;
  }
  return current;
};

/** Runs ops for a control and keeps the errors that come back, to show under it. */
const useRun = () => {
  const store = useStore();
  const [errors, setErrors] = useState<ReadonlyArray<BatchError>>([]);
  const run = (ops: ReadonlyArray<Op>, burst: string | null = null) => {
    const found = store.run(ops, burst);
    setErrors(found);
    return found.length === 0;
  };
  return { run, errors: errors.map((error) => ({ message: error.message })) };
};

const setProp = (field: FieldTarget, value: Json | undefined): Op =>
  value === undefined
    ? { op: "setProp", target: field.target, block: field.block, path: field.path }
    : { op: "setProp", target: field.target, block: field.block, path: field.path, value };

interface ControlProps<F extends Field> {
  readonly field: FieldTarget;
  readonly definition: F;
  readonly value: Json | undefined;
}

type KindOf<K extends FieldKind> = Extract<Field, { readonly kind: K }>;

/** A labelled row with the field's errors, and a remove button for an optional field that's set. */
function ControlRow(props: {
  readonly field: FieldTarget;
  readonly definition: Field;
  readonly value: Json | undefined;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}) {
  const { run } = useRun();
  const incomplete =
    props.value !== undefined && !Schema.is(props.definition.complete)(props.value);
  return (
    <FieldRow data-invalid={props.errors.length > 0 || undefined}>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={controlId(props.field)}>
          {props.definition.title}
          {props.definition.optional && (
            <span className="font-normal text-muted-foreground">Optional</span>
          )}
        </FieldLabel>
        {props.definition.optional && props.value !== undefined && (
          <Button variant="ghost" size="xs" onClick={() => run([setProp(props.field, undefined)])}>
            Remove
          </Button>
        )}
      </div>
      {props.children}
      {props.description !== undefined && <FieldDescription>{props.description}</FieldDescription>}
      {incomplete && props.errors.length === 0 && (
        <FieldDescription>
          Not finished yet. It needs filling in before this draft is submitted.
        </FieldDescription>
      )}
      <FieldError errors={[...props.errors]} />
    </FieldRow>
  );
}

/** An optional field that isn't set, with a button that adds it. */
function AddField(props: { readonly title: string; readonly onAdd: () => void }) {
  return (
    <Button variant="outline" size="sm" className="self-start" onClick={props.onAdd}>
      Add {props.title.toLowerCase()}
    </Button>
  );
}

function TextControl(props: ControlProps<KindOf<"text">>) {
  const store = useStore();
  const { run, errors } = useRun();
  const text = Predicate.isString(props.value) ? props.value : undefined;
  const { definition, field } = props;
  if (text === undefined && props.definition.optional)
    return (
      <ControlRow field={field} definition={definition} value={props.value} errors={errors}>
        <AddField title={definition.title} onAdd={() => run([setProp(field, "")])} />
      </ControlRow>
    );
  const shared = {
    id: controlId(field),
    value: text ?? "",
    maxLength: definition.max,
    "aria-invalid": errors.length > 0 || undefined,
    onBlur: () => store.endBurst(),
  };
  return (
    <ControlRow
      field={field}
      definition={definition}
      value={props.value}
      errors={errors}
      description={`${(text ?? "").length} of ${definition.max} characters`}
    >
      {definition.multiline ? (
        <Textarea
          {...shared}
          onChange={(event) => run([setProp(field, event.target.value)], burstKey(field))}
        />
      ) : (
        <Input
          {...shared}
          onChange={(event) =>
            run([setProp(field, event.target.value.replace(/\n/g, " "))], burstKey(field))
          }
        />
      )}
    </ControlRow>
  );
}

function RichTextControl(props: ControlProps<KindOf<"richText">>) {
  const ui = useEditorUi();
  const { run, errors } = useRun();
  if (props.value === undefined)
    return (
      <ControlRow
        field={props.field}
        definition={props.definition}
        value={props.value}
        errors={errors}
      >
        <AddField
          title={props.definition.title}
          onAdd={() =>
            run([setProp(props.field, { type: "doc", content: [{ type: "paragraph" }] })])
          }
        />
      </ControlRow>
    );
  return (
    <ControlRow
      field={props.field}
      definition={props.definition}
      value={props.value}
      errors={errors}
      description="Formatted text is edited on the page."
    >
      <Button
        id={controlId(props.field)}
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => ui.focusInCanvas(props.field)}
      >
        Edit on the page
      </Button>
    </ControlRow>
  );
}

/** Picks a page on the site or types an external address. An address is saved once it's valid. */
function LinkControl(props: ControlProps<KindOf<"link">>) {
  const pages = useEditorState((state) => state.view.pages);
  const { run, errors } = useRun();
  const current = props.value;
  const external = Predicate.isString(current) ? current : null;
  const pageId = isRecord(current) && Predicate.isString(current["id"]) ? current["id"] : null;
  const [typed, setTyped] = useState(external ?? "https://");
  const [choosingAddress, setChoosingAddress] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  // A new saved link, such as one undo brings back, replaces an address still being typed.
  const saved = external ?? pageId;
  const [shown, setShown] = useState(saved);
  if (saved !== shown) {
    setShown(saved);
    setTyped(external ?? "https://");
    setChoosingAddress(false);
  }
  const saveTyped = () => {
    if (!Schema.is(ExternalUrl)(typed)) {
      setInvalid("Enter a full address that starts with https://, http://, mailto: or tel:");
      return;
    }
    setInvalid(null);
    if (typed !== external) run([setProp(props.field, typed)]);
  };
  const toPage = pageId !== null && !choosingAddress;
  return (
    <ControlRow
      field={props.field}
      definition={props.definition}
      value={props.value}
      errors={invalid === null ? errors : [...errors, { message: invalid }]}
    >
      <NativeSelect
        aria-label={`${props.definition.title}: where it goes`}
        value={toPage ? "page" : "external"}
        onChange={(event) => {
          const toAddress = event.target.value === "external";
          setChoosingAddress(toAddress);
          const [first] = Object.values(pages);
          if (!toAddress && pageId === null && first !== undefined)
            run([setProp(props.field, { $ref: "page", id: first.id })]);
        }}
        className="w-full"
      >
        <NativeSelectOption value="page">A page on this site</NativeSelectOption>
        <NativeSelectOption value="external">An external address</NativeSelectOption>
      </NativeSelect>
      {toPage ? (
        <NativeSelect
          id={controlId(props.field)}
          value={pageId}
          onChange={(event) =>
            run([setProp(props.field, { $ref: "page", id: event.target.value })])
          }
          className="w-full"
        >
          {Object.values(pages).map((page) => (
            <NativeSelectOption key={page.id} value={page.id}>
              {page.meta.title || "Untitled"} ({page.path})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      ) : (
        <Input
          id={controlId(props.field)}
          value={typed}
          type="url"
          spellCheck={false}
          aria-invalid={invalid !== null || undefined}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={saveTyped}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveTyped();
          }}
        />
      )}
    </ControlRow>
  );
}

function FormControl(props: ControlProps<KindOf<"form">>) {
  const forms = useEditorState((state) => state.view.forms);
  const { run, errors } = useRun();
  const current =
    isRecord(props.value) && Predicate.isString(props.value["id"]) ? props.value["id"] : "";
  return (
    <ControlRow
      field={props.field}
      definition={props.definition}
      value={props.value}
      errors={errors}
    >
      <NativeSelect
        id={controlId(props.field)}
        value={current}
        onChange={(event) => run([setProp(props.field, { $ref: "form", id: event.target.value })])}
        className="w-full"
      >
        {Object.values(forms).map((form) => (
          <NativeSelectOption key={form.id} value={form.id}>
            {form.name}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </ControlRow>
  );
}

function MediaControl(props: ControlProps<KindOf<"media">>) {
  const ui = useEditorUi();
  const { mediaSrc } = useServices();
  const { errors } = useRun();
  const change = useRef<HTMLButtonElement>(null);
  const id = isRecord(props.value)
    ? Option.getOrNull(Schema.decodeUnknownOption(MediaId)(props.value["id"]))
    : null;
  const alt = isRecord(props.value) ? props.value["alt"] : undefined;
  return (
    <ControlRow
      field={props.field}
      definition={props.definition}
      value={props.value}
      errors={errors}
    >
      <div className="flex items-center gap-3">
        {id !== null && (
          // The alt text control below describes the image, so the thumbnail itself is decorative.
          <img src={mediaSrc(id)} alt="" className="size-16 rounded-md border object-cover" />
        )}
        <Button
          id={controlId(props.field)}
          ref={change}
          variant="outline"
          size="sm"
          onClick={() => {
            if (change.current !== null) ui.openMedia(props.field, change.current);
          }}
        >
          {id === null ? "Choose an image" : "Change image"}
        </Button>
      </div>
      {id !== null && (
        <TextControl
          field={{ ...props.field, path: [...props.field.path, "alt"] }}
          definition={props.definition.parts.alt}
          value={Predicate.isString(alt) ? alt : ""}
        />
      )}
    </ControlRow>
  );
}

function CtaControl(props: ControlProps<KindOf<"cta">>) {
  const { run, errors } = useRun();
  const page = useEditorState((state) => state.page);
  if (props.value === undefined)
    return (
      <ControlRow
        field={props.field}
        definition={props.definition}
        value={props.value}
        errors={errors}
      >
        <AddField
          title={props.definition.title}
          onAdd={() => run([setProp(props.field, { label: "", link: { $ref: "page", id: page } })])}
        />
      </ControlRow>
    );
  const part = (name: "label" | "link") => ({
    field: { ...props.field, path: [...props.field.path, name] },
    value: isRecord(props.value) ? props.value[name] : undefined,
  });
  return (
    <FieldSet id={controlId(props.field)}>
      <div className="flex items-center justify-between gap-2">
        <FieldLegend variant="label">{props.definition.title}</FieldLegend>
        {props.definition.optional && (
          <Button variant="ghost" size="xs" onClick={() => run([setProp(props.field, undefined)])}>
            Remove
          </Button>
        )}
      </div>
      <TextControl {...part("label")} definition={props.definition.parts.label} />
      <LinkControl
        // A link changed elsewhere, such as by undo, starts the control afresh.
        key={JSON.stringify(part("link").value)}
        {...part("link")}
        definition={props.definition.parts.link}
      />
    </FieldSet>
  );
}

function ListControl(props: ControlProps<KindOf<"list">>) {
  const items = Array.isArray(props.value) ? props.value.filter(isRecord) : [];
  return (
    <FieldSet>
      <FieldLegend variant="label">{props.definition.title}</FieldLegend>
      {items.map((item, index) => {
        const id = Predicate.isString(item["id"]) ? item["id"] : String(index);
        return (
          <FieldSet key={id} className="rounded-md border p-4">
            <FieldLegend variant="label">
              {props.definition.title} {index + 1}
            </FieldLegend>
            {Object.entries(props.definition.item).map(([name, definition]) => (
              <FieldControl
                key={name}
                field={{ ...props.field, path: [...props.field.path, id, name] }}
                definition={definition}
                value={item[name]}
              />
            ))}
          </FieldSet>
        );
      })}
    </FieldSet>
  );
}

/**
 * The settings control for every field kind. Adding a field builder to
 * @repo/blocks without a control here fails typecheck.
 */
const controls = {
  text: TextControl,
  richText: RichTextControl,
  link: LinkControl,
  form: FormControl,
  media: MediaControl,
  cta: CtaControl,
  list: ListControl,
} satisfies { readonly [K in FieldKind]: ComponentType<ControlProps<KindOf<K>>> };

/** A field's control, chosen by its kind. Each reads the draft and emits setProp; none keeps its own copy. */
export function FieldControl(props: ControlProps<Field>) {
  // SAFETY: `controls` pairs each kind with the control for fields of that kind,
  // and this looks it up by the definition's own kind.
  const Control = controls[props.definition.kind] as ComponentType<ControlProps<Field>>;
  // A link changed elsewhere, such as by undo, starts its control afresh.
  const key = props.definition.kind === "link" ? JSON.stringify(props.value) : undefined;
  return <Control key={key} {...props} />;
}
