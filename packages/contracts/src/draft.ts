import { ResolvedTheme } from "@repo/tokens";
import { Schema } from "effect";

import { FormDefinition } from "./form.ts";
import { DraftId, FormId, PageId, SiteId } from "./ids.ts";
import { PageDocument } from "./page.ts";
import { SiteParts, SiteSettings } from "./site.ts";
import { LiveRelease, Lockfile } from "./snapshot.ts";

/**
 * What a draft or a release holds of a site: every page, and the parts,
 * forms and settings every page shares, with the block versions and theme
 * they render with.
 *
 * The theme is the one resolved in the base release until brand revisions
 * exist, when drafts pin a revision instead.
 */
export const SiteContent = Schema.Struct({
  settings: SiteSettings,
  parts: SiteParts,
  forms: Schema.Record(FormId, FormDefinition),
  lockfile: Lockfile,
  theme: ResolvedTheme,
  pages: Schema.Record(PageId, PageDocument),
});
export type SiteContent = typeof SiteContent.Type;

/**
 * A draft of a site, as edit operations leave it. It records the release it
 * started from, and a revision that goes up with every batch `SiteDoc`
 * commits.
 */
export const Draft = Schema.Struct({
  id: DraftId,
  site: SiteId,
  base: LiveRelease,
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  ...SiteContent.fields,
});
export type Draft = typeof Draft.Type;

/** A draft's name, such as "Summer event launch" or "Fix the date". */
export const DraftName = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Give the draft a name" }),
  Schema.isMaxLength(80, { message: "Use at most 80 characters" }),
);
export type DraftName = typeof DraftName.Type;

/** A draft that's behind started from a release that's no longer live, so it must merge before it's published. */
export const isBehind = (base: LiveRelease, live: LiveRelease) => base.release !== live.release;
