import type { Draft } from "@repo/contracts/draft";
import type { BlockId } from "@repo/contracts/ids";
import type { BatchError, MetaField, Op, Target } from "@repo/contracts/ops";
import { PagePath, type PostMeta } from "@repo/contracts/page";
import type { Surface } from "@repo/tokens";
import { Button } from "@repo/ui/components/button";
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
import { NativeSelect, NativeSelectOption } from "@repo/ui/components/native-select";
import { Textarea } from "@repo/ui/components/textarea";
import { Schema } from "effect";
import { useId, useState } from "react";

import { useEditorState, useServices, useStore } from "../context.tsx";
import { FieldControl } from "./controls.tsx";

const holderOf = (draft: Draft, target: Target) =>
  target === "site" ? draft.parts : draft.pages[target];

/** "split-image" as "Split image". */
const humanize = (name: string) => {
  const words = name.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const surfaceNames: Readonly<Record<Surface, string>> = {
  default: "Page background",
  muted: "Muted",
  brand: "Brand color",
  inverse: "Inverse",
};

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
  const variantId = useId();
  const surfaceId = useId();
  if (instance === undefined) return null;
  const contract = definitions.get(instance.type);
  if (contract === undefined) return null;
  const surfaces = contract.placement === "item" ? [] : contract.surfaces;
  const run = (op: Op) => store.run([op]);
  return (
    <>
      <div className="flex items-start justify-between gap-3 px-5 py-4">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            {contract.placement === "item" ? "Selected item" : "Selected section"}
          </span>
          <h2 className="text-lg font-semibold">{contract.title}</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => store.select(null)}>
          Page settings
        </Button>
      </div>
      <Section title="Content">
        {Object.entries(contract.fields).map(([name, definition]) => (
          <FieldControl
            key={name}
            field={{ target: props.target, block: props.block, path: [name] }}
            definition={definition}
            value={instance.props[name]}
          />
        ))}
      </Section>
      {(contract.variants.length > 1 || surfaces.length > 1) && (
        <Section title="Layout and style">
          {contract.variants.length > 1 && (
            <Field>
              <FieldLabel htmlFor={variantId}>Layout</FieldLabel>
              <NativeSelect
                id={variantId}
                value={instance.variant}
                onChange={(event) =>
                  run({
                    op: "setVariant",
                    target: props.target,
                    block: props.block,
                    variant: event.target.value,
                  })
                }
                className="w-full"
              >
                {contract.variants.map((variant) => (
                  <NativeSelectOption key={variant} value={variant}>
                    {humanize(variant)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
          {surfaces.length > 1 && instance.surface !== undefined && (
            <Field>
              <FieldLabel htmlFor={surfaceId}>Background</FieldLabel>
              <NativeSelect
                id={surfaceId}
                value={instance.surface}
                onChange={(event) => {
                  const surface = surfaces.find((candidate) => candidate === event.target.value);
                  if (surface !== undefined)
                    run({ op: "setSurface", target: props.target, block: props.block, surface });
                }}
                className="w-full"
              >
                {surfaces.map((surface) => (
                  <NativeSelectOption key={surface} value={surface}>
                    {surfaceNames[surface]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
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
        <Textarea {...shared} onChange={(event) => change(event.target.value)} />
      ) : (
        <Input {...shared} onChange={(event) => change(event.target.value)} />
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
      <FieldDescription>Blog lists show posts newest first.</FieldDescription>
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

/** A post's cover image, chosen from the library, with alt text for where it's shown. */
function PostCover(props: { readonly value: PostMeta["cover"] }) {
  const { media, mediaSrc } = useServices();
  const { set, errors, burst, endBurst } = useSetMeta("cover");
  const altId = useId();
  const cover = props.value;
  return (
    <FieldSet>
      <div className="flex items-center justify-between gap-2">
        <FieldLegend variant="label">
          Cover image <span className="font-normal text-muted-foreground">Optional</span>
        </FieldLegend>
        {cover !== undefined && (
          <Button variant="ghost" size="xs" onClick={() => set(undefined)}>
            Remove
          </Button>
        )}
      </div>
      <FieldDescription>Shown with the post in blog lists and when it's shared.</FieldDescription>
      <ul className="grid grid-cols-4 gap-2" aria-label="Library">
        {media.map((file) => (
          <li key={file.id}>
            <button
              type="button"
              aria-pressed={cover?.id === file.id}
              aria-label={file.alt === "" ? file.id : file.alt}
              className="block aspect-square w-full overflow-hidden rounded-md border-2 border-transparent focus-visible:border-ring focus-visible:outline-none aria-pressed:border-ring"
              onClick={() => {
                if (cover?.id !== file.id) set({ $ref: "media", id: file.id, alt: file.alt });
              }}
            >
              <img src={mediaSrc(file.id)} alt="" className="size-full object-cover" />
            </button>
          </li>
        ))}
      </ul>
      {cover !== undefined && (
        <Field>
          <FieldLabel htmlFor={altId}>Alt text</FieldLabel>
          <Input
            id={altId}
            value={cover.alt ?? ""}
            maxLength={250}
            onChange={(event) => set({ ...cover, alt: event.target.value }, burst)}
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

/** The page's address, saved once it's a valid address that no other page has. */
function PageAddress(props: { readonly value: string }) {
  const store = useStore();
  const page = useEditorState((state) => state.page);
  const id = useId();
  const [typed, setTyped] = useState(props.value);
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
    setErrors(
      store
        .run([{ op: "setPath", page, path: typed }])
        .map((error) => ({ message: error.message })),
    );
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
      <FieldDescription>Menu links follow the page when its address changes.</FieldDescription>
      <FieldError errors={[...errors]} />
    </Field>
  );
}

function PageSettings() {
  const page = useEditorState((state) => state.view.pages[state.page]);
  if (page === undefined) return null;
  return (
    <>
      <div className="flex flex-col px-5 py-4">
        <span className="text-xs text-muted-foreground">Nothing selected</span>
        <h2 className="text-lg font-semibold">
          {page.type === "post" ? "Post settings" : "Page settings"}
        </h2>
      </div>
      <Section title="Search and sharing">
        <MetaText
          field="title"
          label={page.type === "post" ? "Post title" : "Page title"}
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
        <PageAddress key={page.path} value={page.path} />
      </Section>
      {page.type === "post" && (
        <Section title="Post">
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
            description="Shown in blog lists."
          />
          <PostTags key={page.meta.tags.join(",")} value={page.meta.tags} />
          <PostCover value={page.meta.cover} />
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
