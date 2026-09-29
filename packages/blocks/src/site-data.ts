import type { FormDefinition } from "@repo/contracts/form";
import type { FormId, MediaId, PageId } from "@repo/contracts/ids";
import type { PageMeta, PagePath, PostMeta } from "@repo/contracts/page";
import type { Link } from "@repo/contracts/references";
import type { Menus, SiteSettings } from "@repo/contracts/site";
import { Order, Predicate } from "effect";

import type { PostSummary, ResolvedMedia, SiteData } from "./components.tsx";

/** What `siteData` needs of a page: a snapshot's page entry and a draft's page both have it. */
export type PageEntry =
  | {
      readonly id: PageId;
      readonly path: PagePath;
      readonly type: "page";
      readonly meta: PageMeta;
    }
  | {
      readonly id: PageId;
      readonly path: PagePath;
      readonly type: "post";
      readonly meta: PostMeta;
    };

const newestFirst = Order.combine(
  Order.flip(Order.mapInput(Order.String, (post: PostSummary) => post.date)),
  Order.mapInput(Order.String, (post: PostSummary) => post.title),
);

/** Builds what blocks read beyond their props from a site's settings, menus, pages, forms and media. */
export const siteData = (site: {
  readonly settings: SiteSettings;
  readonly menus: Menus;
  readonly pages: ReadonlyArray<PageEntry>;
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
  return {
    name: site.settings.name,
    menus: {
      main: site.menus.main.map((item) => ({
        ...resolve(item),
        children: (item.children ?? []).map(resolve),
      })),
      footer: site.menus.footer.map((item) => ({ ...resolve(item), children: [] })),
    },
    posts: site.pages
      .flatMap((page) =>
        page.type === "post"
          ? [
              {
                id: page.id,
                href: page.path,
                title: page.meta.title,
                excerpt: page.meta.excerpt,
                date: page.meta.date,
                author: page.meta.author,
                cover: page.meta.cover,
              },
            ]
          : [],
      )
      .toSorted(newestFirst),
    media: site.media,
    pagePath: (id) => paths.get(id),
    form: (id) => site.forms[id],
  };
};
