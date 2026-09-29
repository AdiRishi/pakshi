import { fieldAt, placeholderPaths } from "@repo/blocks";
import type { Draft } from "@repo/contracts/draft";
import type { BlockId } from "@repo/contracts/ids";
import type { BatchError, MetaField, Target } from "@repo/contracts/ops";
import { PagePath, type PostMeta } from "@repo/contracts/page";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
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
import { Textarea } from "@repo/ui/components/textarea";
import { Schema } from "effect";
import { CircleAlertIcon, EllipsisIcon } from "lucide-react";
import { useId, useState } from "react";

import { BlockMenu } from "../block-menu.tsx";
import { useEditorState, useServices, useStore } from "../context.tsx";
import { LibraryPicker } from "../library-picker.tsx";
import { blockLabel } from "../structure.ts";
import { Appearance } from "./appearance.tsx";
import { FieldControl } from "./controls.tsx";

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
        {Object.entries(contract.fields).map(([name, definition]) => (
          <FieldControl
            key={name}
            field={{ target: props.target, block: props.block, path: [name] }}
            definition={definition}
            value={instance.props[name]}
          />
        ))}
      </Section>
      {(contract.variants.length > 1 ||
        (contract.placement !== "item" && contract.surfaces.length > 1)) && (
        <Section title="Layout and style">
          <Appearance
            target={props.target}
            block={props.block}
            instance={instance}
            contract={contract}
          />
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
      <LibraryPicker chosen={cover?.id} onChoose={(image) => set(image)} />
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
