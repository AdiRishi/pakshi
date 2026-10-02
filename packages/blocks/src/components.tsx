import type { FormDefinition } from "@repo/contracts/form";
import type { BlockId, FormId, MediaId, MenuItemId, PageId } from "@repo/contracts/ids";
import type { PostMeta } from "@repo/contracts/page";
import type { FormRef, Link, MediaRef } from "@repo/contracts/references";
import type { Surface } from "@repo/tokens";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { Predicate } from "effect";
import {
  type ComponentType,
  createContext,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";

import { useBlockFrame } from "./block.tsx";
import { type Field, fieldAt } from "./fields.ts";
import { buttonClass } from "./kit/button.ts";
import { samplePosts } from "./placeholders.ts";
import { richTextExtensions, toJsonContent } from "./rich-text-extensions.ts";
import type { RichTextDocument } from "./rich-text.ts";

export interface ResolvedMedia {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  /** The same image at other widths, as `srcset` lists them, when they're served. */
  readonly srcSet?: string;
}

export interface ResolvedMenuItem {
  readonly id: MenuItemId;
  readonly label: string;
  readonly href: string;
  readonly children: ReadonlyArray<Omit<ResolvedMenuItem, "children">>;
}

/** An entry of a collection, such as a blog's post, at its address. */
export interface SiteEntry {
  readonly id: PageId;
  readonly href: string;
  readonly meta: PostMeta;
}

/** A collection, at its address, with its entries in the order its kind lists them. */
export interface SiteCollection {
  readonly id: PageId;
  readonly href: string;
  readonly title: string;
  readonly entries: ReadonlyArray<SiteEntry>;
}

/**
 * What blocks read beyond their own props: the site's name and menus, its
 * collections, the page being shown, and what references point at. `sites`
 * builds it from a snapshot and the editor from the draft, with `siteData`.
 */
export interface SiteData {
  readonly name: string;
  /**
   * The brand's logo, if it has one, and the version for dark backgrounds,
   * if that differs.
   */
  readonly logo: {
    readonly light: ResolvedMedia;
    readonly onDark: ResolvedMedia | null;
  } | null;
  readonly menus: {
    readonly main: ReadonlyArray<ResolvedMenuItem>;
    readonly footer: ReadonlyArray<ResolvedMenuItem>;
  };
  /** The site's collections by page, and the placeholder collection with its sample posts. */
  readonly collections: ReadonlyMap<PageId, SiteCollection>;
  readonly media: (id: MediaId) => ResolvedMedia | undefined;
  readonly pagePath: (id: PageId) => string | undefined;
  readonly form: (id: FormId) => FormDefinition | undefined;
  /**
   * Set when the page shows a preview rather than the live site: its forms
   * don't send, and the blocks in `changed` are marked for review.
   */
  readonly preview: { readonly changed: ReadonlySet<BlockId> } | null;
  /** The form whose answers the visitor has just sent, which thanks them instead of asking again. */
  readonly sent: FormId | null;
  /**
   * The page being shown, and which page of a collection's entries it shows,
   * counting from 1. Null where blocks show outside a page, such as a theme's
   * preview.
   */
  readonly current: { readonly page: PageId; readonly number: number } | null;
}

const SiteDataContext = createContext<SiteData | null>(null);

export const SiteDataProvider = SiteDataContext.Provider;

const useSiteData = () => {
  const site = useContext(SiteDataContext);
  if (site === null) throw new Error("Blocks render only inside a SiteDataProvider.");
  return site;
};

/** The site's name. */
export const useSiteName = () => useSiteData().name;

/** The brand's logo, or null when it has none. */
export const useLogo = () => useSiteData().logo;

/** A menu's items, with links resolved to addresses. */
export const useMenu = (name: "main" | "footer") => useSiteData().menus[name];

/** A collection with its entries, or undefined when the site has no such collection. */
export const useCollection = (id: PageId) => useSiteData().collections.get(id);

/** The page being shown, and which page of a collection's entries, or null outside a page. */
export const useCurrentPage = () => useSiteData().current;

/**
 * The entry being shown, or a sample post where blocks show outside an
 * entry, such as in the block gallery. Blocks that show an entry's details
 * can only be placed on entries.
 */
export const entryShown = (site: SiteData): SiteEntry => {
  const { current } = site;
  const entry =
    current === null
      ? undefined
      : Array.from(site.collections.values())
          .flatMap((collection) => collection.entries)
          .find((candidate) => candidate.id === current.page);
  return entry ?? samplePosts[0];
};

/** The entry being shown, or a sample post outside one. */
export const useEntry = () => entryShown(useSiteData());

/** Where a link points: a page's current address, or the external address itself. */
export const useHref = (link: Link) => {
  const site = useSiteData();
  return Predicate.isString(link) ? link : (site.pagePath(link.id) ?? "#");
};

/** A form's definition, or undefined when the draft or snapshot has no such form. */
export const useForm = (id: FormId) => useSiteData().form(id);

/*
 * Blocks render every editable field through these components. Outside the
 * editor they output exactly the markup a block would write by hand. Inside
 * it, the editor supplies editing versions through FieldEditingProvider that
 * keep the same element, classes and content, and may add attributes, event
 * handlers and `contenteditable`, but never wrappers.
 *
 * Each takes the field's name, or a path such as `["images", item.id,
 * "image"]` for a field inside a list item.
 */

type FieldPath = string | ReadonlyArray<string>;

const pathOf = (field: FieldPath) => (Predicate.isString(field) ? [field] : field);

interface RootProps {
  readonly as?: "section" | "div" | "header" | "footer" | "article" | "li";
  readonly className?: string | undefined;
  readonly children: ReactNode;
}

interface TextProps {
  readonly field: FieldPath;
  readonly value: string;
  readonly as: "h1" | "h2" | "h3" | "p" | "span";
  readonly className?: string | undefined;
}

interface RichTextProps {
  readonly field: FieldPath;
  readonly value: RichTextDocument;
  readonly className?: string | undefined;
}

interface MediaProps {
  readonly field: FieldPath;
  readonly value: MediaRef;
  readonly className?: string | undefined;
  readonly sizes?: string | undefined;
  readonly priority?: boolean | undefined;
}

interface CtaProps {
  readonly field: FieldPath;
  readonly value: { readonly label: string; readonly link: Link };
  readonly className?: string | undefined;
}

/** Where an editable field sits, which the editor needs to change it. */
export interface FieldAddress {
  readonly block: BlockId;
  readonly path: ReadonlyArray<string>;
  readonly definition: Field;
}

/**
 * What the editor adds to an element that a field renders through markup of
 * its own, such as a form: attributes and handlers, never a wrapper.
 */
export type EditableAttributes = HTMLAttributes<HTMLElement> & {
  readonly [attribute: `data-${string}`]: string | true | undefined;
};

/** The editing versions of the field components, which the editor supplies. */
export interface FieldEditing {
  readonly Root: ComponentType<
    Omit<RootProps, "as"> & {
      readonly block: BlockId;
      readonly element: NonNullable<RootProps["as"]>;
      readonly surface: Surface | undefined;
    }
  >;
  readonly Text: ComponentType<Omit<TextProps, "field"> & FieldAddress>;
  readonly RichText: ComponentType<Omit<RichTextProps, "field"> & FieldAddress>;
  readonly Media: ComponentType<
    Omit<MediaProps, "field"> & FieldAddress & { readonly file: ResolvedMedia }
  >;
  readonly Cta: ComponentType<Omit<CtaProps, "field"> & FieldAddress & { readonly href: string }>;
  readonly Slot: ComponentType<
    SlotProps & { readonly block: BlockId; readonly children: ReadonlyArray<ReactNode> }
  >;
  /** A form, which `render` draws with the attributes that make it editable. */
  readonly Form: ComponentType<
    FieldAddress & {
      readonly value: FormRef;
      readonly render: (editable: EditableAttributes) => ReactElement;
    }
  >;
}

const FieldEditingContext = createContext<FieldEditing | null>(null);

export const FieldEditingProvider = FieldEditingContext.Provider;

/** Whether blocks render in the editor canvas, where every field must be reachable. */
export const useEditing = () => useContext(FieldEditingContext) !== null;

/** The field a component renders, from the block's own fields. */
const useField = (field: FieldPath) => {
  const frame = useBlockFrame();
  const path = pathOf(field);
  const definition = fieldAt(frame.fields, path);
  if (definition === undefined) throw new Error(`${path.join(".")} is not a field of this block.`);
  return { block: frame.id, path, definition };
};

/** A block's root element. It carries the section's surface, which re-scopes the theme's colors. */
export const Root = (options: RootProps) => {
  const { id, surface } = useBlockFrame();
  const editing = useContext(FieldEditingContext);
  const preview = useContext(SiteDataContext)?.preview ?? null;
  const element = options.as ?? "section";
  if (editing !== null)
    return (
      <editing.Root block={id} element={element} surface={surface} className={options.className}>
        {options.children}
      </editing.Root>
    );
  const Element = element;
  return (
    <Element
      data-surface={surface}
      data-pakshi-changed={preview?.changed.has(id) || undefined}
      className={options.className}
    >
      {options.children}
    </Element>
  );
};

export const Text = (options: TextProps) => {
  const address = useField(options.field);
  const editing = useContext(FieldEditingContext);
  if (editing !== null)
    return (
      <editing.Text
        {...address}
        value={options.value}
        as={options.as}
        className={options.className}
      />
    );
  const Element = options.as;
  return <Element className={options.className}>{options.value}</Element>;
};

export const RichText = (options: RichTextProps) => {
  const address = useField(options.field);
  const editing = useContext(FieldEditingContext);
  if (address.definition.kind !== "richText")
    throw new Error(`${address.path.join(".")} is not a rich text field of this block.`);
  if (editing !== null)
    return <editing.RichText {...address} value={options.value} className={options.className} />;
  return (
    <div className={options.className}>
      {renderToReactElement({
        content: toJsonContent(options.value),
        extensions: richTextExtensions(address.definition.marks, address.definition.nodes),
      })}
    </div>
  );
};

export const Media = (options: MediaProps) => {
  const address = useField(options.field);
  const editing = useContext(FieldEditingContext);
  const file = useSiteData().media(options.value.id);
  if (file === undefined) return null;
  if (editing !== null)
    return (
      <editing.Media
        {...address}
        file={file}
        value={options.value}
        className={options.className}
        sizes={options.sizes}
        priority={options.priority}
      />
    );
  return imageElement(file, options);
};

const imageElement = (file: ResolvedMedia, options: Omit<MediaProps, "field">): ReactElement => (
  <img
    src={file.src}
    srcSet={file.srcSet}
    alt={options.value.alt ?? ""}
    width={file.width}
    height={file.height}
    sizes={options.sizes}
    loading={options.priority === true ? "eager" : "lazy"}
    decoding="async"
    className={options.className}
  />
);

/**
 * An image the block shows from the site rather than from its own fields,
 * such as a post's cover. It's changed where the site keeps it.
 */
export const SiteImage = (options: Omit<MediaProps, "field">) => {
  const file = useSiteData().media(options.value.id);
  return file === undefined ? null : imageElement(file, options);
};

export const Cta = (options: CtaProps) => {
  const address = useField(options.field);
  const editing = useContext(FieldEditingContext);
  const href = useHref(options.value.link);
  if (editing !== null)
    return (
      <editing.Cta {...address} href={href} value={options.value} className={options.className} />
    );
  return (
    <a href={href} className={options.className}>
      {options.value.label}
    </a>
  );
};

interface SlotProps {
  readonly name: string;
  readonly as?: "div" | "ul" | "ol" | undefined;
  readonly className?: string | undefined;
}

/** A section's slot: the items placed in it, rendered inside this element. */
export const Slot = (options: SlotProps) => {
  const frame = useBlockFrame();
  const editing = useContext(FieldEditingContext);
  const items = frame.slots[options.name] ?? [];
  if (editing !== null)
    return (
      <editing.Slot
        block={frame.id}
        name={options.name}
        as={options.as}
        className={options.className}
      >
        {items}
      </editing.Slot>
    );
  const Element = options.as ?? "div";
  return <Element className={options.className}>{items}</Element>;
};

const inputClass =
  "w-full rounded-md border border-input bg-background px-4 py-3 text-body text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

const inlineInputClass =
  "h-11 min-w-0 flex-1 basis-56 rounded-button border border-input bg-background px-4 text-body text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * A form from the site's forms, with its fields in order. Its markup lives
 * here rather than in block versions, so the way forms post can change
 * without a new version of every block that shows one.
 */
export const FormView = (options: {
  readonly field: FieldPath;
  readonly value: FormRef;
  /**
   * Fields one under another with their labels above them, or in one row
   * with the button, labelled by their placeholders, as a sign-up form is.
   * Checkboxes go under the row.
   */
  readonly layout?: "stacked" | "inline";
  readonly className?: string | undefined;
}) => {
  const address = useField(options.field);
  const editing = useContext(FieldEditingContext);
  const definition = useForm(options.value.id);
  const { pagePath: privacyHref, preview, sent } = useSiteData();
  if (definition === undefined) return null;
  if (sent === definition.id)
    return <output className="text-lead">Thank you. Your answers were sent.</output>;
  const inputId = (id: string) => `${address.block}-${id}`;
  const submit = (
    <button
      type="submit"
      // A disabled default button also stops Enter from submitting the form.
      disabled={preview !== null}
      className={buttonClass({ size: "md" })}
    >
      {definition.submitLabel}
    </button>
  );
  if (options.layout === "inline") {
    const inline = (editable: EditableAttributes) => (
      <form
        {...editable}
        method="post"
        action={`?form=${definition.id}`}
        className={options.className}
      >
        <div className="flex flex-wrap gap-2">
          {definition.fields.map((field) => {
            switch (field.kind) {
              case "hidden":
                return <input key={field.id} type="hidden" name={field.id} value={field.value} />;
              case "checkbox":
              case "longText":
              case "select":
                return null;
              default:
                return (
                  <input
                    key={field.id}
                    aria-label={field.label}
                    placeholder={field.label}
                    name={field.id}
                    required={field.required}
                    type={{ shortText: "text", email: "email", phone: "tel" }[field.kind]}
                    autoComplete={
                      { shortText: undefined, email: "email", phone: "tel" }[field.kind]
                    }
                    className={inlineInputClass}
                  />
                );
            }
          })}
          {submit}
        </div>
        {definition.fields.map((field) =>
          field.kind === "checkbox" ? (
            <label
              key={field.id}
              className="text-small mt-3 flex items-start gap-2 text-muted-foreground"
            >
              <input
                name={field.id}
                type="checkbox"
                required={field.required}
                className="mt-0.5 size-4 accent-primary"
              />
              <span>
                {field.label}
                {field.link && (
                  <>
                    {" "}
                    <a
                      className="text-primary underline"
                      href={
                        Predicate.isString(field.link)
                          ? field.link
                          : (privacyHref(field.link.id) ?? "#")
                      }
                    >
                      Privacy policy
                    </a>
                  </>
                )}
              </span>
            </label>
          ) : null,
        )}
      </form>
    );
    return editing === null ? (
      inline({})
    ) : (
      <editing.Form {...address} value={options.value} render={inline} />
    );
  }
  const render = (editable: EditableAttributes) => (
    <form
      {...editable}
      method="post"
      action={`?form=${definition.id}`}
      className={options.className}
    >
      {definition.fields.map((field) => {
        switch (field.kind) {
          case "hidden":
            return <input key={field.id} type="hidden" name={field.id} value={field.value} />;
          case "checkbox":
            return (
              <div key={field.id} className="flex items-start gap-3">
                <input
                  id={inputId(field.id)}
                  name={field.id}
                  type="checkbox"
                  required={field.required}
                  className="mt-1 size-5 accent-primary"
                />
                <label htmlFor={inputId(field.id)} className="text-body">
                  {field.label}
                  {field.link && (
                    <>
                      {" "}
                      <a
                        className="text-primary underline"
                        href={
                          Predicate.isString(field.link)
                            ? field.link
                            : (privacyHref(field.link.id) ?? "#")
                        }
                      >
                        Privacy policy
                      </a>
                    </>
                  )}
                </label>
              </div>
            );
          default:
            return (
              <div key={field.id} className="flex flex-col gap-2">
                <label htmlFor={inputId(field.id)} className="text-small font-medium">
                  {field.label}
                  {!field.required && <span className="text-muted-foreground"> (optional)</span>}
                </label>
                {field.kind === "longText" ? (
                  <textarea
                    id={inputId(field.id)}
                    name={field.id}
                    required={field.required}
                    rows={5}
                    className={inputClass}
                  />
                ) : field.kind === "select" ? (
                  <select
                    id={inputId(field.id)}
                    name={field.id}
                    required={field.required}
                    className={inputClass}
                  >
                    {field.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={inputId(field.id)}
                    name={field.id}
                    required={field.required}
                    type={{ shortText: "text", email: "email", phone: "tel" }[field.kind]}
                    autoComplete={
                      { shortText: undefined, email: "email", phone: "tel" }[field.kind]
                    }
                    className={inputClass}
                  />
                )}
              </div>
            );
        }
      })}
      <div>{submit}</div>
    </form>
  );
  return editing === null ? (
    render({})
  ) : (
    <editing.Form {...address} value={options.value} render={render} />
  );
};
