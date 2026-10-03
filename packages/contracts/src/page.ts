import { Surface } from "@repo/tokens";
import { Schema } from "effect";

import { BlockId, BlockType, PageId } from "./ids.ts";
import { MediaRef, WebUrl } from "./references.ts";

/** A page's address on its site: `/` or lowercase segments such as `/summer-school/2027`. */
export const PagePath = Schema.String.check(
  Schema.isPattern(/^\/([a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*)?$/u),
);
export type PagePath = typeof PagePath.Type;

const slugLength = 80;

/** An entry's own part of its address, one segment below its collection's, such as `dates-announced`. */
export const Slug = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]+(-[a-z0-9]+)*$/u),
  Schema.isMaxLength(slugLength),
);
export type Slug = typeof Slug.Type;

const isSlug = Schema.is(Slug);

/**
 * A slug made from a title, such as `dates-announced` from "Dates
 * announced!": its letters and digits, accents dropped, in lowercase words
 * joined by hyphens and cut at a word to fit. Null when the title has no
 * letter or digit to make one from.
 */
export const slugFor = (title: string): Slug | null => {
  const words = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[a-z0-9]+/g);
  const joined = (words ?? []).join("-");
  const cut = joined.slice(0, slugLength + 1);
  const lastWord = cut.lastIndexOf("-");
  const slug =
    joined.length <= slugLength ? joined : cut.slice(0, lastWord === -1 ? slugLength : lastWord);
  return isSlug(slug) ? slug : null;
};

/** What a collection holds. Each kind is built in, with its own entry meta and recipes. */
export const CollectionKind = Schema.Literals(["blog"]);
export type CollectionKind = typeof CollectionKind.Type;

/**
 * One placed block. Its props are checked against the block's own schema at
 * the draft's pinned version, which the page document doesn't know about.
 * Sections carry a surface and may have slots; items inside a slot have
 * neither.
 */
export const BlockInstance = Schema.Struct({
  type: BlockType,
  variant: Schema.String,
  surface: Schema.optionalKey(Surface),
  props: Schema.Record(Schema.String, Schema.Json),
  slots: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(BlockId))),
});
export type BlockInstance = typeof BlockInstance.Type;

/*
 * Meta fields carry only the limits enforced while typing. A draft may leave
 * them empty; freezing checks that they're filled in.
 */
const atMost = (max: number) =>
  Schema.String.check(Schema.isMaxLength(max, { message: `Use at most ${max} characters` }));

export const PageMeta = Schema.Struct({
  title: atMost(70),
  description: atMost(160),
  /** The image shown when the page is shared, instead of its hero image or the site's default. */
  image: Schema.optionalKey(MediaRef),
  /** Another address search engines should treat as the page's own, for a page copied from elsewhere. */
  canonical: Schema.optionalKey(WebUrl),
  /** Keeps the page out of search engines and the sitemap. */
  noindex: Schema.optionalKey(Schema.Boolean),
});
export type PageMeta = typeof PageMeta.Type;

export const PostMeta = Schema.Struct({
  ...PageMeta.fields,
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u)),
  author: atMost(80),
  tags: Schema.Array(Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(40))),
  excerpt: atMost(300),
  cover: Schema.optionalKey(MediaRef),
});
export type PostMeta = typeof PostMeta.Type;

const documentFields = {
  schema: Schema.Literal("pakshi.page/1"),
  id: PageId,
  recipe: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.Literal("unpublished")),
  /** Reserved so localization can be added without a migration. */
  locale: Schema.optionalKey(Schema.String),
  root: Schema.Array(BlockId),
  blocks: Schema.Record(BlockId, BlockInstance),
};

const integrity = Schema.makeFilter(
  (page: {
    readonly root: ReadonlyArray<BlockId>;
    readonly blocks: Readonly<Record<BlockId, BlockInstance>>;
  }) => {
    const issues: Array<Schema.FilterIssue> = [];
    const placed = new Set<BlockId>();
    const place = (id: BlockId, path: ReadonlyArray<string | number>) => {
      if (placed.has(id)) issues.push({ path, issue: `${id} is placed more than once` });
      placed.add(id);
      if (!(id in page.blocks)) issues.push({ path, issue: `${id} is not in blocks` });
    };
    page.root.forEach((id, index) => {
      place(id, ["root", index]);
      const section = page.blocks[id];
      if (section === undefined) return;
      if (section.surface === undefined)
        issues.push({ path: ["blocks", id], issue: "A section needs a surface" });
      for (const [slot, children] of Object.entries(section.slots ?? {})) {
        children.forEach((childId, childIndex) => {
          const path = ["blocks", id, "slots", slot, childIndex];
          place(childId, path);
          const item = page.blocks[childId];
          if (item?.slots !== undefined || item?.surface !== undefined)
            issues.push({ path, issue: `${childId} is an item, so it has no slots or surface` });
        });
      }
    });
    for (const id of Object.keys(page.blocks)) {
      if (!placed.has(BlockId.make(id)))
        issues.push({ path: ["blocks", id], issue: `${id} is not placed on the page` });
    }
    return issues;
  },
  { title: "document integrity" },
);

/**
 * A page: a flat map of block instances plus the ordered list of sections.
 * Blocks are addressed by ID, so an address never changes when blocks move.
 *
 * A collection is a page that holds entries of one kind, such as a blog's
 * posts. An entry is a page in a collection. It stores only its slug, so its
 * address follows its collection's when the collection moves. Neither a
 * collection's kind nor an entry's collection ever changes; an entry records
 * its kind too, because a page object is read on its own.
 */
export const PageDocument = Schema.Union([
  Schema.Struct({
    ...documentFields,
    type: Schema.Literal("page"),
    path: PagePath,
    meta: PageMeta,
  }),
  Schema.Struct({
    ...documentFields,
    type: Schema.Literal("collection"),
    path: PagePath,
    kind: CollectionKind,
    meta: PageMeta,
  }),
  Schema.Struct({
    ...documentFields,
    type: Schema.Literal("entry"),
    kind: Schema.Literal("blog"),
    collection: PageId,
    slug: Slug,
    meta: PostMeta,
  }),
]).check(integrity);
export type PageDocument = typeof PageDocument.Type;

/** The meta schema a page's kind takes. */
export const metaSchemaOf = (page: Pick<PageDocument, "type">) =>
  page.type === "entry" ? PostMeta : PageMeta;

/** What people call a page: its title, or its address or slug while it has none. */
export const pageName = (
  page: { readonly meta: { readonly title: string } } & (
    | { readonly path: PagePath }
    | { readonly slug: Slug }
  ),
) => page.meta.title || ("path" in page ? page.path : page.slug);
