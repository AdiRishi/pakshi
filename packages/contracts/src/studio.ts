import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";

import { Draft, DraftName } from "./draft.ts";
import { DraftId, MediaId, PageId, ReleaseId, SiteId } from "./ids.ts";
import { Collaborator } from "./live.ts";
import { Conflict, MergedChange, Resolutions } from "./merge.ts";
import { Batch, BatchError } from "./ops.ts";
import { PagePath } from "./page.ts";
import { Incomplete } from "./publishing.ts";
import { Release, Timestamp } from "./release.ts";
import { LiveRelease, MediaFile } from "./snapshot.ts";

/** Better Auth's ID for the organization's identity provider, used by sign-in on both sides. */
export const identityProviderId = "organization";

/** The person a Studio request is made for. */
export const Person = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  email: Schema.String,
});
export type Person = typeof Person.Type;

/** Nobody is signed in, or their session has expired. */
export class Unauthenticated extends Schema.TaggedError<Unauthenticated>()("Unauthenticated", {}) {}

/** studio-api couldn't reach its storage. The caller may try again. */
export class StudioUnavailable extends Schema.TaggedError<StudioUnavailable>()(
  "StudioUnavailable",
  { operation: Schema.String },
) {}

/** The signed-in person, which every Studio handler can read. */
export class SignedIn extends Context.Service<SignedIn, Person>()("Pakshi/SignedIn") {}

/**
 * Checks the session cookie Studio forwards and provides the signed-in person.
 * Handlers never take the person or the cookie as an argument.
 */
export class StudioSession extends RpcMiddleware.Service<StudioSession, { provides: SignedIn }>()(
  "Pakshi/StudioSession",
  { error: Schema.Union([Unauthenticated, StudioUnavailable]) },
) {}

/** The headers Studio forwards on every call, for the session middleware. */
export const studioSessionHeaders = { cookie: "cookie", origin: "x-studio-origin" } as const;

export const Viewer = Schema.Struct({
  user: Person,
  roles: Schema.Array(Schema.Struct({ role: Schema.String, scope: Schema.String })),
  sites: Schema.Array(Schema.Struct({ id: SiteId, name: Schema.String, brand: Schema.String })),
});
export type Viewer = typeof Viewer.Type;

/**
 * There's no site with this ID that the person may work on. A site they can't
 * reach looks the same as one that doesn't exist, so IDs reveal nothing.
 */
export class SiteNotFound extends Schema.TaggedError<SiteNotFound>()("SiteNotFound", {
  site: SiteId,
}) {}

/** An image in a site's library, with the alt text suggested for new placements. */
export const MediaSummary = Schema.Struct({
  id: MediaId,
  ...MediaFile.fields,
  alt: Schema.String,
});
export type MediaSummary = typeof MediaSummary.Type;

export const PageSummary = Schema.Struct({
  id: PageId,
  type: Schema.Literals(["page", "post"]),
  path: PagePath,
  title: Schema.String,
});
export type PageSummary = typeof PageSummary.Type;

/** Whether a draft takes changes: open, published, or closed by someone without publishing. */
export const DraftStatus = Schema.Literals(["open", "published", "closed"]);
export type DraftStatus = typeof DraftStatus.Type;

/** A draft as the drafts list shows it. */
export const DraftSummary = Schema.Struct({
  id: DraftId,
  name: DraftName,
  status: DraftStatus,
  /** The release the draft started from, or was last updated to. */
  base: LiveRelease,
  createdBy: Collaborator,
  createdAt: Timestamp,
  /** The latest change, or null when no one has changed the draft yet. */
  lastEdit: Schema.NullOr(Schema.Struct({ by: Collaborator, at: Timestamp })),
  /** Everyone who has changed the draft. */
  people: Schema.Array(Collaborator),
  /** When the draft was published or closed. */
  closedAt: Schema.NullOr(Timestamp),
});
export type DraftSummary = typeof DraftSummary.Type;

/** What the person may do on the site, beyond editing its drafts. */
export const SiteAbilities = Schema.Struct({ publish: Schema.Boolean, rollBack: Schema.Boolean });
export type SiteAbilities = typeof SiteAbilities.Type;

const SiteName = Schema.Struct({ id: SiteId, name: Schema.String });

/** A site's drafts, with the release that's live. */
export const SiteDrafts = Schema.Struct({
  site: SiteName,
  live: Release,
  drafts: Schema.Array(DraftSummary),
  can: SiteAbilities,
});
export type SiteDrafts = typeof SiteDrafts.Type;

/** A draft's pages and posts. */
export const DraftPages = Schema.Struct({
  site: SiteName,
  live: LiveRelease,
  draft: DraftSummary,
  pages: Schema.Array(PageSummary),
  can: SiteAbilities,
});
export type DraftPages = typeof DraftPages.Type;

/**
 * What opening a draft in the editor gives: the draft and the images it can
 * place, or word that it's behind with conflicts to settle first. A draft
 * behind whose merge is clean is updated on the way.
 */
export const OpenedDraft = Schema.TaggedUnion({
  Ready: {
    draft: Draft,
    summary: DraftSummary,
    live: LiveRelease,
    media: Schema.Array(MediaSummary),
    can: SiteAbilities,
  },
  NeedsUpdate: {},
});
export type OpenedDraft = typeof OpenedDraft.Type;

/**
 * What became of a batch. A committed batch took the draft to `revision`; a
 * batch sent again reports the revision it committed at the first time.
 */
export const BatchOutcome = Schema.Union([
  Schema.Struct({ status: Schema.Literal("committed"), revision: Schema.Int }),
  Schema.Struct({ status: Schema.Literal("rejected"), errors: Schema.Array(BatchError) }),
]);
export type BatchOutcome = typeof BatchOutcome.Type;

/** A behind draft's update, as it stands with the sides chosen so far. */
export const DraftUpdate = Schema.Struct({
  site: SiteName,
  draft: DraftSummary,
  /** The release the draft started from, and the one it's being brought up to. */
  from: Release,
  to: Release,
  conflicts: Schema.Array(Conflict),
  changes: Schema.Array(MergedChange),
});
export type DraftUpdate = typeof DraftUpdate.Type;

export const UpdateOutcome = Schema.TaggedUnion({
  /** The draft now starts from the live release. */
  Updated: {},
  /** Conflicts still need a side. The live site may have moved on, so these are current. */
  Unresolved: { conflicts: Schema.Array(Conflict) },
});
export type UpdateOutcome = typeof UpdateOutcome.Type;

export const PublishOutcome = Schema.TaggedUnion({
  Published: { release: Release },
  /** Fields still incomplete. Nothing was published. */
  Incomplete: { incomplete: Schema.Array(Incomplete) },
  /** The draft is behind, and merging the live release needs a person. */
  NeedsUpdate: {},
});
export type PublishOutcome = typeof PublishOutcome.Type;

/** A site's releases, newest first. */
export const SiteReleases = Schema.Struct({
  site: SiteName,
  releases: Schema.Array(Release),
  can: SiteAbilities,
});
export type SiteReleases = typeof SiteReleases.Type;

/** No open draft on the site has this ID. */
export class DraftNotFound extends Schema.TaggedError<DraftNotFound>()("DraftNotFound", {
  draft: DraftId,
}) {}

/** The person may work on the site, but not do this. */
export class NotPermitted extends Schema.TaggedError<NotPermitted>()("NotPermitted", {
  action: Schema.String,
}) {}

/** Only the latest publish can be rolled back, and only when a release was live before it. */
export class NothingToRollBack extends Schema.TaggedError<NothingToRollBack>()(
  "NothingToRollBack",
  {},
) {}

/** The site has no release with this ID. */
export class ReleaseNotFound extends Schema.TaggedError<ReleaseNotFound>()("ReleaseNotFound", {
  release: ReleaseId,
}) {}

const siteError = Schema.Union([StudioUnavailable, SiteNotFound]);
const draftError = Schema.Union([StudioUnavailable, SiteNotFound, DraftNotFound]);
const forDraft = { site: SiteId, draft: DraftId };

/** Everything Studio asks of studio-api. */
export class StudioRpcs extends RpcGroup.make(
  Rpc.make("viewer", { success: Viewer, error: StudioUnavailable }),
  Rpc.make("siteDrafts", { payload: { site: SiteId }, success: SiteDrafts, error: siteError }),
  Rpc.make("createDraft", {
    payload: { site: SiteId, name: DraftName },
    success: DraftSummary,
    error: siteError,
  }),
  Rpc.make("renameDraft", { payload: { ...forDraft, name: DraftName }, error: draftError }),
  Rpc.make("closeDraft", { payload: forDraft, error: draftError }),
  Rpc.make("draftPages", { payload: forDraft, success: DraftPages, error: draftError }),
  Rpc.make("openDraft", { payload: forDraft, success: OpenedDraft, error: draftError }),
  Rpc.make("applyBatch", {
    payload: { ...forDraft, batch: Batch },
    success: BatchOutcome,
    error: draftError,
  }),
  Rpc.make("draftUpdate", {
    payload: { ...forDraft, resolutions: Resolutions },
    success: DraftUpdate,
    error: draftError,
  }),
  Rpc.make("updateDraft", {
    payload: { ...forDraft, resolutions: Resolutions },
    success: UpdateOutcome,
    error: draftError,
  }),
  Rpc.make("publishDraft", {
    payload: forDraft,
    success: PublishOutcome,
    error: Schema.Union([StudioUnavailable, SiteNotFound, DraftNotFound, NotPermitted]),
  }),
  Rpc.make("siteReleases", { payload: { site: SiteId }, success: SiteReleases, error: siteError }),
  Rpc.make("rollBack", {
    payload: { site: SiteId },
    success: Release,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted, NothingToRollBack]),
  }),
  Rpc.make("restoreRelease", {
    payload: { site: SiteId, release: ReleaseId, name: DraftName },
    success: DraftSummary,
    error: Schema.Union([StudioUnavailable, SiteNotFound, ReleaseNotFound]),
  }),
).middleware(StudioSession) {}
