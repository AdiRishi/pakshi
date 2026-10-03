import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { renderToStaticMarkup } from "react-dom/server";

import appCss from "@repo/ui/globals.css?url";

const doctype = "<!doctype html>";

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
    { status: page.status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
