import type { MediaId, PageId } from "@repo/contracts/ids";
import type { Link, MediaRef } from "@repo/contracts/references";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { Predicate } from "effect";
import { createContext, type ReactNode, useContext } from "react";

import { useBlockFrame } from "./block.tsx";
import { type RichTextDocument, richTextExtensions, toJsonContent } from "./rich-text.ts";

export interface ResolvedMedia {
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
}

/** How references in props become URLs. `sites` resolves them from the snapshot; the editor from the draft. */
export interface References {
  readonly media: (id: MediaId) => ResolvedMedia | undefined;
  readonly pagePath: (id: PageId) => string | undefined;
}

const ReferencesContext = createContext<References | null>(null);

export const ReferencesProvider = ReferencesContext.Provider;

const useReferences = () => {
  const references = useContext(ReferencesContext);
  if (references === null) throw new Error("Blocks render only inside a ReferencesProvider.");
  return references;
};

/*
 * Blocks render every editable field through these components. Outside the
 * editor they output exactly the markup a block would write by hand. Each
 * takes the prop's name as `field`, which the editor uses to make it editable.
 */

/** A block's root element. It carries the section's surface, which re-scopes the theme's colors. */
export const Root = (options: {
  readonly as?: "section" | "div" | "header" | "footer" | "article";
  readonly className?: string;
  readonly children: ReactNode;
}) => {
  const { surface } = useBlockFrame();
  const Element = options.as ?? "section";
  return (
    <Element data-surface={surface} className={options.className}>
      {options.children}
    </Element>
  );
};

export const Text = (options: {
  readonly field: string;
  readonly value: string;
  readonly as: "h1" | "h2" | "h3" | "p" | "span";
  readonly className?: string;
}) => {
  const Element = options.as;
  return <Element className={options.className}>{options.value}</Element>;
};

export const RichText = (options: {
  readonly field: string;
  readonly value: RichTextDocument;
  readonly className?: string;
}) => {
  const definition = useBlockFrame().fields[options.field];
  if (definition?.kind !== "richText")
    throw new Error(`${options.field} is not a rich text field of this block.`);
  return (
    <div className={options.className}>
      {renderToReactElement({
        content: toJsonContent(options.value),
        extensions: richTextExtensions(definition.marks, definition.nodes),
      })}
    </div>
  );
};

export const Media = (options: {
  readonly field: string;
  readonly value: MediaRef;
  readonly className?: string;
  readonly sizes?: string;
  readonly priority?: boolean;
}) => {
  const media = useReferences().media(options.value.id);
  if (media === undefined) return null;
  return (
    <img
      src={media.src}
      alt={media.alt}
      width={media.width}
      height={media.height}
      sizes={options.sizes}
      loading={options.priority === true ? "eager" : "lazy"}
      decoding="async"
      className={options.className}
    />
  );
};

export const Cta = (options: {
  readonly field: string;
  readonly value: { readonly label: string; readonly link: Link };
  readonly className?: string;
}) => {
  const references = useReferences();
  const { link } = options.value;
  const href = Predicate.isString(link) ? link : (references.pagePath(link.id) ?? "#");
  return (
    <a href={href} className={options.className}>
      {options.value.label}
    </a>
  );
};
