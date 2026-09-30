import { ResolvedTheme } from "@repo/tokens";
import { Context, Schema } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";

import { Scope } from "./access.ts";
import { Draft, DraftName } from "./draft.ts";
import { FormDefinition } from "./form.ts";
import {
  BlockId,
  DraftId,
  FormId,
  MediaId,
  PageId,
  ReleaseId,
  SiteId,
  SnapshotId,
  SubmissionId,
} from "./ids.ts";
import { Collaborator } from "./live.ts";
import { Conflict, ConflictKey, MergedChange, Resolutions } from "./merge.ts";
import { Batch, BatchError } from "./ops.ts";
import { PageDocument, PagePath } from "./page.ts";
import { PreflightIssue } from "./publishing.ts";
import { Release, Timestamp } from "./release.ts";
import { DraftSharing, ShareAccess } from "./sharing.ts";
import { SiteParts, SiteSettings } from "./site.ts";
import { LiveRelease, Lockfile, MediaFile, PageListing } from "./snapshot.ts";
import { Submission } from "./submission.ts";
import { Workflow } from "./workflow.ts";

/**
 * Where Studio serves a draft's preview, at `${previewBasePath}/{site}/{draft}/{page path}`,
 * and a submission for its approvers, at `${reviewBasePath}/{site}/{submission}/{page path}`.
 * Each serves its images under its own `/${mediaSegment}/{media}`, which no page path can take.
 */
export const previewBasePath = "/preview";
export const reviewBasePath = "/review";
export const mediaSegment = "_media";

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

/** The person viewing a preview, or null for someone who isn't signed in. */
export class Visitor extends Context.Service<Visitor, Person | null>()("Pakshi/Visitor") {}

/** Studio's own address, as the browser reached it, for links studio-api sends people. */
export class StudioAddress extends Context.Service<StudioAddress, string>()(
  "Pakshi/StudioAddress",
) {}

/**
 * Checks the session cookie Studio forwards and provides the signed-in person.
 * Handlers never take the person or the cookie as an argument.
 */
export class StudioSession extends RpcMiddleware.Service<
  StudioSession,
  { provides: SignedIn | StudioAddress }
>()("Pakshi/StudioSession", { error: Schema.Union([Unauthenticated, StudioUnavailable]) }) {}

/** Like StudioSession, for calls anyone may make: it provides the visitor, signed in or not. */
export class VisitorSession extends RpcMiddleware.Service<
  VisitorSession,
  { provides: Visitor | StudioAddress }
>()("Pakshi/VisitorSession", { error: StudioUnavailable }) {}

/** The headers Studio forwards on every call, for the session middleware. */
export const studioSessionHeaders = { cookie: "cookie", origin: "x-studio-origin" } as const;

export const Viewer = Schema.Struct({
  user: Person,
  roles: Schema.Array(Schema.Struct({ role: Schema.String, scope: Schema.String })),
  sites: Schema.Array(Schema.Struct({ id: SiteId, name: Schema.String, brand: Schema.String })),
  /** How many submissions are waiting for this person's decision. */
  approvalsWaiting: Schema.Int,
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
  sharing: DraftSharing,
  /** The draft's latest submission for approval, whatever became of it. */
  review: Schema.NullOr(Submission),
});
export type DraftSummary = typeof DraftSummary.Type;

/**
 * What the person may do on the site, beyond editing its drafts. Submitting
 * publishes when the site's workflow has no steps, so `publish` covers both.
 */
export const SiteAbilities = Schema.Struct({
  publish: Schema.Boolean,
  rollBack: Schema.Boolean,
  share: Schema.Boolean,
});
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
  /**
   * Conflicts still need a side, or the live site moved on since the sides
   * were chosen and they need choosing again. These conflicts are current.
   */
  Unresolved: { conflicts: Schema.Array(Conflict) },
});
export type UpdateOutcome = typeof UpdateOutcome.Type;

/** The workflow that applies to a site, and the scope it's set on, or null when none is set anywhere. */
export const ResolvedWorkflow = Schema.Struct({
  steps: Workflow,
  from: Schema.NullOr(Schema.Literals(["site", "brand", "organization"])),
});
export type ResolvedWorkflow = typeof ResolvedWorkflow.Type;

/** What submitting a draft now would meet: pre-flight's findings, whether it's behind, and who reviews it. */
export const SubmissionCheck = Schema.Struct({
  issues: Schema.Array(PreflightIssue),
  behind: Schema.Boolean,
  workflow: ResolvedWorkflow,
});
export type SubmissionCheck = typeof SubmissionCheck.Type;

export const SubmitOutcome = Schema.TaggedUnion({
  Submitted: { submission: Submission },
  /** The workflow has no steps, so submitting published the draft. */
  Published: { release: Release },
  /** Pre-flight found things to fix. Nothing was submitted. */
  Blocked: { issues: Schema.Array(PreflightIssue) },
  /** The draft is behind, and merging the live release needs a person. */
  NeedsUpdate: {},
});
export type SubmitOutcome = typeof SubmitOutcome.Type;

/** A draft's sharing, as the share dialog shows it. */
export const SharingView = Schema.Struct({
  draft: Schema.Struct({ id: DraftId, name: DraftName }),
  owner: Collaborator,
  sharing: DraftSharing,
  can: Schema.Struct({ share: Schema.Boolean }),
});
export type SharingView = typeof SharingView.Type;

/**
 * A scope's approval workflow: its own steps, or null when it uses the one
 * above it, and the one it would use then.
 */
export const WorkflowView = Schema.Struct({
  scope: Scope,
  name: Schema.String,
  own: Schema.NullOr(Workflow),
  /** The scope above this one, whose workflow applies when this one has none: a site's brand, a brand's organization. */
  parent: Schema.NullOr(Scope),
  inherited: ResolvedWorkflow,
  can: Schema.Struct({ edit: Schema.Boolean }),
});
export type WorkflowView = typeof WorkflowView.Type;

/** A submission with the site it's for. */
export const SubmissionItem = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  submission: Submission,
});
export type SubmissionItem = typeof SubmissionItem.Type;

/** The Approvals screen: what waits for the person, what they sent, and what's finished. */
export const Approvals = Schema.Struct({
  waiting: Schema.Array(SubmissionItem),
  sent: Schema.Array(SubmissionItem),
  finished: Schema.Array(SubmissionItem),
});
export type Approvals = typeof Approvals.Type;

/** Whether the person may decide on a submission now, and on which step, or why not. */
export const Decidable = Schema.Union([
  Schema.Struct({ ok: Schema.Literal(true), step: Schema.Int }),
  Schema.Struct({ ok: Schema.Literal(false), reason: Schema.String }),
]);
export type Decidable = typeof Decidable.Type;

/** A submission as its review screen shows it: what changed compared with the live site, and the pages to look at. */
export const Review = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  submission: Submission,
  changes: Schema.Array(MergedChange),
  pages: Schema.Array(PageSummary),
  decidable: Decidable,
});
export type Review = typeof Review.Type;

export const Decision = Schema.Literals(["approve", "request-changes"]);
export type Decision = typeof Decision.Type;

export const DecisionOutcome = Schema.TaggedUnion({
  /** The decision counts. The submission may have moved to its next step, or back to its draft. */
  Recorded: { submission: Submission },
  /** It was the last approval, and the submission is live. */
  Published: { release: Release },
  /** The submission changed since it was loaded. Nothing was recorded. */
  Stale: { submission: Submission },
  /** The submission is no longer under review. Nothing was recorded. */
  Closed: { submission: Submission },
});
export type DecisionOutcome = typeof DecisionOutcome.Type;

/** A draft someone shared with the person. */
export const SharedDraft = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  draft: Schema.Struct({ id: DraftId, name: DraftName }),
  access: ShareAccess,
});
export type SharedDraft = typeof SharedDraft.Type;

export const Home = Schema.Struct({
  waiting: Schema.Array(SubmissionItem),
  shared: Schema.Array(SharedDraft),
});
export type Home = typeof Home.Type;

/** Everything a page of a site renders from: the page, and what it reads from the rest of the site. */
export const SiteView = Schema.Struct({
  settings: SiteSettings,
  parts: SiteParts,
  forms: Schema.Record(FormId, FormDefinition),
  lockfile: Lockfile,
  theme: ResolvedTheme,
  pages: Schema.Array(PageListing),
  media: Schema.Record(MediaId, MediaFile),
  /** The page at the address asked for, or null when no page is served there. */
  page: Schema.NullOr(PageDocument),
});
export type SiteView = typeof SiteView.Type;

export const PreviewPage = Schema.TaggedUnion({
  Page: {
    site: Schema.Struct({ id: SiteId, name: Schema.String }),
    draft: Schema.Struct({ id: DraftId, name: DraftName }),
    /** What the visitor may do with the draft. */
    access: ShareAccess,
    view: SiteView,
  },
  /** The draft isn't shared with anyone who has the link, and the visitor isn't signed in. */
  SignIn: {},
  /** No open draft here is shared with the visitor. */
  NotFound: {},
});
export type PreviewPage = typeof PreviewPage.Type;

/**
 * A page of a submission, or of the live release beside it, with the blocks
 * the submission changed, or word that the submission no longer has the
 * snapshot asked for.
 */
export const ReviewPage = Schema.TaggedUnion({
  Page: { view: SiteView, changed: Schema.Array(BlockId) },
  /** A release merged into the submission since the reviewer loaded it. */
  Changed: {},
});
export type ReviewPage = typeof ReviewPage.Type;

/** A site's releases, newest first. */
export const SiteReleases = Schema.Struct({
  site: SiteName,
  releases: Schema.Array(Release),
  can: SiteAbilities,
});
export type SiteReleases = typeof SiteReleases.Type;

/** The site has no submission with this ID. */
export class SubmissionNotFound extends Schema.TaggedError<SubmissionNotFound>()(
  "SubmissionNotFound",
  { submission: SubmissionId },
) {}

/** No open draft on the site has this ID. */
export class DraftNotFound extends Schema.TaggedError<DraftNotFound>()("DraftNotFound", {
  draft: DraftId,
}) {}

/** The person can't decide on this submission now, for the reason given. */
export class CannotDecide extends Schema.TaggedError<CannotDecide>()("CannotDecide", {
  reason: Schema.String,
}) {}

/** There's no organization, brand or site here that the person can see. */
export class ScopeNotFound extends Schema.TaggedError<ScopeNotFound>()("ScopeNotFound", {}) {}

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
const forSubmission = { site: SiteId, submission: SubmissionId };

/** Everything Studio asks of studio-api for someone signed in. */
class SignedInRpcs extends RpcGroup.make(
  Rpc.make("viewer", { success: Viewer, error: StudioUnavailable }),
  Rpc.make("home", { success: Home, error: StudioUnavailable }),
  /** People in the organization whose name or email contains the text, for sharing and workflows. */
  Rpc.make("people", {
    payload: { search: Schema.String },
    success: Schema.Array(Person),
    error: StudioUnavailable,
  }),
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
    /** `seen` is the live release the sides were chosen against. */
    payload: { ...forDraft, resolutions: Resolutions, seen: ReleaseId },
    success: UpdateOutcome,
    error: draftError,
  }),
  /**
   * A merged value a model suggests for a text or rich text conflict in
   * updating a draft, or null when it has none that fits the field.
   */
  Rpc.make("suggestMerge", {
    payload: { ...forDraft, conflict: ConflictKey },
    success: Schema.NullOr(Schema.Json),
    error: draftError,
  }),
  /** Alt text a model suggests for an image in the draft, for a person to check. */
  Rpc.make("suggestAltText", {
    payload: { ...forDraft, media: MediaId, block: BlockId },
    success: Schema.NullOr(Schema.String),
    error: draftError,
  }),
  Rpc.make("draftSharing", { payload: forDraft, success: SharingView, error: draftError }),
  Rpc.make("shareDraft", {
    payload: { ...forDraft, sharing: DraftSharing },
    success: SharingView,
    error: Schema.Union([StudioUnavailable, SiteNotFound, DraftNotFound, NotPermitted]),
  }),
  Rpc.make("submissionCheck", {
    payload: forDraft,
    success: SubmissionCheck,
    error: Schema.Union([StudioUnavailable, SiteNotFound, DraftNotFound, NotPermitted]),
  }),
  Rpc.make("submitDraft", {
    payload: { ...forDraft, note: Schema.String.check(Schema.isMaxLength(1000)) },
    success: SubmitOutcome,
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
  Rpc.make("workflow", {
    payload: { scope: Scope },
    success: WorkflowView,
    error: Schema.Union([StudioUnavailable, ScopeNotFound]),
  }),
  /** Sets a scope's own workflow, or with null, has it use the one above it. */
  Rpc.make("saveWorkflow", {
    payload: { scope: Scope, steps: Schema.NullOr(Workflow) },
    success: WorkflowView,
    error: Schema.Union([StudioUnavailable, ScopeNotFound, NotPermitted]),
  }),
  Rpc.make("approvals", { success: Approvals, error: StudioUnavailable }),
  Rpc.make("review", {
    payload: forSubmission,
    success: Review,
    error: Schema.Union([StudioUnavailable, SiteNotFound, SubmissionNotFound]),
  }),
  Rpc.make("reviewPage", {
    payload: {
      ...forSubmission,
      /** The submission snapshot the reviewer is looking at, so the page shown is the one they decide on. */
      snapshot: SnapshotId,
      version: Schema.Literals(["submitted", "live"]),
      path: PagePath,
    },
    success: ReviewPage,
    error: Schema.Union([StudioUnavailable, SiteNotFound, SubmissionNotFound]),
  }),
  Rpc.make("decide", {
    /** `snapshot` is the submission snapshot the approver saw. */
    payload: {
      ...forSubmission,
      snapshot: SnapshotId,
      decision: Decision,
      note: Schema.String.check(Schema.isMaxLength(1000)),
    },
    success: DecisionOutcome,
    error: Schema.Union([StudioUnavailable, SiteNotFound, SubmissionNotFound, CannotDecide]),
  }),
).middleware(StudioSession) {}

/** What Studio asks of studio-api for anyone, signed in or not. */
class VisitorRpcs extends RpcGroup.make(
  Rpc.make("previewPage", {
    payload: { ...forDraft, path: PagePath },
    success: PreviewPage,
    error: StudioUnavailable,
  }),
).middleware(VisitorSession) {}

/** Everything Studio asks of studio-api. */
export class StudioRpcs extends SignedInRpcs.merge(VisitorRpcs) {}
