import type { BrandIdentity } from "@repo/contracts/brand";
import { collectionKinds } from "@repo/contracts/collections";
import type { FormDefinition } from "@repo/contracts/form";
import type { FormId, MediaId } from "@repo/contracts/ids";
import type { Link } from "@repo/contracts/references";
import type { PublishedSettings } from "@repo/contracts/settings";
import type { Menus } from "@repo/contracts/site";
import type { PageListing } from "@repo/contracts/snapshot";
import { Order, Predicate } from "effect";

import type { ResolvedMedia, SiteData } from "./components.tsx";
import { placeholderForm, placeholderMedia } from "./placeholders.ts";

const newestFirst = Order.mapInput(
  collectionKinds.blog.order,
  (post: Extract<PageListing, { type: "entry" }>) => post.meta,
);

/**
 * Builds what blocks read beyond their props from a site's settings, menus,
 * pages, forms and media. Placeholder images and the placeholder form resolve
 * on every site.
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
    posts: site.pages
      .flatMap((page) => (page.type === "entry" ? [page] : []))
      .toSorted(newestFirst)
      .map((post) => ({
        id: post.id,
        href: post.path,
        title: post.meta.title,
        excerpt: post.meta.excerpt,
        date: post.meta.date,
        author: post.meta.author,
        cover: post.meta.cover,
      })),
    media: (id) => placeholderMedia.get(id) ?? site.media(id),
    pagePath: (id) => paths.get(id),
    form: (id) => site.forms[id] ?? (id === placeholderForm.id ? placeholderForm : undefined),
    preview: null,
    sent: null,
  };
};
