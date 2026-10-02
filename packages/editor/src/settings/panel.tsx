import { fieldAt, placeholderPaths } from "@repo/blocks";
import { collectionKinds } from "@repo/contracts/collections";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId } from "@repo/contracts/ids";
import type { BatchError, MetaField, Op, Target } from "@repo/contracts/ops";
import { type PageDocument, PagePath, type PostMeta, Slug } from "@repo/contracts/page";
import { WebUrl } from "@repo/contracts/references";
import { addressOf, entryAddress } from "@repo/contracts/snapshot";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldLegend,
} from "@repo/ui/components/field";
import { Input } from "@repo/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@repo/ui/components/input-group";
import { Label } from "@repo/ui/components/label";
import { Switch } from "@repo/ui/components/switch";
import { Option, Schema } from "effect";
import { CircleAlertIcon, EllipsisIcon } from "lucide-react";
import { useId, useState } from "react";

import { BlockMenu } from "../block-menu.tsx";
import { useEditorState, useServices, useStore } from "../context.tsx";
import { LibraryPicker } from "../library-picker.tsx";
import { blockLabel } from "../structure.ts";
import { Appearance } from "./appearance.tsx";
import { FieldControl } from "./controls.tsx";
import { FieldInput, FieldTextarea } from "./field-text.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

function Section(props: { readonly title: string; readonly children: React.ReactNode }) {
  return (
    <FieldSet className="border-t px-5 py-5">
      <FieldLegend>{props.title}</FieldLegend>
      <FieldGroup>{props.children}</FieldGroup>
    </FieldSet>
  );
}

function BlockSettings(props: { readonly target: Target; readonly block: BlockId }) {
  const store = useStore();
  const { definitions } = useServices();
  const instance = useEditorState(
    (state) => holderOf(state.view, props.target)?.blocks[props.block],
  );
  const [menuOpen, setMenuOpen] = useState(false);
  if (instance === undefined) return null;
  const contract = definitions.get(instance.type);
  if (contract === undefined) return null;
  const label = blockLabel(definitions, instance);
  const placeholders = placeholderPaths(definitions, instance);
  // Choices set how the block looks, so they sit with its layout rather than its content.
  const fields = Object.entries(contract.fields);
  const content = fields.filter(([, definition]) => definition.kind !== "choice");
  const choices = fields.filter(
    ([, definition]) =>
      definition.kind === "choice" &&
      (definition.layouts === null || definition.layouts.includes(instance.variant)),
  );
  const placeholderTitles = [
    ...new Set(placeholders.map((path) => fieldAt(contract.fields, path)?.title ?? path.join(" "))),
  ];
  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs text-muted-foreground">
            {contract.placement === "item"
              ? "Selected item"
              : contract.placement === "section"
                ? "Selected section"
                : `On every page`}
          </span>
          <h2 className="text-lg font-semibold">{contract.title}</h2>
        </div>
        <div className="flex items-center gap-1">
          {props.target !== "site" && (
            <BlockMenu
              page={props.target}
              block={props.block}
              origin="elsewhere"
              open={menuOpen}
              onOpenChange={setMenuOpen}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}>
                  <EllipsisIcon />
                </Button>
              }
            />
          )}
          <Button variant="ghost" size="sm" onClick={() => store.select(null)}>
            Page settings
          </Button>
        </div>
      </div>
      {placeholderTitles.length > 0 && (
        <Alert className="mx-5 mb-4 w-auto">
          <CircleAlertIcon />
          <AlertTitle>This block still has placeholder content</AlertTitle>
          <AlertDescription>
            You can keep working, but replace it before you submit: {placeholderTitles.join(", ")}.
          </AlertDescription>
        </Alert>
      )}
      <Section title="Content">
        {content.map(([name, definition]) => (
          <FieldControl
            key={name}
            field={{ target: props.target, block: props.block, path: [name] }}
            definition={definition}
            value={instance.props[name]}
          />
        ))}
      </Section>
      {(contract.variants.length > 1 ||
        choices.length > 0 ||
        (contract.placement !== "item" && contract.surfaces.length > 1)) && (
        <Section title="Layout and style">
          <Appearance
            target={props.target}
            block={props.block}
            instance={instance}
            contract={contract}
          />
          {choices.map(([name, definition]) => (
            <FieldControl
              key={name}
              field={{ target: props.target, block: props.block, path: [name] }}
              definition={definition}
              value={instance.props[name]}
            />
          ))}
        </Section>
      )}
    </>
  );
}

/** A meta field of the page, saved as it's typed. */
function MetaText(props: {
  readonly field: MetaField;
  readonly label: string;
  readonly value: string;
  readonly max: number;
  readonly multiline?: boolean;
  readonly description: string;
}) {
  const store = useStore();
  const page = useEditorState((state) => state.page);
  const id = useId();
  const [errors, setErrors] = useState<ReadonlyArray<BatchError>>([]);
  const change = (value: string) =>
    setErrors(
      store.run(
        [{ op: "setMeta", page, field: props.field, value }],
        `meta:${page}:${props.field}`,
      ),
    );
  const shared = {
    id,
    value: props.value,
    maxLength: props.max,
    onBlur: () => store.endBurst(),
    "aria-invalid": errors.length > 0 || undefined,
  };
  return (
    <Field data-invalid={errors.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>{props.label}</FieldLabel>
      {props.multiline === true ? (
        <FieldTextarea {...shared} onValue={change} />
      ) : (
        <FieldInput {...shared} onValue={change} />
      )}
      <FieldDescription>
        {props.description} {props.value.length} of {props.max} characters.
      </FieldDescription>
      <FieldError errors={errors.map((error) => ({ message: error.message }))} />
    </Field>
  );
}

/** Sets a meta field of the page being edited, keeping the errors that come back. */
const useSetMeta = (field: MetaField) => {
  const store = useStore();
  const page = useEditorState((state) => state.page);
  const [errors, setErrors] = useState<ReadonlyArray<{ readonly message: string }>>([]);
  const set = (value: Schema.Json | undefined, burst: string | null = null) => {
    const found = store.run(
      [
        value === undefined
          ? { op: "setMeta", page, field }
          : { op: "setMeta", page, field, value },
      ],
      burst,
    );
    setErrors(found.map((error) => ({ message: error.message })));
  };
  return { set, errors, burst: `meta:${page}:${field}`, endBurst: () => store.endBurst() };
};

function PostDate(props: { readonly value: string }) {
  const id = useId();
  const { set, errors } = useSetMeta("date");
  return (
    <Field data-invalid={errors.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>Date</FieldLabel>
      <Input
        id={id}
        type="date"
        value={props.value}
        required
        onChange={(event) => {
          // Clearing a date input gives an empty value, and a post always has a date.
          if (event.target.value !== "") set(event.target.value);
        }}
      />
      <FieldDescription>Posts are listed newest first.</FieldDescription>
      <FieldError errors={[...errors]} />
    </Field>
  );
}

/** A post's tags, typed separated by commas and saved when the field is left. */
function PostTags(props: { readonly value: ReadonlyArray<string> }) {
  const id = useId();
  const { set, errors } = useSetMeta("tags");
  const [typed, setTyped] = useState(props.value.join(", "));
  const save = () => {
    const tags = [
      ...new Set(
        typed
          .split(",")
          .map((tag) => tag.trim())
          .filter((tag) => tag !== ""),
      ),
    ];
    if (tags.join(", ") !== props.value.join(", ")) set(tags);
  };
  return (
    <Field data-invalid={errors.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>Tags</FieldLabel>
      <Input
        id={id}
        value={typed}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
      />
      <FieldDescription>Separate tags with commas.</FieldDescription>
      <FieldError errors={[...errors]} />
    </Field>
  );
}

/** An image meta field, chosen from the library, with alt text for where it's shown. */
function MetaImage(props: {
  readonly field: "cover" | "image";
  readonly title: string;
  readonly description: string;
  readonly value: PostMeta["cover"];
}) {
  const { set, errors, burst, endBurst } = useSetMeta(props.field);
  const altId = useId();
  const cover = props.value;
  return (
    <FieldSet>
      <div className="flex items-center justify-between gap-2">
        <FieldLegend variant="label">
          {props.title} <span className="font-normal text-muted-foreground">Optional</span>
        </FieldLegend>
        {cover !== undefined && (
          <Button variant="ghost" size="xs" onClick={() => set(undefined)}>
            Remove
          </Button>
        )}
      </div>
      <FieldDescription>{props.description}</FieldDescription>
      <LibraryPicker
        label={`Library for the ${props.title.toLowerCase()}`}
        chosen={cover?.id}
        onChoose={(image) => set(image)}
      />
      {cover !== undefined && (
        <Field>
          <FieldLabel htmlFor={altId}>Alt text</FieldLabel>
          <FieldInput
            id={altId}
            value={cover.alt ?? ""}
            maxLength={250}
            onValue={(alt) => set({ ...cover, alt }, burst)}
            onBlur={endBurst}
          />
          <FieldDescription>
            Say what the image shows for people who can't see it. Leave it empty if it's only
            decoration.
          </FieldDescription>
        </Field>
      )}
      <FieldError errors={[...errors]} />
    </FieldSet>
  );
}

const isPagePath = Schema.is(PagePath);

/**
 * The address of a page or collection, saved once it's a valid address that
 * no other page has. Its old address can send visitors on to it.
 */
function PageAddress(props: { readonly value: PagePath; readonly note: string }) {
  const store = useStore();
  const page = useEditorState((state) => state.page);
  const id = useId();
  const [typed, setTyped] = useState<string>(props.value);
  const [redirect, setRedirect] = useState(true);
  const [errors, setErrors] = useState<ReadonlyArray<{ readonly message: string }>>([]);
  const save = () => {
    if (typed === props.value) return;
    if (!isPagePath(typed)) {
      setErrors([
        {
          message:
            "Use / followed by lowercase letters, numbers and hyphens, such as /summer-school.",
        },
      ]);
      return;
    }
    const ops: Array<Op> = [{ op: "setPath", page, path: typed }];
    if (redirect)
      ops.push({ op: "setRedirect", from: props.value, to: { $ref: "page", id: page } });
    setErrors(store.run(ops).map((error) => ({ message: error.message })));
  };
  return (
    <Field data-invalid={errors.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>Page address</FieldLabel>
      <Input
        id={id}
        value={typed}
        spellCheck={false}
        aria-invalid={errors.length > 0 || undefined}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") save();
        }}
      />
      <FieldDescription>{props.note}</FieldDescription>
      {typed !== props.value && (
        <Label className="font-normal">
          <Checkbox checked={redirect} onCheckedChange={setRedirect} />
          Send visitors from {props.value} here
        </Label>
      )}
      <FieldError errors={[...errors]} />
    </Field>
  );
}

const isSlug = Schema.is(Slug);

/**
 * An entry's address: its collection's address, which it can't change here,
 * and its own slug below it, saved once it's valid and no other page has the
 * address. Its old address can send visitors on to it.
 */
function EntryAddress(props: { readonly collection: PagePath; readonly value: Slug }) {
  const store = useStore();
  const page = useEditorState((state) => state.page);
  const id = useId();
  const [typed, setTyped] = useState<string>(props.value);
  const [redirect, setRedirect] = useState(true);
  const [errors, setErrors] = useState<ReadonlyArray<{ readonly message: string }>>([]);
  const prefix = entryAddress(props.collection, "");
  const previous = entryAddress(props.collection, props.value);
  const save = () => {
    if (typed === props.value) return;
    if (!isSlug(typed)) {
      setErrors([
        { message: "Use lowercase letters, numbers and hyphens, such as dates-announced." },
      ]);
      return;
    }
    const ops: Array<Op> = [{ op: "setSlug", page, slug: typed }];
    if (redirect) ops.push({ op: "setRedirect", from: previous, to: { $ref: "page", id: page } });
    setErrors(store.run(ops).map((error) => ({ message: error.message })));
  };
  return (
    <Field data-invalid={errors.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>Address</FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>{prefix}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          value={typed}
          spellCheck={false}
          aria-invalid={errors.length > 0 || undefined}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={save}
          onKeyDown={(event) => {
            if (event.key === "Enter") save();
          }}
        />
      </InputGroup>
      <FieldDescription>Menu links follow the post when its address changes.</FieldDescription>
      {typed !== props.value && (
        <Label className="font-normal">
          <Checkbox checked={redirect} onCheckedChange={setRedirect} />
          Send visitors from {previous} here
        </Label>
      )}
      <FieldError errors={[...errors]} />
    </Field>
  );
}

/** What the settings call a page: a page, or a collection or entry by its kind. */
const nameOf = (page: PageDocument) => {
  if (page.type === "page") return "Page";
  const names = collectionKinds[page.kind].names;
  return page.type === "collection"
    ? names.kind
    : `${names.one.charAt(0).toUpperCase()}${names.one.slice(1)}`;
};

/** Where a page's address is set: its own address, or an entry's slug below its collection. */
function Address(props: { readonly page: PageDocument }) {
  const { page } = props;
  const pages = useEditorState((state) => state.view.pages);
  if (page.type === "entry") {
    const collection = pages[page.collection];
    if (collection === undefined) return null;
    const path = addressOf(pages, collection);
    return <EntryAddress key={`${path}:${page.slug}`} collection={path} value={page.slug} />;
  }
  const many = page.type === "collection" ? collectionKinds[page.kind].names.many : null;
  return (
    <PageAddress
      key={page.path}
      value={page.path}
      note={
        many === null
          ? "Menu links follow the page when its address changes."
          : `Menu links follow it when its address changes, and its ${many} move with it.`
      }
    />
  );
}

const decodeWebUrl = Schema.decodeOption(WebUrl);

/** Whether search engines list the page, and the address they should treat as its own. */
function SearchEngines(props: { readonly noindex: boolean; readonly canonical: string }) {
  const id = useId();
  const hide = useSetMeta("noindex");
  const canonical = useSetMeta("canonical");
  const [typed, setTyped] = useState(props.canonical);
  const [invalid, setInvalid] = useState(false);
  const saveCanonical = () => {
    if (typed === props.canonical) return;
    if (typed === "") return canonical.set(undefined);
    const decoded = decodeWebUrl(typed);
    setInvalid(Option.isNone(decoded));
    if (Option.isSome(decoded)) canonical.set(decoded.value);
  };
  return (
    <>
      <Field orientation="horizontal">
        <Switch
          id={`${id}-hide`}
          checked={props.noindex}
          onCheckedChange={(checked) => hide.set(checked ? true : undefined)}
        />
        <FieldLabel htmlFor={`${id}-hide`} className="flex-col items-start gap-0.5">
          Hide from search engines
          <span className="font-normal text-muted-foreground">
            It leaves the sitemap. Anyone with the link can still open it.
          </span>
        </FieldLabel>
      </Field>
      <Field data-invalid={invalid || undefined}>
        <FieldLabel htmlFor={`${id}-canonical`}>
          Canonical address <span className="font-normal text-muted-foreground">Optional</span>
        </FieldLabel>
        <Input
          id={`${id}-canonical`}
          type="url"
          value={typed}
          placeholder="https://"
          aria-invalid={invalid || undefined}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={saveCanonical}
        />
        <FieldDescription>
          For a page copied from another site: the address search engines should list instead.
        </FieldDescription>
        {invalid && (
          <FieldError>Enter a full web address, such as https://example.org/page.</FieldError>
        )}
        <FieldError errors={[...canonical.errors]} />
      </Field>
    </>
  );
}

function PageSettings() {
  const page = useEditorState((state) => state.view.pages[state.page]);
  if (page === undefined) return null;
  return (
    <>
      <div className="flex flex-col px-5 py-4">
        <span className="text-xs text-muted-foreground">Nothing selected</span>
        <h2 className="text-lg font-semibold">{nameOf(page)} settings</h2>
      </div>
      <Section title="Search and sharing">
        <MetaText
          field="title"
          label={`${nameOf(page)} title`}
          value={page.meta.title}
          max={70}
          description="Shown in search results and browser tabs."
        />
        <MetaText
          field="description"
          label="Description"
          value={page.meta.description}
          max={160}
          multiline
          description="Shown under the title in search results."
        />
        <MetaImage
          field="image"
          title="Sharing image"
          description="Shown when the page is shared. Without one, its hero image or the site's default is used."
          value={page.meta.image}
        />
        <Address page={page} />
        <SearchEngines
          key={page.meta.canonical ?? ""}
          noindex={page.meta.noindex === true}
          canonical={page.meta.canonical ?? ""}
        />
      </Section>
      {page.type === "entry" && (
        <Section title={nameOf(page)}>
          <PostDate value={page.meta.date} />
          <MetaText
            field="author"
            label="Author"
            value={page.meta.author}
            max={80}
            description="Shown with the post."
          />
          <MetaText
            field="excerpt"
            label="Excerpt"
            value={page.meta.excerpt}
            max={300}
            multiline
            description="Shown where posts are listed."
          />
          <PostTags key={page.meta.tags.join(",")} value={page.meta.tags} />
          <MetaImage
            field="cover"
            title="Cover image"
            description="Shown with the post where posts are listed, and when it's shared."
            value={page.meta.cover}
          />
        </Section>
      )}
      <p className="border-t px-5 py-4 text-sm text-muted-foreground">
        Select a section or item on the page to edit it.
      </p>
    </>
  );
}

/** The selected block's fields, layout and background, or the page's settings when nothing is selected. */
export function SettingsPanel() {
  const selection = useEditorState((state) => state.selection);
  return (
    <div className="flex flex-col">
      {selection === null ? (
        <PageSettings />
      ) : (
        <BlockSettings key={selection.block} target={selection.target} block={selection.block} />
      )}
    </div>
  );
}
