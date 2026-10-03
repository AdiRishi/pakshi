import { PreviewBar, SitePage } from "@repo/blocks";
import { mediaSegment } from "@repo/contracts/studio";
import { themeCss } from "@repo/tokens";
import { useMemo } from "react";

import { reviewLink } from "./address";
import type { ShownPreviewData } from "./functions";
import { viewData } from "./view-data";

/** The outline that marks a block a submission changed, in a review. */
export const changedCss =
  "[data-pakshi-changed]{outline:3px solid var(--ring);outline-offset:-3px}";

/**
 * A page of a draft or a submission as its site would show it, with the same
 * blocks and theme as `sites`. Its images load from
 * under the preview's address, and its links to the site's pages stay inside
 * the preview.
 */
export function PreviewDocument({ data }: { readonly data: ShownPreviewData }) {
  const { view, base, review, changed, number } = data;
  const site = useMemo(
    () => ({
      ...viewData(view, {
        number,
        src: (id) => `${base}/${mediaSegment}/${id}`,
        address: review === null ? (path) => `${base}${path}` : reviewLink(base, review),
      }),
      preview: { changed: new Set(changed) },
    }),
    [view, base, review, changed, number],
  );
  return (
    <>
      {data.bar !== null && <PreviewBar {...data.bar} />}
      {view.page === null ? (
        <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
          <h1 className="text-title">Page not found</h1>
          <p className="text-lead text-muted-foreground">There's no page at this address.</p>
          <a className="text-link underline" href={site.address("/")}>
            Go to the home page
          </a>
        </main>
      ) : (
        <SitePage site={site} page={view.page} parts={view.parts} lockfile={view.lockfile} />
      )}
    </>
  );
}

/** The head of a previewed page: its title, the theme, and nothing that indexes or caches it. */
export const previewHead = (data: ShownPreviewData | undefined) => {
  if (data === undefined) return {};
  const { view, base, changed } = data;
  const title = view.page?.meta.title ?? "Page not found";
  return {
    meta: [
      { title: title === view.settings.name ? title : `${title} · ${view.settings.name}` },
      { name: "robots", content: "noindex, nofollow" },
      ...(view.page === null ? [] : [{ name: "description", content: view.page.meta.description }]),
    ],
    links:
      view.brand.identity.favicon === null
        ? []
        : [{ rel: "icon", href: `${base}/${mediaSegment}/${view.brand.identity.favicon}` }],
    styles: [
      { children: themeCss(view.brand.theme) },
      ...(changed.length > 0 ? [{ children: changedCss }] : []),
    ],
  };
};
