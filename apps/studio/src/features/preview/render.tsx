import { PreviewBar, renderPage, SitePage, siteData } from "@repo/blocks";
import type { BlockId, MediaId } from "@repo/contracts/ids";
import { mediaSegment, type SiteView } from "@repo/contracts/studio";
import { themeCss } from "@repo/tokens";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { renderToStaticMarkup } from "react-dom/server";

import siteCss from "@repo/blocks/site.css?url";
import appCss from "@repo/ui/globals.css?url";

/**
 * Previews and reviews are never cached, indexed or told where they were
 * opened from: each request checks access again, and a draft's address
 * shouldn't leave in a Referer header.
 */
const privateHeaders = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex, nofollow",
};

const doctype = "<!doctype html>";

/**
 * Pages link to each other, and frozen block versions to the home page, by
 * their address on the site. Inside a preview those addresses sit under the
 * preview's own, so `address` says where each goes. React writes every
 * attribute as `name="value"` and escapes quotes in text, so this finds
 * link addresses only.
 */
const linksTo = (markup: string, address: (path: string) => string) =>
  markup.replaceAll(/ href="(\/[^"]*)"/g, (_, path: string) => ` href="${address(path)}"`);

/**
 * A page of a site as its own document, rendered with the same blocks and
 * theme as `sites`. Its images load from under `base`, and `address` says
 * where each of its links to the site's pages goes.
 */
export const siteDocument = async (
  view: SiteView,
  options: {
    readonly base: string;
    readonly address: (path: string) => string;
    readonly bar: Parameters<typeof PreviewBar>[0] | null;
    /** Blocks to mark as changed, for a review. */
    readonly changed: ReadonlyArray<BlockId>;
  },
) => {
  const data = {
    ...siteData({
      settings: view.settings,
      identity: view.brand.identity,
      menus: view.parts.menus,
      pages: view.pages,
      forms: view.forms,
      media: (id: MediaId) => {
        const file = view.media[id];
        return file === undefined
          ? undefined
          : {
              src: `${options.base}/${mediaSegment}/${id}`,
              width: file.width,
              height: file.height,
            };
      },
    }),
    preview: { changed: new Set(options.changed) },
  };
  const page = view.page;
  const rendered = page === null ? null : await renderPage(page, view.parts, view.lockfile);
  const title = page?.meta.title ?? "Page not found";
  const head = renderToStaticMarkup(
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="robots" content="noindex, nofollow" />
      <title>{title === view.settings.name ? title : `${title} · ${view.settings.name}`}</title>
      {page !== null && <meta name="description" content={page.meta.description} />}
      {view.brand.identity.favicon !== null && (
        <link rel="icon" href={`${options.base}/${mediaSegment}/${view.brand.identity.favicon}`} />
      )}
      <style>{themeCss(view.brand.theme)}</style>
      <link rel="stylesheet" href={siteCss} />
      {options.changed.length > 0 && (
        <style>{"[data-pakshi-changed]{outline:3px solid var(--ring);outline-offset:-3px}"}</style>
      )}
    </head>,
  );
  const bar = options.bar === null ? "" : renderToStaticMarkup(<PreviewBar {...options.bar} />);
  const body =
    rendered === null
      ? renderToStaticMarkup(
          <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6">
            <h1 className="text-title">Page not found</h1>
            <p className="text-lead text-muted-foreground">There's no page at this address.</p>
            <a className="text-primary underline" href="/">
              Go to the home page
            </a>
          </main>,
        )
      : renderToStaticMarkup(
          <SitePage
            site={data}
            header={rendered.header}
            sections={rendered.sections}
            footer={rendered.footer}
          />,
        );
  return new Response(
    `${doctype}<html lang="en">${head}<body>${bar}${linksTo(body, options.address)}</body></html>`,
    { status: page === null ? 404 : 200, headers: privateHeaders },
  );
};

/**
 * Studio's answer for a preview or review that isn't there, isn't open to
 * the visitor, or has changed. Its action opens in the whole window, since a
 * review shows in a frame.
 */
export const unavailableDocument = (page: {
  readonly title: string;
  readonly description: string;
  readonly status: number;
  readonly action: { readonly label: string; readonly href: string };
}) =>
  new Response(
    doctype +
      renderToStaticMarkup(
        <html lang="en">
          <head>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <meta name="robots" content="noindex, nofollow" />
            <title>{`${page.title} · Pakshi`}</title>
            <link rel="stylesheet" href={appCss} />
          </head>
          <body>
            <Empty className="min-h-screen">
              <EmptyHeader>
                <EmptyTitle>
                  <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
                </EmptyTitle>
                <EmptyDescription>{page.description}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <a
                  href={page.action.href}
                  target="_top"
                  className={buttonVariants({ variant: "outline" })}
                >
                  {page.action.label}
                </a>
              </EmptyContent>
            </Empty>
          </body>
        </html>,
      ),
    { status: page.status, headers: privateHeaders },
  );
