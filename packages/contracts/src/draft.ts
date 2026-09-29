import { ResolvedTheme } from "@repo/tokens";
import { Schema } from "effect";

import { FormDefinition } from "./form.ts";
import { DraftId, FormId, PageId, SiteId } from "./ids.ts";
import { PageDocument } from "./page.ts";
import { SiteParts, SiteSettings } from "./site.ts";
import { LiveRelease, Lockfile } from "./snapshot.ts";

/**
 * A draft of a site: every page, the site-level parts and forms, as edit
 * operations leave them. It records the release it started from, and a
 * revision that goes up with every batch `SiteDoc` commits.
 *
 * The theme is the one resolved in the base release until brand revisions
 * exist, when drafts pin a revision instead.
 */
export const Draft = Schema.Struct({
  id: DraftId,
  site: SiteId,
  base: LiveRelease,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  settings: SiteSettings,
  parts: SiteParts,
  forms: Schema.Record(FormId, FormDefinition),
  lockfile: Lockfile,
  theme: ResolvedTheme,
  pages: Schema.Record(PageId, PageDocument),
});
export type Draft = typeof Draft.Type;
