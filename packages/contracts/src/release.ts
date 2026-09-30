import { Schema } from "effect";

import { DraftId, ReleaseId, SnapshotId } from "./ids.ts";
import { Collaborator } from "./live.ts";
import type { LiveRelease } from "./snapshot.ts";

/**
 * A moment as an ISO 8601 string in UTC. Values cross Durable Object RPC by
 * structured clone, which keeps strings but not the prototypes of date types.
 */
export const Timestamp = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/),
).pipe(Schema.brand("Timestamp"));
export type Timestamp = typeof Timestamp.Type;

export const now = () => Timestamp.make(new Date().toISOString());

const releaseFields = {
  id: ReleaseId,
  snapshot: SnapshotId,
  at: Timestamp,
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
    /** Who made it live: whoever gave the final approval, or submitted it when no one had to. */
    by: Collaborator,
    draft: Schema.Struct({ id: DraftId, name: Schema.String }),
    submittedBy: Collaborator,
    approvedBy: Schema.Array(Collaborator),
  },
  RolledBack: { ...releaseFields, by: Collaborator, undid: ReleaseId },
});
export type Release = typeof Release.Type;

/** The value KV and drafts keep for a release: its ID and the snapshot it serves. */
export const liveReleaseOf = (release: Release): LiveRelease => ({
  release: release.id,
  snapshot: release.snapshot,
});
