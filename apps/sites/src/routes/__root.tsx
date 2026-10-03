import { HeadContent, Scripts, createRootRoute, useMatch } from "@tanstack/react-router";
import type { ReactNode } from "react";

import siteCss from "@repo/blocks/site.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
    ],
    links: [{ rel: "stylesheet", href: siteCss }],
  }),
  shellComponent: Document,
});

function Document({ children }: { readonly children: ReactNode }) {
  // A page with nothing interactive is only its HTML: it loads no scripts and never hydrates.
  const page = useMatch({ from: "/$", shouldThrow: false });
  const runs = page?.loaderData?.kind === "page" && page.loaderData.interactive.length > 0;
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {runs && <Scripts />}
      </body>
    </html>
  );
}
