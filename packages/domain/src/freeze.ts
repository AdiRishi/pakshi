import type { BlockContract } from "@repo/blocks/contract";
import { type Field, fieldAt, type Fields, propsSchema } from "@repo/blocks/fields";
import { placeholderMedia, placeholderPaths } from "@repo/blocks/placeholders";
import { linkTexts, RichTextDocument } from "@repo/blocks/rich-text";
import type { SiteContent } from "@repo/contracts/draft";
import type { FormDefinition } from "@repo/contracts/form";
import { BlockId, type FormId, type MediaId, type PageId } from "@repo/contracts/ids";
import type { Place } from "@repo/contracts/merge";
import type { Target } from "@repo/contracts/ops";
import {
  type BlockInstance,
  type PageDocument,
  type PagePath,
  pageName,
} from "@repo/contracts/page";
import type { Incomplete, CheckIssue } from "@repo/contracts/publishing";
import { MediaRef, PageRef } from "@repo/contracts/references";
import type { MenuItem } from "@repo/contracts/site";
import { listingsOf, type PageListing, type SnapshotManifest } from "@repo/contracts/snapshot";
import { Predicate, Schema, SchemaIssue, SchemaParser } from "effect";
import type { Json } from "effect/Schema";

import { type BlockContracts, formsUsedBy } from "./document.ts";

/*
 * Freezing turns a draft into what a snapshot holds. Drafts may be
 * incomplete while people work on them; a frozen draft may not, so the checks
 * run first: every block is checked against its version's complete schema
 * and for placeholder content, every page for its title and description,
 * every link to a page for a page that's served and every link for text it
 * shows, and every form on a served page for labels on its fields,
 * somewhere to send its entries and, when it asks for contact details, a
 * consent checkbox.
 */

/** A page a site serves, with its listing at its address. */
export interface ServedPage {
  readonly listing: PageListing;
  readonly document: PageDocument;
}

/** A draft ready to be written as a snapshot. */
export interface Frozen {
  readonly pages: ReadonlyArray<ServedPage>;
  /** Addresses that answer 410 Gone: ones served before and not now, and ones gone already. */
  readonly gone: ReadonlyArray<PagePath>;
  /** The library images the snapshot shows. Built-in placeholder images need no file. */
  readonly media: ReadonlyArray<MediaId>;
}

export type FreezeResult =
  | { readonly ok: true; readonly frozen: Frozen }
  | { readonly ok: false; readonly issues: ReadonlyArray<CheckIssue> };

const formatIssues = SchemaIssue.makeFormatterStandardSchemaV1();

const completeSchemas = new WeakMap<BlockContract, Schema.Decoder<unknown>>();

const completeSchema = (contract: BlockContract) => {
  let schema = completeSchemas.get(contract);
  if (schema === undefined) {
    schema = propsSchema(contract.fields, "complete");
    completeSchemas.set(contract, schema);
  }
  return schema;
};

const isMediaRef = Schema.is(MediaRef);
const isPageRef = Schema.is(PageRef);
const isJsonObject = Schema.is(Schema.JsonObject);
const isRichText = Schema.is(RichTextDocument);

const blank = (text: string) => text.trim() === "";

/** A path from a schema issue, with list positions turned into the IDs of the items there. */
const propPath = (
  fields: Fields,
  props: BlockInstance["props"],
  issuePath: ReadonlyArray<string | number>,
): ReadonlyArray<string> => {
  const [name, index, ...rest] = issuePath;
  if (name === undefined) return [];
  const value = props[String(name)];
  const field = fields[String(name)];
  if (field?.kind !== "list" || !Predicate.isNumber(index) || !Array.isArray(value))
    return [name, index, ...rest].flatMap((key) => (key === undefined ? [] : [String(key)]));
  const item = value[index];
  const id = item !== undefined && isJsonObject(item) ? item["id"] : undefined;
  return [String(name), String(id), ...rest.map(String)];
};

/**
 * The name people know a field at a path by: a list item's own field by its
 * name, and a part of an image or button with the field it belongs to, such
 * as "Photo alt text".
 */
const fieldTitle = (contract: BlockContract, path: ReadonlyArray<string>) => {
  const field = fieldAt(contract.fields, path);
  const owner = path.length > 1 ? fieldAt(contract.fields, path.slice(0, -1)) : undefined;
  if (field !== undefined && (owner?.kind === "media" || owner?.kind === "cta"))
    return `${owner.title} ${field.title.toLowerCase()}`;
  return field?.title ?? contract.fields[path[0] ?? ""]?.title ?? contract.title;
};

const contractOf = (contracts: BlockContracts, block: BlockInstance) => {
  const contract = contracts.get(block.type);
  if (contract === undefined) throw new Error(`The lockfile pins no version of ${block.type}.`);
  return contract;
};

/** The fields of a block's props that its version's complete schema refuses, with what's wrong. */
export const incompleteProps = (
  contract: BlockContract,
  props: BlockInstance["props"],
): ReadonlyArray<Pick<Incomplete, "path" | "field" | "message">> => {
  const result = SchemaParser.decodeResult(completeSchema(contract))(props, { errors: "all" });
  if (result._tag === "Success") return [];
  return formatIssues(result.failure).issues.map((issue) => {
    const path = propPath(
      contract.fields,
      props,
      (issue.path ?? []).map((key) =>
        Predicate.isNumber(key) ? key : String(Predicate.isObject(key) ? key.key : key),
      ),
    );
    return { path, field: fieldTitle(contract, path), message: issue.message };
  });
};

const incompleteIn = (
  contracts: BlockContracts,
  place: Place,
  id: BlockId,
  block: BlockInstance,
): ReadonlyArray<Incomplete> => {
  const contract = contractOf(contracts, block);
  return incompleteProps(contract, block.props).map((incomplete) => ({
    place,
    block: { id, title: contract.title },
    ...incomplete,
  }));
};

const placeholdersIn = (
  contracts: BlockContracts,
  place: Place,
  id: BlockId,
  block: BlockInstance,
): ReadonlyArray<CheckIssue> => {
  const contract = contractOf(contracts, block);
  return placeholderPaths(contracts, block).map((path) => ({
    _tag: "Placeholder",
    place,
    block: { id, title: contract.title },
    path,
    field: fieldTitle(contract, path),
  }));
};

/** The pages a value links to, wherever they sit in it. */
const pageLinks = (value: Json): ReadonlyArray<PageId> => {
  if (isPageRef(value)) return [value.id];
  if (Array.isArray(value)) return value.flatMap((item: Json) => pageLinks(item));
  return isJsonObject(value) ? Object.values(value).flatMap((item) => pageLinks(item)) : [];
};

const brokenLinksIn = (
  contracts: BlockContracts,
  served: ReadonlySet<PageId>,
  place: Place,
  id: BlockId,
  block: BlockInstance,
): ReadonlyArray<CheckIssue> => {
  const contract = contractOf(contracts, block);
  return Object.entries(block.props).flatMap(([name, value]) =>
    pageLinks(value)
      .filter((page) => !served.has(page))
      .map((page) => ({
        _tag: "BrokenLink" as const,
        place,
        block: { id, title: contract.title },
        field: contract.fields[name]?.title ?? contract.title,
        page,
      })),
  );
};

/** The rich text values a field's value holds, each with its path in the block's props. */
const richTextIn = (
  field: Field,
  path: ReadonlyArray<string>,
  value: Json | undefined,
): ReadonlyArray<{ readonly path: ReadonlyArray<string>; readonly document: RichTextDocument }> => {
  if (field.kind === "richText") return isRichText(value) ? [{ path, document: value }] : [];
  if (field.kind !== "list" || !Array.isArray(value)) return [];
  return value.flatMap((item: Json) => {
    const id = isJsonObject(item) ? item["id"] : undefined;
    return isJsonObject(item) && Predicate.isString(id)
      ? Object.entries(field.item).flatMap(([name, itemField]) =>
          richTextIn(itemField, [...path, id, name], item[name]),
        )
      : [];
  });
};

const blankLinksIn = (
  contracts: BlockContracts,
  place: Place,
  id: BlockId,
  block: BlockInstance,
): ReadonlyArray<CheckIssue> => {
  const contract = contractOf(contracts, block);
  return Object.entries(contract.fields).flatMap(([name, field]) =>
    richTextIn(field, [name], block.props[name])
      .filter(({ document }) => linkTexts(document).some(blank))
      .map(({ path }) => ({
        _tag: "LinkWithoutText" as const,
        place,
        block: { id, title: contract.title },
        path,
        field: field.title,
      })),
  );
};

const blankMenuLinks = (title: string, items: ReadonlyArray<MenuItem>): ReadonlyArray<CheckIssue> =>
  items.flatMap((item) => [
    ...(blank(item.label)
      ? [
          {
            _tag: "LinkWithoutText" as const,
            place: { target: "site" as const, title },
            block: null,
            path: [],
            field: title,
          },
        ]
      : []),
    ...blankMenuLinks(title, item.children ?? []),
  ]);

const brokenMenuLinks = (
  served: ReadonlySet<PageId>,
  title: string,
  items: ReadonlyArray<MenuItem>,
): ReadonlyArray<CheckIssue> =>
  items.flatMap((item) => [
    ...(isPageRef(item.target) && !served.has(item.target.id)
      ? [
          {
            _tag: "BrokenLink" as const,
            place: { target: "site" as const, title },
            block: null,
            field: item.label,
            page: item.target.id,
          },
        ]
      : []),
    ...brokenMenuLinks(served, title, item.children ?? []),
  ]);

const brokenRedirects = (
  served: ReadonlySet<PageId>,
  redirects: SiteContent["redirects"],
): ReadonlyArray<CheckIssue> =>
  Object.entries(redirects).flatMap(([from, to]) =>
    isPageRef(to) && !served.has(to.id)
      ? [
          {
            _tag: "BrokenLink" as const,
            place: { target: "site" as const, title: "Redirects" },
            block: null,
            field: from,
            page: to.id,
          },
        ]
      : [],
  );

/** Whether a form asks for an email address or phone number without a required consent checkbox linking to a privacy policy. */
const lacksConsent = (form: FormDefinition) =>
  form.fields.some((field) => field.kind === "email" || field.kind === "phone") &&
  !form.fields.some(
    (field) => field.kind === "checkbox" && field.required && field.link !== undefined,
  );

const formIssues = (
  content: SiteContent,
  notified: ReadonlySet<FormId>,
): ReadonlyArray<CheckIssue> => {
  const used = new Set(
    placedBlocks(content).flatMap(({ blocks }) => Array.from(formsUsedBy(blocks))),
  );
  return Array.from(used).flatMap((id) => {
    const form = content.forms[id];
    if (form === undefined) return [];
    return [
      ...form.fields
        .filter((field) => blank(field.label))
        .map((field) => ({
          _tag: "UnlabelledField" as const,
          form: id,
          name: form.name,
          field: field.id,
        })),
      ...(notified.has(id) ? [] : [{ _tag: "NoFormEmails" as const, form: id, name: form.name }]),
      ...(lacksConsent(form)
        ? [{ _tag: "MissingConsent" as const, form: id, name: form.name }]
        : []),
    ];
  });
};

/** The library images a field's value shows. */
const mediaIn = (field: Field, value: Json | undefined): ReadonlyArray<MediaId> => {
  if (value === undefined) return [];
  if (field.kind === "media") return isMediaRef(value) ? [value.id] : [];
  if (field.kind !== "list" || !Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isJsonObject(item)
      ? Object.entries(field.item).flatMap(([name, itemField]) => mediaIn(itemField, item[name]))
      : [],
  );
};

/**
 * The pages a site serves: every page and collection that isn't unpublished,
 * and every published entry of a published collection.
 */
export const servedPages = (pages: SiteContent["pages"]): ReadonlyArray<ServedPage> =>
  listingsOf(pages).flatMap((listing) => {
    const document = pages[listing.id];
    if (document === undefined) throw new Error(`${listing.id} has a listing but no page.`);
    const collection = document.type === "entry" ? pages[document.collection] : undefined;
    return document.status === "unpublished" || collection?.status === "unpublished"
      ? []
      : [{ listing, document }];
  });

/** The blocks a site shows, placed on its served pages or in its header and footer. */
const placedBlocks = (
  content: SiteContent,
): ReadonlyArray<{
  readonly target: Target;
  readonly title: string;
  readonly blocks: Readonly<Record<BlockId, BlockInstance>>;
}> => [
  { target: "site", title: "Header and footer", blocks: content.parts.blocks },
  ...servedPages(content.pages).map(({ document }) => ({
    target: document.id,
    title: pageName(document),
    blocks: document.blocks,
  })),
];

/**
 * The library images a site's served pages, header and footer show, with its
 * brand's logos and icon. Built-in placeholder images need no file.
 */
export const shownMedia = (
  content: SiteContent,
  contracts: BlockContracts,
): ReadonlyArray<MediaId> => {
  const media = new Set<MediaId>();
  for (const { blocks } of placedBlocks(content))
    for (const block of Object.values(blocks)) {
      const fields = contracts.get(block.type)?.fields ?? {};
      for (const [name, field] of Object.entries(fields))
        for (const id of mediaIn(field, block.props[name])) media.add(id);
    }
  for (const { document } of servedPages(content.pages)) {
    if (document.type === "entry" && document.meta.cover) media.add(document.meta.cover.id);
    if (document.meta.image) media.add(document.meta.image.id);
  }
  for (const id of Object.values(content.brand.identity)) if (id !== null) media.add(id);
  for (const id of placeholderMedia.keys()) media.delete(id);
  return Array.from(media);
};

/**
 * Freezes a draft's content, or lists everything the checks found to fix.
 * `previous` is the manifest of the release now live, whose addresses stay
 * gone unless a page serves them again. `notified` holds the forms whose
 * entries the site's settings email to someone.
 */
export const freeze = (
  content: SiteContent,
  contracts: BlockContracts,
  previous: Pick<SnapshotManifest, "pages" | "gone">,
  notified: ReadonlySet<FormId>,
): FreezeResult => {
  const pages = servedPages(content.pages);
  const served = new Set(pages.map(({ document }) => document.id));
  const issues: ReadonlyArray<CheckIssue> = [
    ...placedBlocks(content).flatMap(({ target, title, blocks }) =>
      Object.entries(blocks).flatMap(([key, block]) => {
        const place = { target, title };
        const id = BlockId.make(key);
        return [
          ...incompleteIn(contracts, place, id, block).map((incomplete) => ({
            _tag: "Incomplete" as const,
            ...incomplete,
          })),
          ...placeholdersIn(contracts, place, id, block),
          ...brokenLinksIn(contracts, served, place, id, block),
          ...blankLinksIn(contracts, place, id, block),
        ];
      }),
    ),
    ...pages.flatMap(({ document }) =>
      (["title", "description"] as const)
        .filter((field) => document.meta[field].trim() === "")
        .map((field) => ({
          _tag: "MissingMeta" as const,
          place: { target: document.id, title: pageName(document) },
          field,
        })),
    ),
    ...brokenMenuLinks(served, "Main menu", content.parts.menus.main),
    ...brokenMenuLinks(served, "Footer menu", content.parts.menus.footer),
    ...blankMenuLinks("Main menu", content.parts.menus.main),
    ...blankMenuLinks("Footer menu", content.parts.menus.footer),
    ...brokenRedirects(served, content.redirects),
    ...formIssues(content, notified),
  ];
  if (issues.length > 0) return { ok: false, issues };

  const paths = new Set<string>(pages.map(({ listing }) => listing.path));
  const gone = Array.from(
    new Set([...previous.gone, ...previous.pages.map((page) => page.path)]),
  ).filter((path) => !paths.has(path));
  return { ok: true, frozen: { pages, gone, media: shownMedia(content, contracts) } };
};
