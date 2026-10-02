import type { BrandIdentity } from "@repo/contracts/brand";
import { collectionKinds } from "@repo/contracts/collections";
import type { FormDefinition } from "@repo/contracts/form";
import type { FormId, MediaId, PageId } from "@repo/contracts/ids";
import type { Link } from "@repo/contracts/references";
import type { PublishedSettings } from "@repo/contracts/settings";
import type { Menus } from "@repo/contracts/site";
import type { PageListing } from "@repo/contracts/snapshot";
import { Order, Predicate } from "effect";

import type { ResolvedMedia, SiteCollection, SiteData } from "./components.tsx";
import {
  placeholderCollection,
  placeholderForm,
  placeholderMedia,
  samplePosts,
} from "./placeholders.ts";

type Entry = Extract<PageListing, { readonly type: "entry" }>;

/** The site's collections with their entries, and the placeholder collection with its samples. */
const collectionsOf = (pages: ReadonlyArray<PageListing>) => {
  const entries = Map.groupBy(
    pages.filter((page): page is Entry => page.type === "entry"),
    (entry) => entry.collection,
  );
  const collections = new Map<PageId, SiteCollection>(
    pages.flatMap((page) => {
      if (page.type !== "collection") return [];
      const order = Order.mapInput(collectionKinds[page.kind].order, (entry: Entry) => entry.meta);
      const held = (entries.get(page.id) ?? [])
        .toSorted(order)
        .map((entry) => ({ id: entry.id, href: entry.path, meta: entry.meta }));
      return [[page.id, { id: page.id, href: page.path, title: page.meta.title, entries: held }]];
    }),
  );
  return collections.set(placeholderCollection, {
    id: placeholderCollection,
    href: "#",
    title: "Sample posts",
    entries: samplePosts,
  });
};

/**
 * Builds what blocks read beyond their props from a site's settings, menus,
 * pages, forms and media. Placeholder images, the placeholder form and the
 * placeholder blog resolve on every site. It shows no page in particular;
 * a caller showing one sets `current`.
 */
export const siteData = (site: {
  readonly settings: PublishedSettings;
  readonly identity: BrandIdentity;
  readonly menus: Menus;
  readonly pages: ReadonlyArray<PageListing>;
  readonly forms: Readonly<Record<FormId, FormDefinition>>;
  readonly media: (id: MediaId) => ResolvedMedia | undefined;
}): SiteData => {
  const paths = new Map(site.pages.map((page) => [page.id, page.path]));
  const href = (link: Link) => (Predicate.isString(link) ? link : (paths.get(link.id) ?? "#"));
  const resolve = (item: Menus["footer"][number]) => ({
    id: item.id,
    label: item.label,
    href: href(item.target),
  });
  const logo = site.identity.logo === null ? undefined : site.media(site.identity.logo);
  const logoOnDark =
    site.identity.logoOnDark === null ? undefined : site.media(site.identity.logoOnDark);
  return {
    name: site.settings.name,
    logo: logo === undefined ? null : { light: logo, onDark: logoOnDark ?? null },
    menus: {
      main: site.menus.main.map((item) => ({
        ...resolve(item),
        children: (item.children ?? []).map(resolve),
      })),
      footer: site.menus.footer.map((item) => ({ ...resolve(item), children: [] })),
    },
    collections: collectionsOf(site.pages),
    media: (id) => placeholderMedia.get(id) ?? site.media(id),
    pagePath: (id) => paths.get(id),
    form: (id) => site.forms[id] ?? (id === placeholderForm.id ? placeholderForm : undefined),
    preview: null,
    sent: null,
    current: null,
  };
};
