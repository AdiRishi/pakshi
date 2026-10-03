import type { BlockId } from "@repo/contracts/ids";
import type { PageDocument } from "@repo/contracts/page";
import type { SiteParts } from "@repo/contracts/site";
import type { Lockfile } from "@repo/contracts/snapshot";
import { Suspense } from "react";

import { type SiteData, SiteDataProvider } from "./components.tsx";
import { PlacedBlock } from "./render.tsx";

/**
 * A page as a site serves it: the header, the page's sections and the footer,
 * at the lockfile's block versions, with the site's data. In the browser,
 * each part hydrates as soon as its versions' code has loaded.
 */
export const SitePage = (props: {
  readonly site: SiteData;
  readonly page: PageDocument;
  readonly parts: SiteParts;
  readonly lockfile: Lockfile;
}) => {
  const placed = (blocks: PageDocument["blocks"], id: BlockId) => (
    <Suspense key={id}>
      <PlacedBlock blocks={blocks} id={id} lockfile={props.lockfile} />
    </Suspense>
  );
  return (
    <SiteDataProvider value={props.site}>
      {placed(props.parts.blocks, props.parts.header)}
      <main>{props.page.root.map((id) => placed(props.page.blocks, id))}</main>
      {placed(props.parts.blocks, props.parts.footer)}
    </SiteDataProvider>
  );
};

/**
 * The bar across the top of a preview, saying what it shows. It takes the
 * site's inverse surface, so it reads as apart from the page in any theme.
 */
export const PreviewBar = (options: {
  readonly title: string;
  readonly notes: ReadonlyArray<string>;
  readonly action: { readonly label: string; readonly href: string } | null;
}) => (
  <aside
    aria-label="Preview"
    data-surface="inverse"
    className="text-small flex flex-wrap items-center gap-x-6 gap-y-2 bg-background px-6 py-3 text-foreground"
  >
    <span className="font-semibold">{options.title}</span>
    {options.notes.map((note) => (
      <span key={note} className="text-muted-foreground">
        {note}
      </span>
    ))}
    {options.action !== null && (
      <a
        href={options.action.href}
        className="ml-auto rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {options.action.label}
      </a>
    )}
  </aside>
);
