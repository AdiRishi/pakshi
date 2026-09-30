import { Schema } from "effect";

import { DraftId, ReleaseId, SnapshotId } from "./ids.ts";
import { Collaborator } from "./live.ts";
import type { LiveRelease } from "./snapshot.ts";

const releaseFields = {
  id: ReleaseId,
  snapshot: SnapshotId,
  at: Schema.DateTimeUtcFromString,
};

/**
 * One change to what a site serves, newest last in its history. Every release
 * is kept. The latest is live; a rollback is a release of the snapshot that
 * was live before the publish it undid.
 */
export const Release = Schema.TaggedUnion({
  /** A snapshot the site was already serving when its SiteDoc first started. */
  Imported: releaseFields,
  Published: {
    ...releaseFields,
    by: Collaborator,
    draft: Schema.Struct({ id: DraftId, name: Schema.String }),
  },
  RolledBack: { ...releaseFields, by: Collaborator, undid: ReleaseId },
});
export type Release = typeof Release.Type;

/** The value KV and drafts keep for a release: its ID and the snapshot it serves. */
export const liveReleaseOf = (release: Release): LiveRelease => ({
  release: release.id,
  snapshot: release.snapshot,
});
