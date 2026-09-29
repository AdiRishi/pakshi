import { type References, ReferencesProvider } from "@repo/blocks";
import type { ReactElement } from "react";

export const SitePage = (options: {
  readonly references: References;
  readonly sections: ReadonlyArray<ReactElement>;
}) => <ReferencesProvider value={options.references}>{options.sections}</ReferencesProvider>;
