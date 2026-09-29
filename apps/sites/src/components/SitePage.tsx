import { type SiteData, SiteDataProvider } from "@repo/blocks";
import type { ReactElement } from "react";

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
