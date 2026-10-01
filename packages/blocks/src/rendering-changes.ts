import { Schema } from "effect";

import log from "./rendering-changes.json" with { type: "json" };

/**
 * A change to how released block versions look on live sites, made by a
 * shared dependency or shared code rather than a new version. The platform
 * team records one whenever it accepts changed screenshots of a released
 * version, and Studio shows it to the sites that use those versions.
 */
export const RenderingChange = Schema.Struct({
  date: Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/)),
  /** The versions whose screenshots changed, as `hero@1`. */
  versions: Schema.Array(Schema.String.check(Schema.isPattern(/^[a-z][a-z0-9-]*@\d+$/))),
  /** What changed and why, for the people who run the sites. */
  change: Schema.String.check(Schema.isMinLength(1)),
});
export type RenderingChange = typeof RenderingChange.Type;

/** Every accepted change to released versions' output, oldest first. */
export const renderingChanges = Schema.decodeSync(Schema.Array(RenderingChange))(log);
