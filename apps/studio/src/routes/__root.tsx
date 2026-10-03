import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Toaster } from "@repo/ui/components/sonner";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { type QueryClient } from "@tanstack/react-query";
import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
  useMatches,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { useEffect } from "react";

import { themeScript, useTheme } from "@/lib/theme";

import siteCss from "@repo/blocks/site.css?url";
import appCss from "@repo/ui/globals.css?url";

/** The routes that show a page of a site rather than Studio: a draft's preview and a review. */
const sitePages = new Set(["/preview/$siteId/$draftId/$", "/review/$siteId/$submissionId/$"]);

const studioHead = {
  meta: [
    { charSet: "utf-8" },
    { name: "viewport", content: "width=device-width, initial-scale=1" },
    { title: "Pakshi" },
  ],
  links: [
    { rel: "stylesheet", href: appCss },
    // Pakshi's icons are served from public/, which links to @repo/brand's files.
    { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
    { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    { rel: "manifest", href: "/manifest.webmanifest" },
  ],
  scripts: [{ children: themeScript }],
};

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: ({ matches }) =>
    matches.some((match) => sitePages.has(match.routeId))
      ? {
          meta: [
            { charSet: "utf-8" },
            { name: "viewport", content: "width=device-width, initial-scale=1" },
          ],
          links: [{ rel: "stylesheet", href: siteCss }],
        }
      : studioHead,
  shellComponent: RootDocument,
  notFoundComponent: function NotFound() {
    return (
      <Empty className="min-h-screen">
        <EmptyHeader>
          <EmptyTitle>Nothing here</EmptyTitle>
          <EmptyDescription>There's nothing at this address.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Go to Studio
          </Link>
        </EmptyContent>
      </Empty>
    );
  },
});

function RootDocument({ children }: { readonly children: React.ReactNode }) {
  const sitePage = useMatches({
    select: (matches) => matches.some((match) => sitePages.has(match.routeId)),
  });
  return sitePage ? (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ) : (
    <StudioDocument>{children}</StudioDocument>
  );
}

function StudioDocument({ children }: { readonly children: React.ReactNode }) {
  // Marks the page once React has taken it over, so browser tests act on a
  // page whose controls respond.
  useEffect(() => {
    document.documentElement.dataset["hydrated"] = "";
  }, []);
  const { resolved } = useTheme();
  return (
    // The theme script sets the html element's class before React hydrates it.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Toaster theme={resolved} />
        <TanStackDevtools
          config={{ position: "bottom-right" }}
          plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }]}
        />
        <Scripts />
      </body>
    </html>
  );
}
