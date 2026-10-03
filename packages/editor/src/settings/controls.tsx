import {
  type Field,
  type FieldKind,
  IconName,
  icons,
  placeholderCollection,
  placeholderForm,
} from "@repo/blocks";
import { collectionKinds } from "@repo/contracts/collections";
import type { BatchError, Op } from "@repo/contracts/ops";
import { pageName } from "@repo/contracts/page";
import { ExternalUrl } from "@repo/contracts/references";
import { listingsOf } from "@repo/contracts/snapshot";
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
import { Popover, PopoverContent, PopoverTrigger } from "@repo/ui/components/popover";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { Predicate, Schema } from "effect";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, XIcon } from "lucide-react";
import { type ComponentType, type ReactNode, useRef, useState } from "react";

import { useDraftSiteData } from "../canvas/page-view.tsx";
import {
  burstKey,
  controlId,
  type FieldTarget,
  useEditorState,
  useEditorUi,
  useServices,
  useStore,
} from "../context.tsx";
import { neededParts } from "../layouts.ts";
import { addListItem, listRoom, moveListItem, removeListItem } from "../lists.ts";
import { addItemLabel, fewestLabel, fullLabel, itemLabel, listNaming } from "../naming.ts";
import { FieldPresence } from "../participants.tsx";
import { AltTextSuggestion } from "./alt-text-suggestion.tsx";
import { FieldInput, FieldTextarea } from "./field-text.tsx";
import { FormEditor, newForm } from "./form-editor.tsx";

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

/** A field's value, as its draft schema describes it. */
type ValueOf<F extends Field> = F["draft"]["Type"];

interface ControlProps<F extends Field> {
  readonly field: FieldTarget;
  readonly definition: F;
  readonly value: ValueOf<F> | undefined;
}

type KindOf<K extends FieldKind> = Extract<Field, { readonly kind: K }>;

/** Whether a field is a part the block's chosen layout needs, so it can't be removed. */
const useNeeded = (field: FieldTarget) => {
  const { definitions } = useServices();
  return useEditorState((state) => {
    const instance = (field.target === "site" ? state.view.parts : state.view.pages[field.target])
      ?.blocks[field.block];
    const contract = instance === undefined ? undefined : definitions.get(instance.type);
    const [name] = field.path;
    return (
      field.path.length === 1 &&
      name !== undefined &&
      instance !== undefined &&
      contract !== undefined &&
      neededParts(contract, instance.variant).has(name)
    );
  });
};

/** A labelled row with the field's errors, and a remove button for an optional field that's set. */
function ControlRow<F extends Field>(props: {
  readonly field: FieldTarget;
  readonly definition: F;
  readonly value: ValueOf<F> | undefined;
  readonly errors: ReadonlyArray<{ readonly message: string }>;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}) {
  const store = useStore();
  const { run } = useRun();
  const needed = useNeeded(props.field);
  const incomplete =
    props.value !== undefined && !Schema.is(props.definition.complete)(props.value);
  return (
    // Working in any of the field's controls puts the person on that field, so others see where they are.
    <FieldRow
      data-invalid={props.errors.length > 0 || undefined}
      onFocus={() => store.select({ kind: "field", ...props.field })}
    >
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={controlId(props.field)}>
          {props.definition.title}
          {props.definition.optional && (
            <span className="font-normal text-muted-foreground">Optional</span>
          )}
        </FieldLabel>
        <FieldPresence field={props.field} />
        {props.definition.optional && props.value !== undefined && !needed && (
          <Button variant="ghost" size="xs" onClick={() => run([setProp(props.field, undefined)])}>
            Remove
          </Button>
        )}
      </div>
      {props.children}
      {needed && <FieldDescription>The chosen layout needs it.</FieldDescription>}
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
  const { definition, field, value: text } = props;
  if (text === undefined && props.definition.optional)
    return (
      <ControlRow field={field} definition={definition} value={text} errors={errors}>
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
      value={text}
      errors={errors}
      description={`${(text ?? "").length} of ${definition.max} characters`}
    >
      {definition.multiline ? (
        <FieldTextarea
          {...shared}
          onValue={(typed) => run([setProp(field, typed)], burstKey(field))}
        />
      ) : (
        <FieldInput
          {...shared}
          onValue={(typed) => run([setProp(field, typed.replace(/\n/g, " "))], burstKey(field))}
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
  // A link changed elsewhere, such as by undo, starts the control afresh.
  return <LinkChooser key={JSON.stringify(props.value)} {...props} />;
}

function LinkChooser(props: ControlProps<KindOf<"link">>) {
  const pages = useEditorState((state) => state.view.pages);
  const { run, errors } = useRun();
  const current = props.value;
  const external = Predicate.isString(current) ? current : null;
  const pageId = current === undefined || Predicate.isString(current) ? null : current.id;
  const [typed, setTyped] = useState(external ?? "https://");
  const [choosingAddress, setChoosingAddress] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
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
          {listingsOf(pages).map((page) => (
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

/** The value the form picker gives the choice of starting a new form. */
const startNewForm = "new";

function FormControl(props: ControlProps<KindOf<"form">>) {
  const forms = useEditorState((state) => state.view.forms);
  const { run, errors } = useRun();
  const current = props.value?.id ?? "";
  const chosen = Object.values(forms).find((form) => form.id === current);
  return (
    <ControlRow
      field={props.field}
      definition={props.definition}
      value={props.value}
      errors={errors}
      description={
        chosen === undefined ? "Start a new form, or choose one the site already has." : undefined
      }
    >
      <NativeSelect
        id={controlId(props.field)}
        value={current}
        onChange={(event) => {
          if (event.target.value !== startNewForm) {
            run([setProp(props.field, { $ref: "form", id: event.target.value })]);
            return;
          }
          const form = newForm();
          run([{ op: "setForm", form }, setProp(props.field, { $ref: "form", id: form.id })]);
        }}
        className="w-full"
      >
        {current === placeholderForm.id && (
          <NativeSelectOption value={placeholderForm.id}>
            {placeholderForm.name} (placeholder)
          </NativeSelectOption>
        )}
        {Object.values(forms).map((form) => (
          <NativeSelectOption key={form.id} value={form.id}>
            {form.name}
          </NativeSelectOption>
        ))}
        <NativeSelectOption value={startNewForm}>Start a new form</NativeSelectOption>
      </NativeSelect>
      {chosen !== undefined && <FormEditor form={chosen} />}
    </ControlRow>
  );
}

function MediaControl(props: ControlProps<KindOf<"media">>) {
  const ui = useEditorUi();
  const site = useDraftSiteData();
  const { errors } = useRun();
  const change = useRef<HTMLButtonElement>(null);
  const id = props.value?.id ?? null;
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
          <img
            src={site.media(id)?.src}
            alt=""
            className="size-16 rounded-md border object-cover"
          />
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
        <>
          <TextControl
            field={{ ...props.field, path: [...props.field.path, "alt"] }}
            definition={props.definition.parts.alt}
            value={props.value?.alt ?? ""}
          />
          <AltTextSuggestion field={props.field} media={id} />
        </>
      )}
    </ControlRow>
  );
}

function CtaControl(props: ControlProps<KindOf<"cta">>) {
  const { run, errors } = useRun();
  const needed = useNeeded(props.field);
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
  const partField = (name: "label" | "link") => ({
    ...props.field,
    path: [...props.field.path, name],
  });
  return (
    <FieldSet id={controlId(props.field)}>
      <div className="flex items-center justify-between gap-2">
        <FieldLegend variant="label">{props.definition.title}</FieldLegend>
        {props.definition.optional && !needed && (
          <Button variant="ghost" size="xs" onClick={() => run([setProp(props.field, undefined)])}>
            Remove
          </Button>
        )}
      </div>
      <TextControl
        field={partField("label")}
        definition={props.definition.parts.label}
        value={props.value.label}
      />
      <LinkControl
        field={partField("link")}
        definition={props.definition.parts.link}
        value={props.value.link}
      />
    </FieldSet>
  );
}

/** Chooses which of the site's collections of the field's kind a block shows, such as a blog's posts. */
function CollectionControl(props: ControlProps<KindOf<"collection">>) {
  const pages = useEditorState((state) => state.view.pages);
  const { run, errors } = useRun();
  const { definition, field } = props;
  const names = collectionKinds[definition.collectionKind].names;
  const kind = names.kind.toLowerCase();
  const collections = Object.values(pages)
    .filter((page) => page.type === "collection" && page.kind === definition.collectionKind)
    .toSorted((a, b) => pageName(a).localeCompare(pageName(b)));
  const current = props.value?.id ?? "";
  const sample = current === placeholderCollection;
  const gone = !sample && !collections.some((collection) => collection.id === current);
  return (
    <ControlRow
      field={field}
      definition={definition}
      value={props.value}
      errors={errors}
      description={
        collections.length === 0
          ? `This site has no ${kind} yet. Add one in Pages and menus.`
          : sample
            ? `It shows sample ${names.many} until you choose a ${kind}.`
            : undefined
      }
    >
      <NativeSelect
        id={controlId(field)}
        value={current}
        onChange={(event) => run([setProp(field, { $ref: "page", id: event.target.value })])}
        className="w-full"
      >
        {sample && (
          <NativeSelectOption value={placeholderCollection}>Sample {names.many}</NativeSelectOption>
        )}
        {gone && (
          <NativeSelectOption value={current}>A {kind} that's been deleted</NativeSelectOption>
        )}
        {collections.map((collection) => (
          <NativeSelectOption key={collection.id} value={collection.id}>
            {pageName(collection)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </ControlRow>
  );
}

/** A whole number, saved as it's typed whenever it's within the field's limits. */
function NumberControl(props: ControlProps<KindOf<"number">>) {
  const store = useStore();
  const { run, errors } = useRun();
  const { definition, field } = props;
  // What's typed while it's being typed, which may not be a number yet; the saved value otherwise.
  const [typed, setTyped] = useState<string | null>(null);
  if (props.value === undefined)
    return (
      <ControlRow field={field} definition={definition} value={props.value} errors={errors}>
        <AddField title={definition.title} onAdd={() => run([setProp(field, definition.min)])} />
      </ControlRow>
    );
  return (
    <ControlRow
      field={field}
      definition={definition}
      value={props.value}
      errors={errors}
      description={`From ${definition.min} to ${definition.max}`}
    >
      <Input
        id={controlId(field)}
        type="number"
        inputMode="numeric"
        min={definition.min}
        max={definition.max}
        step={1}
        className="w-24"
        value={typed ?? String(props.value)}
        onChange={(event) => {
          const text = event.target.value;
          setTyped(text);
          const number = Number(text);
          if (text.trim() !== "" && Schema.is(definition.draft)(number))
            run([setProp(field, number)], burstKey(field));
        }}
        onBlur={() => {
          setTyped(null);
          store.endBurst();
        }}
      />
    </ControlRow>
  );
}

/** What a choice's option is called. */
const optionLabel = (definition: KindOf<"choice">, option: string) =>
  definition.labels[option] ?? option;

/** One of a choice's options: side by side when there are a few, from a list when there are more. */
function ChoiceControl(props: ControlProps<KindOf<"choice">>) {
  const { run, errors } = useRun();
  const { definition, field } = props;
  const current = props.value ?? definition.options[0];
  const choose = (option: string) => {
    if (option !== current && definition.options.includes(option)) run([setProp(field, option)]);
  };
  return (
    <ControlRow field={field} definition={definition} value={props.value} errors={errors}>
      {definition.options.length <= 3 ? (
        <ToggleGroup
          id={controlId(field)}
          aria-label={definition.title}
          variant="outline"
          size="sm"
          spacing={0}
          className="w-full"
          value={[current]}
          onValueChange={(values) => {
            const [chosen] = values;
            if (chosen !== undefined) choose(chosen);
          }}
        >
          {definition.options.map((option) => (
            <ToggleGroupItem key={option} value={option} className="flex-1">
              {optionLabel(definition, option)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      ) : (
        <NativeSelect
          id={controlId(field)}
          value={current}
          onChange={(event) => choose(event.target.value)}
          className="w-full"
        >
          {definition.options.map((option) => (
            <NativeSelectOption key={option} value={option}>
              {optionLabel(definition, option)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </ControlRow>
  );
}

/** An icon's name in words, such as "Map pin". */
const iconTitle = (name: string) => {
  const words = name.replaceAll("-", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** An icon, picked from the library's set by looking or by searching its name. */
function IconControl(props: ControlProps<KindOf<"icon">>) {
  const { run, errors } = useRun();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const { definition, field, value } = props;
  if (value === undefined && definition.optional)
    return (
      <ControlRow field={field} definition={definition} value={value} errors={errors}>
        <AddField title={definition.title} onAdd={() => run([setProp(field, "sparkles")])} />
      </ControlRow>
    );
  const Current = value === undefined ? null : icons[value];
  const found = IconName.literals.filter((name) => name.includes(search.trim().toLowerCase()));
  return (
    <ControlRow field={field} definition={definition} value={value} errors={errors}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button id={controlId(field)} variant="outline" size="sm" className="self-start">
              {Current !== null && <Current aria-hidden />}
              {value === undefined ? "Choose an icon" : iconTitle(value)}
            </Button>
          }
        />
        <PopoverContent align="start" className="w-80 gap-3">
          <Input
            aria-label="Search icons"
            placeholder="Search icons"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="grid max-h-64 grid-cols-7 gap-1 overflow-y-auto">
            {found.map((name) => {
              const Icon = icons[name];
              return (
                <Button
                  key={name}
                  variant={name === value ? "secondary" : "ghost"}
                  size="icon-sm"
                  aria-label={iconTitle(name)}
                  aria-pressed={name === value}
                  title={iconTitle(name)}
                  onClick={() => {
                    run([setProp(field, name)]);
                    setOpen(false);
                  }}
                >
                  <Icon aria-hidden />
                </Button>
              );
            })}
          </div>
          {found.length === 0 && <FieldDescription>No icon has a name like that.</FieldDescription>}
        </PopoverContent>
      </Popover>
    </ControlRow>
  );
}

/** A list's items, each with its own fields, which can be moved, removed and added to within the list's limits. */
function ListControl(props: ControlProps<KindOf<"list">>) {
  const ui = useEditorUi();
  const { definitions, examples } = useServices();
  const { run, errors } = useRun();
  const { field, definition } = props;
  const instance = useEditorState(
    (state) =>
      (field.target === "site" ? state.view.parts : state.view.pages[field.target])?.blocks[
        field.block
      ],
  );
  const contract = instance === undefined ? undefined : definitions.get(instance.type);
  const [list] = field.path;
  if (instance === undefined || contract === undefined || list === undefined) return null;
  const items = props.value ?? [];
  const naming = listNaming(contract, list);
  const room = listRoom(definition, items.length);
  const change = { target: field.target, block: field.block, props: instance.props, list };
  const step = (op: Op | undefined, message: string) => {
    if (op !== undefined && run([op])) ui.announce(message);
  };
  return (
    <FieldSet>
      <FieldLegend variant="label">{definition.title}</FieldLegend>
      {items.map((item, index) => {
        const { id } = item;
        const label = itemLabel(naming, index);
        return (
          <FieldSet key={id} className="rounded-md border p-4">
            <div className="flex items-center justify-between gap-2">
              <FieldLegend variant="label">{label}</FieldLegend>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${label} earlier`}
                  disabled={index === 0}
                  onClick={() =>
                    step(moveListItem({ ...change, id, by: -1 }), `Moved ${label} earlier.`)
                  }
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Move ${label} later`}
                  disabled={index === items.length - 1}
                  onClick={() =>
                    step(moveListItem({ ...change, id, by: 1 }), `Moved ${label} later.`)
                  }
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${label}`}
                  disabled={!room.canRemove}
                  onClick={() =>
                    step(removeListItem({ ...change, field: definition, id }), `Removed ${label}.`)
                  }
                >
                  <XIcon />
                </Button>
              </div>
            </div>
            {Object.entries(definition.item).map(([name, itemField]) => (
              <FieldControl
                key={name}
                field={{ ...field, path: [...field.path, id, name] }}
                definition={itemField}
                value={item[name]}
              />
            ))}
          </FieldSet>
        );
      })}
      {room.canAdd ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => {
            const added = addListItem({ ...change, contract, source: examples });
            if (added !== undefined && run([added.op]))
              ui.announce(`Added ${itemLabel(naming, items.length)}.`);
          }}
        >
          <PlusIcon />
          {addItemLabel(naming)}
        </Button>
      ) : (
        <FieldDescription>{fullLabel(naming, definition.max)}</FieldDescription>
      )}
      {!room.canRemove && items.length > 0 && (
        <FieldDescription>{fewestLabel(definition.min)}.</FieldDescription>
      )}
      <FieldError errors={[...errors]} />
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
  collection: CollectionControl,
  number: NumberControl,
  choice: ChoiceControl,
  icon: IconControl,
} satisfies { readonly [K in FieldKind]: ComponentType<ControlProps<KindOf<K>>> };

/** A field's control, chosen by its kind. Each reads the draft and emits setProp; none keeps its own copy. */
export function FieldControl(props: {
  readonly field: FieldTarget;
  readonly definition: Field;
  readonly value: Json | undefined;
}) {
  // SAFETY: `controls` pairs each kind with the control for fields of that kind,
  // and this looks it up by the definition's own kind.
  const Control = controls[props.definition.kind] as ComponentType<ControlProps<Field>>;
  // Every op is checked against the field's draft schema, so a stored value always decodes.
  const value =
    props.value === undefined ? undefined : Schema.decodeSync(props.definition.draft)(props.value);
  return <Control field={props.field} definition={props.definition} value={value} />;
}
