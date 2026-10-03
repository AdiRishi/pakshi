import type { BrandIdentity } from "@repo/contracts/brand";
import { entriesOf } from "@repo/contracts/collections";
import type { FormDefinition } from "@repo/contracts/form";
import type { FormId, MediaId, PageId } from "@repo/contracts/ids";
import type { Link } from "@repo/contracts/references";
import type { PublishedSettings } from "@repo/contracts/settings";
import type { Menus } from "@repo/contracts/site";
import type { PageListing } from "@repo/contracts/snapshot";
import { Predicate } from "effect";

import type { ResolvedMedia, SiteCollection, SiteData } from "./components.tsx";
import {
  placeholderCollection,
  placeholderForm,
  placeholderMedia,
  samplePosts,
} from "./placeholders.ts";

/** The site's collections with their entries, and the placeholder collection with its samples. */
const collectionsOf = (pages: ReadonlyArray<PageListing>, address: (path: string) => string) => {
  const collections = new Map<PageId, SiteCollection>(
    pages.flatMap((page) => {
      if (page.type !== "collection") return [];
      const held = entriesOf(pages, page).map((entry) => ({
        id: entry.id,
        href: address(entry.path),
        meta: entry.meta,
      }));
      return [
        [
          page.id,
          {
            id: page.id,
            href: address(page.path),
            pageHref: (number: number) =>
              address(number === 1 ? page.path : `${page.path}?page=${number}`),
            title: page.meta.title,
            entries: held,
          },
        ],
      ];
    }),
  );
  return collections.set(placeholderCollection, {
    id: placeholderCollection,
    href: "#",
    pageHref: () => "#",
    title: "Sample posts",
    entries: samplePosts,
  });
};

/**
 * Builds what blocks read beyond their props from a site's settings, menus,
 * pages, forms and media. Placeholder images, the placeholder form and the
 * placeholder blog resolve on every site. It shows no page in particular,
 * and moves as a theme with motion does; a caller showing one sets `current`,
 * and a caller with the theme sets `motion`.
 */
export const siteData = (site: {
  readonly settings: PublishedSettings;
  readonly identity: BrandIdentity;
  readonly menus: Menus;
  readonly pages: ReadonlyArray<PageListing>;
  readonly forms: Readonly<Record<FormId, FormDefinition>>;
  readonly media: (id: MediaId) => ResolvedMedia | undefined;
  /**
   * Where a link to an address on the site opens, such as a page's address
   * inside a preview. A live site's links open where they point.
   */
  readonly address?: (path: string) => string;
}): SiteData => {
  const address = site.address ?? ((path: string) => path);
  const paths = new Map(site.pages.map((page) => [page.id, address(page.path)]));
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
    collections: collectionsOf(site.pages, address),
    media: (id) => placeholderMedia.get(id) ?? site.media(id),
    pagePath: (id) => paths.get(id),
    form: (id) => site.forms[id] ?? (id === placeholderForm.id ? placeholderForm : undefined),
    preview: null,
    sent: null,
    current: null,
    motion: true,
    address,
  };
};
