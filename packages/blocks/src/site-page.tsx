import type { ReactElement } from "react";

import { type SiteData, SiteDataProvider } from "./components.tsx";

/** A page as a site serves it: the header, the page's sections and the footer, with the site's data. */
export const SitePage = (options: {
  readonly site: SiteData;
  readonly header: ReactElement;
  readonly sections: ReadonlyArray<ReactElement>;
  readonly footer: ReactElement;
}) => (
  <SiteDataProvider value={options.site}>
    {options.header}
    <main>{options.sections}</main>
    {options.footer}
  </SiteDataProvider>
);

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
