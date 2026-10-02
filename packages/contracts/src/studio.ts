import { ContrastIssue, HexColor, ResolvedTheme } from "@repo/tokens";
import { Context, Schema, SchemaGetter } from "effect";
import { Rpc, RpcGroup, RpcMiddleware } from "effect/unstable/rpc";

import {
  CustomRole,
  Permission,
  Role,
  RoleDescription,
  RoleId,
  RoleName,
  RoleRef,
  Scope,
} from "./access.ts";
import {
  InvitationToken,
  InvitationView,
  NamedScope,
  OrganizationName,
  PendingInvitation,
} from "./accounts.ts";
import { AuditCursor, AuditFilters, AuditPage, AuditQuery } from "./audit.ts";
import { BrandIdentity, BrandLook, BrandRevision, VoiceGuide } from "./brand.ts";
import { Draft, DraftName } from "./draft.ts";
import { EmailAddress } from "./email.ts";
import { FormEntry, FormSummary } from "./entries.ts";
import { FormDefinition } from "./form.ts";
import {
  BlockId,
  BlockRequestId,
  BlockType,
  BrandId,
  DraftId,
  EntryId,
  FormId,
  InvitationId,
  MediaId,
  ReleaseId,
  CustomRoleId,
  SiteId,
  SnapshotId,
  SubmissionId,
} from "./ids.ts";
import { Collaborator } from "./live.ts";
import { Conflict, ConflictKey, MergedChange, Resolutions } from "./merge.ts";
import { Batch, BatchError } from "./ops.ts";
import { PageDocument, PagePath } from "./page.ts";
import { CheckIssue } from "./publishing.ts";
import { Release, Timestamp } from "./release.ts";
import { PublishedSettings, SettingsChanges, SettingsView, SiteName } from "./settings.ts";
import { DraftSharing, ShareAccess } from "./sharing.ts";
import { Menus, Redirects, SiteParts } from "./site.ts";
import { LiveRelease, Lockfile, MediaFile, PageListing } from "./snapshot.ts";
import { Submission } from "./submission.ts";
import { Workflow } from "./workflow.ts";

/**
 * Where Studio serves a draft's preview, at `${previewBasePath}/{site}/{draft}/{page path}`,
 * and a submission for its approvers, at `${reviewBasePath}/{site}/{submission}/{page path}`.
 * Each serves its images under its own `/${mediaSegment}/{media}`, which no page path can take.
 */
export const previewBasePath = "/preview";
/** Where Studio serves a brand's library images, at `${brandMediaBasePath}/{brand}/{media}`, for its admins. */
export const brandMediaBasePath = "/brand-media";
/**
 * Where Studio serves the images a site can place, from its library and its
 * brand's, at `${siteMediaBasePath}/{site}/{media}`, for anyone who works on it.
 */
export const siteMediaBasePath = "/site-media";
export const reviewBasePath = "/review";
export const mediaSegment = "_media";

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
  organization: Schema.String,
  roles: Schema.Array(Schema.Struct({ role: Schema.String, scope: Schema.String })),
  sites: Schema.Array(Schema.Struct({ id: SiteId, name: Schema.String, brand: Schema.String })),
  /** How many submissions are waiting for this person's decision. */
  approvalsWaiting: Schema.Int,
  /** Whether the person works on any brand, so Studio shows them the brands. */
  brands: Schema.Boolean,
  can: Schema.Struct({
    /** Make brands, which only the organization's admins do. */
    createBrand: Schema.Boolean,
    /** Make sites in at least one brand. */
    createSite: Schema.Boolean,
    /** Invite people somewhere, so Studio shows them the people screen. */
    invite: Schema.Boolean,
    /** Make and change custom roles. */
    manageRoles: Schema.Boolean,
    /** Edit the organization's approval workflow. */
    editWorkflow: Schema.Boolean,
    /** Read the audit log of anything. */
    readAudit: Schema.Boolean,
    /** Upgrade blocks on every site and see which versions can be removed, as the platform team does. */
    upgradeBlocks: Schema.Boolean,
  }),
});
export type Viewer = typeof Viewer.Type;

/** What a site's platform subdomain starts with, such as `northbank-libraries`. */
export const SiteAddress = Schema.String.check(
  Schema.isPattern(/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/, {
    message:
      "Use lowercase letters, digits and hyphens, starting and ending with a letter or digit",
  }),
);
export type SiteAddress = typeof SiteAddress.Type;

export const BrandName = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Name the brand" }),
  Schema.isMaxLength(80, { message: "Use at most 80 characters" }),
);

/** What a person needs to make a site: the brands they may make one in, and where its address goes. */
export const NewSiteOptions = Schema.Struct({
  brands: Schema.Array(Schema.Struct({ id: BrandId, name: Schema.String })),
  /** The host platform subdomains go under, such as `pakshi.site`. */
  sitesHost: Schema.String,
});
export type NewSiteOptions = typeof NewSiteOptions.Type;

/** Another site already has this platform subdomain. */
export class AddressTaken extends Schema.TaggedError<AddressTaken>()("AddressTaken", {
  address: SiteAddress,
}) {}

/** A site made with its first draft, which the person goes to next. */
export const CreatedSite = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  draft: DraftId,
});
export type CreatedSite = typeof CreatedSite.Type;

/** A role someone holds on a scope, and whether the viewer may take it away. */
export const MemberGrant = Schema.Struct({
  role: RoleRef,
  scope: NamedScope,
  removable: Schema.Boolean,
});
export type MemberGrant = typeof MemberGrant.Type;

/** A permission switched on or off for someone on a scope, and whether the viewer may remove it. */
export const MemberOverride = Schema.Struct({
  permission: Permission,
  scope: NamedScope,
  allowed: Schema.Boolean,
  setBy: Schema.NullOr(Collaborator),
  setAt: Schema.NullOr(Timestamp),
  removable: Schema.Boolean,
});
export type MemberOverride = typeof MemberOverride.Type;

/** One person in the organization, the access they hold, and when they last used Studio. */
export const Member = Schema.Struct({
  person: Person,
  grants: Schema.Array(MemberGrant),
  overrides: Schema.Array(MemberOverride),
  lastActive: Schema.NullOr(Timestamp),
});
export type Member = typeof Member.Type;

/**
 * Somewhere the viewer controls: the roles they may give there, and the
 * permissions they may switch on or off for someone. Each holds only what
 * the viewer holds there.
 */
export const AccessPlace = Schema.Struct({
  scope: NamedScope,
  roles: Schema.Array(RoleRef),
  permissions: Schema.Array(Permission),
});
export type AccessPlace = typeof AccessPlace.Type;

/** The organization's people, the invitations waiting, and where the viewer may give access. */
export const People = Schema.Struct({
  members: Schema.Array(Member),
  invitations: Schema.Array(PendingInvitation),
  places: Schema.Array(AccessPlace),
});
export type People = typeof People.Type;

/** Who can work on a brand or a site, as its members screen shows them. */
export const ScopeMembers = Schema.Struct({
  scope: NamedScope,
  /** Roles given on this scope itself, which can be changed here. */
  direct: Schema.Array(Schema.Struct({ person: Person, role: RoleRef, removable: Schema.Boolean })),
  /** Roles that reach this scope from a grant above it, changed where they were given. */
  inherited: Schema.Array(Schema.Struct({ person: Person, role: RoleRef, from: NamedScope })),
  /** The roles the viewer may give here, none when they can't manage its members. */
  roles: Schema.Array(RoleRef),
});
export type ScopeMembers = typeof ScopeMembers.Type;

/** Every role, with who holds it where, and what the viewer may do with roles. */
export const RolesView = Schema.Struct({
  roles: Schema.Array(
    Schema.Struct({
      role: Role,
      holders: Schema.Array(Schema.Struct({ person: Collaborator, scope: NamedScope })),
    }),
  ),
  can: Schema.Struct({ manage: Schema.Boolean }),
  /** The permissions the viewer may put in a role: those they hold across the organization. */
  permissions: Schema.Array(Permission),
});
export type RolesView = typeof RolesView.Type;

/**
 * Pakshi's success metrics over a period, as the product spec defines them,
 * with how many cases each is measured over.
 */
export const SuccessMetrics = Schema.Struct({
  since: Timestamp,
  /** Site created to its first publish, in business days, for sites first published in the period. */
  timeToLaunch: Schema.Struct({ median: Schema.NullOr(Schema.Finite), sites: Schema.Int }),
  /** Draft started to first submitted, in minutes. */
  timeToChange: Schema.Struct({ median: Schema.NullOr(Schema.Finite), drafts: Schema.Int }),
  /** Block requests, and the sites people worked on, by month, oldest first. */
  blockRequests: Schema.Array(
    Schema.Struct({ month: Schema.String, requests: Schema.Int, activeSites: Schema.Int }),
  ),
  /** Submitted for approval to the final decision, in business days. */
  approvalTurnaround: Schema.Struct({
    median: Schema.NullOr(Schema.Finite),
    submissions: Schema.Int,
  }),
  /** The agent's turns that changed a draft, and how many of them no one undid. */
  agentSuccess: Schema.Struct({ turns: Schema.Int, kept: Schema.Int }),
  /** Times a site served something no publish or rollback made, and Pakshi put it right. */
  untrackedChanges: Schema.Int,
});
export type SuccessMetrics = typeof SuccessMetrics.Type;

/** There's no role with that ID. */
export class RoleNotFound extends Schema.TaggedError<RoleNotFound>()("RoleNotFound", {}) {}

/** Another role, default or custom, has this name. */
export class RoleNameTaken extends Schema.TaggedError<RoleNameTaken>()("RoleNameTaken", {
  name: Schema.String,
}) {}

/** Someone holds the role, or a workflow step names it, so it can't be deleted. */
export class RoleInUse extends Schema.TaggedError<RoleInUse>()("RoleInUse", {}) {}

/** The organization would be left without an org admin to manage it. */
export class LastOrgAdmin extends Schema.TaggedError<LastOrgAdmin>()("LastOrgAdmin", {}) {}

/** There's no one in the organization with that ID. */
export class PersonNotFound extends Schema.TaggedError<PersonNotFound>()("PersonNotFound", {}) {}

/** An invitation just made, with the link it sends, for the inviter to copy. */
export const SentInvitation = Schema.Struct({ invitation: PendingInvitation, link: Schema.String });
export type SentInvitation = typeof SentInvitation.Type;

/** Someone saved the site's settings since they were loaded, so saving would undo their change. */
export class SettingsChanged extends Schema.TaggedError<SettingsChanged>()("SettingsChanged", {
  revision: Schema.Int,
}) {}

/** The image isn't in the site's library or its brand's. */
export class ImageNotFound extends Schema.TaggedError<ImageNotFound>()("ImageNotFound", {}) {}

/** A site's forms with how many entries each has, for someone who may read them. */
export const SiteEntriesView = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  forms: Schema.Array(FormSummary),
  can: Schema.Struct({ export: Schema.Boolean, delete: Schema.Boolean }),
});
export type SiteEntriesView = typeof SiteEntriesView.Type;

/** Where a page of entries ends, for asking for the next. */
export const EntryCursor = Schema.Struct({ receivedAt: Timestamp, id: EntryId });
export type EntryCursor = typeof EntryCursor.Type;

export const EntriesPage = Schema.Struct({
  entries: Schema.Array(FormEntry),
  more: Schema.Boolean,
});
export type EntriesPage = typeof EntriesPage.Type;

/** The entries one email address sent with one form. */
export const EntriesFrom = Schema.Struct({
  form: FormId,
  name: Schema.String,
  entries: Schema.Int,
  first: Timestamp,
  latest: Timestamp,
});
export type EntriesFrom = typeof EntriesFrom.Type;

/** The site has no entry with this ID, or it was deleted. */
export class EntryNotFound extends Schema.TaggedError<EntryNotFound>()("EntryNotFound", {}) {}

/** The person already holds this role there. */
export class AlreadyMember extends Schema.TaggedError<AlreadyMember>()("AlreadyMember", {}) {}

/** The invitation was used, revoked or has expired, or was sent to someone else. */
export class InvitationClosed extends Schema.TaggedError<InvitationClosed>()(
  "InvitationClosed",
  {},
) {}

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

/** One of a site's forms, in the live site or an open draft, with the pages it's on. */
export const SiteForm = Schema.Struct({
  id: FormId,
  name: Schema.String,
  pages: Schema.Array(Schema.String),
  /** Whether the live site has the form, rather than only a draft. */
  live: Schema.Boolean,
});
export type SiteForm = typeof SiteForm.Type;

/**
 * A site's own domain, such as `www.northbanklibraries.org`: lowercase, and
 * starting with a word before the domain, because a bare domain can't point
 * at Pakshi.
 */
export const Hostname = Schema.Trim.pipe(
  Schema.decodeTo(Schema.String, {
    decode: SchemaGetter.transform((value: string) => value.toLowerCase().replace(/\.$/, "")),
    encode: SchemaGetter.passthrough(),
  }),
).check(
  Schema.isMaxLength(253, { message: "Use at most 253 characters" }),
  Schema.isPattern(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z0-9-]{2,63}$/, {
    message: "Enter an address with a word before the domain, such as www.example.org",
  }),
);
export type Hostname = typeof Hostname.Type;

/** One of a site's own domains, and how far it is from serving the site. */
export const SiteDomain = Schema.Struct({
  hostname: Schema.String,
  status: Schema.Literals(["pending", "active"]),
  addedAt: Timestamp,
  checkedAt: Schema.NullOr(Timestamp),
  /** The DNS records that connect it and prove it's the site's: a CNAME, and a TXT record with its token. */
  records: Schema.Array(
    Schema.Struct({
      type: Schema.Literals(["CNAME", "TXT"]),
      name: Schema.String,
      value: Schema.String,
    }),
  ),
});
export type SiteDomain = typeof SiteDomain.Type;

/** A site's addresses: the one Pakshi gives it, and its own. */
export const SiteDomainsView = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  /** The site's address under the sites host, which always works. */
  platform: Schema.NullOr(Schema.String),
  domains: Schema.Array(SiteDomain),
  can: Schema.Struct({ edit: Schema.Boolean }),
});
export type SiteDomainsView = typeof SiteDomainsView.Type;

/** How long a deleted site can be restored, in days. */
export const restoreDays = 30;

/** A site deleted within the last 30 days, which an org admin can restore. */
export const DeletedSite = Schema.Struct({
  id: SiteId,
  name: Schema.String,
  brand: Schema.String,
  deletedAt: Timestamp,
  deletedBy: Schema.NullOr(Schema.String),
});
export type DeletedSite = typeof DeletedSite.Type;

/** A brand with sites, deleted ones it can still restore included, can't be deleted. */
export class BrandHasSites extends Schema.TaggedError<BrandHasSites>()("BrandHasSites", {
  sites: Schema.Int,
}) {}

/** Another site already has this domain, or it's under Pakshi's own host. */
export class DomainTaken extends Schema.TaggedError<DomainTaken>()("DomainTaken", {
  hostname: Schema.String,
}) {}

/** Where Studio sends an image to add to a library: `${mediaUploadPath}?site=` or `?brand=`, with `&name=`. */
export const mediaUploadPath = "/api/media";

/** The largest image a library takes, in bytes. */
export const imageLimit = 20 * 1024 * 1024;

/** An image in a library, as the media screens show it. */
export const LibraryImage = Schema.Struct({
  ...MediaSummary.fields,
  /** The file's name when it was uploaded. */
  name: Schema.String,
  /** Its size in bytes. */
  size: Schema.Int,
  uploadedBy: Schema.NullOr(Schema.String),
  uploadedAt: Timestamp,
  /** The pages that show it, in the live site or an open draft. */
  usedOn: Schema.Array(Schema.String),
});
export type LibraryImage = typeof LibraryImage.Type;

/** A site's library and its brand's, with what the person may do with each. */
export const MediaLibraryView = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  brand: Schema.Struct({ id: BrandId, name: Schema.String }),
  siteImages: Schema.Array(LibraryImage),
  brandImages: Schema.Array(LibraryImage),
  can: Schema.Struct({ editSite: Schema.Boolean, editBrand: Schema.Boolean }),
});
export type MediaLibraryView = typeof MediaLibraryView.Type;

/** Why an upload was refused. */
export const UploadRefusal = Schema.Struct({
  reason: Schema.Literals(["not-image", "too-large", "not-permitted"]),
});
export type UploadRefusal = typeof UploadRefusal.Type;

/** A site's settings, with the images and forms they refer to and whether the person may change them. */
export const SiteSettingsView = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  brand: Schema.Struct({ id: BrandId, name: Schema.String }),
  ...SettingsView.fields,
  media: Schema.Array(MediaSummary),
  forms: Schema.Array(SiteForm),
  can: Schema.Struct({ edit: Schema.Boolean, delete: Schema.Boolean }),
});
export type SiteSettingsView = typeof SiteSettingsView.Type;

/** Whether a draft takes changes: open, published, or closed by someone without publishing. */
export const DraftStatus = Schema.Literals(["open", "published", "closed"]);
export type DraftStatus = typeof DraftStatus.Type;

/**
 * Why a draft exists: someone started it, or Pakshi made it to bring a brand
 * revision or a block version to the site. A site has at most one open draft
 * of each kind Pakshi makes, which later revisions and adoptions reuse.
 */
export const DraftKind = Schema.TaggedUnion({
  Edit: {},
  BrandUpdate: {},
  BlockUpgrade: { type: BlockType, version: Schema.Int },
});
export type DraftKind = typeof DraftKind.Type;

/** A draft as the drafts list shows it. */
export const DraftSummary = Schema.Struct({
  id: DraftId,
  name: DraftName,
  kind: DraftKind,
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
  /** Add images to the site's library, which editing its pages allows. */
  upload: Schema.Boolean,
});
export type SiteAbilities = typeof SiteAbilities.Type;

/** A site as lists name it. */
const SiteLabel = Schema.Struct({ id: SiteId, name: Schema.String });

/** A site's drafts, with the release that's live. */
export const SiteDrafts = Schema.Struct({
  site: SiteLabel,
  live: Release,
  drafts: Schema.Array(DraftSummary),
  can: SiteAbilities,
});
export type SiteDrafts = typeof SiteDrafts.Type;

/**
 * How a page in a draft stands against the live site: not there yet, changed,
 * the same as live, or unpublished in the draft. An entry of an unpublished
 * collection is unpublished too.
 */
export const PageStanding = Schema.Literals(["new", "changed", "live", "unpublished"]);
export type PageStanding = typeof PageStanding.Type;

/** A page in a draft as its Pages and menus screen lists it. */
export const DraftPageSummary = Schema.Union(
  PageListing.members.map((member) => Schema.Struct({ ...member.fields, standing: PageStanding })),
);
export type DraftPageSummary = typeof DraftPageSummary.Type;

/**
 * A draft's pages, menus and redirects, as its Pages and menus screen shows
 * them, with the block versions it builds a new blog or post from.
 */
export const DraftPages = Schema.Struct({
  site: SiteLabel,
  live: LiveRelease,
  draft: DraftSummary,
  lockfile: Lockfile,
  pages: Schema.Array(DraftPageSummary),
  menus: Menus,
  redirects: Redirects,
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
    /** The site's published settings now, which the draft's pages show with. */
    settings: PublishedSettings,
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
  site: SiteLabel,
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

/** What submitting a draft now would meet: what the checks found, whether it's behind, and who reviews it. */
export const SubmissionCheck = Schema.Struct({
  issues: Schema.Array(CheckIssue),
  behind: Schema.Boolean,
  workflow: ResolvedWorkflow,
});
export type SubmissionCheck = typeof SubmissionCheck.Type;

export const SubmitOutcome = Schema.TaggedUnion({
  Submitted: { submission: Submission },
  /** The workflow has no steps, so submitting published the draft. */
  Published: { release: Release },
  /** The checks found things to fix. Nothing was submitted. */
  Blocked: { issues: Schema.Array(CheckIssue) },
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
  /** Every role a step can name. */
  roles: Schema.Array(RoleRef),
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
  pages: Schema.Array(PageListing),
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
  settings: PublishedSettings,
  parts: SiteParts,
  forms: Schema.Record(FormId, FormDefinition),
  lockfile: Lockfile,
  brand: BrandRevision,
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

/** A brand as the brands list shows it: its newest look, how it sounds, and its sites. */
export const BrandSummary = Schema.Struct({
  id: BrandId,
  name: Schema.String,
  /** The theme of the brand's newest revision, as its sites render it. */
  theme: ResolvedTheme,
  identity: BrandIdentity,
  /** The tone its voice guide sets, or empty while the guide sets none. */
  tone: VoiceGuide.fields.tone,
  sites: Schema.Array(SiteLabel),
});
export type BrandSummary = typeof BrandSummary.Type;

/** A brand's newest revision, and who saved it. */
export const RevisionInfo = Schema.Struct({
  number: Schema.Int,
  by: Collaborator,
  at: Timestamp,
});
export type RevisionInfo = typeof RevisionInfo.Type;

/** Everything Theme Studio and the identity and voice screen show for a brand. */
export const BrandView = Schema.Struct({
  brand: Schema.Struct({ id: BrandId, name: Schema.String }),
  revision: RevisionInfo,
  look: BrandLook,
  voice: VoiceGuide,
  sites: Schema.Array(SiteLabel),
  /** The brand's library, where its logos and icon come from. */
  media: Schema.Array(MediaSummary),
  can: Schema.Struct({ edit: Schema.Boolean, delete: Schema.Boolean }),
});
export type BrandView = typeof BrandView.Type;

/** What bringing a brand revision to one site did. */
export const BrandUpdateResult = Schema.Struct({
  site: SiteLabel,
  /** The Brand update draft, or null when the site needed none or couldn't be reached yet. */
  draft: Schema.NullOr(Schema.Struct({ id: DraftId, name: DraftName })),
  /** The site couldn't be reached. Pakshi tries again on its own. */
  pending: Schema.Boolean,
});
export type BrandUpdateResult = typeof BrandUpdateResult.Type;

export const SavedLook = Schema.Struct({
  revision: RevisionInfo,
  sites: Schema.Array(BrandUpdateResult),
});
export type SavedLook = typeof SavedLook.Type;

/** One version of a block, as upgrade banners describe it. */
export const BlockVersionInfo = Schema.Struct({
  version: Schema.Int,
  /** What changed from the version before; null for a block's first version. */
  changes: Schema.NullOr(Schema.String),
});
export type BlockVersionInfo = typeof BlockVersionInfo.Type;

/** A block version no live release or open draft pins any more, and when it last did. */
export const RemovableVersion = Schema.Struct({
  type: BlockType,
  version: Schema.Int,
  /** Null when nothing ever pinned it. */
  lastUsedAt: Schema.NullOr(Timestamp),
});
export type RemovableVersion = typeof RemovableVersion.Type;

/** A request for a block the library doesn't have. */
export const BlockRequest = Schema.Struct({
  id: BlockRequestId,
  /** The site it's for, or null for any site. */
  site: Schema.NullOr(Schema.Struct({ id: SiteId, name: Schema.String })),
  requestedBy: Collaborator,
  need: Schema.String,
  example: Schema.String,
  /** The block the agent found closest, when it filed the request. */
  nearest: Schema.NullOr(BlockType),
  requestedAt: Timestamp,
  closedAt: Schema.NullOr(Timestamp),
});
export type BlockRequest = typeof BlockRequest.Type;

/**
 * The block requests a person may see: every one for the platform team, who
 * close them, and their own for everyone else, with the sites they may ask
 * for blocks on.
 */
export const BlockRequests = Schema.Struct({
  requests: Schema.Array(BlockRequest),
  sites: Schema.Array(Schema.Struct({ id: SiteId, name: Schema.String })),
  can: Schema.Struct({ close: Schema.Boolean }),
});
export type BlockRequests = typeof BlockRequests.Type;

export const BlockNeed = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Say what visitors should see and do" }),
  Schema.isMaxLength(2000, { message: "Use at most 2,000 characters" }),
);

export const BlockExample = Schema.Trim.check(
  Schema.isMaxLength(500, { message: "Use at most 500 characters" }),
);

/**
 * What the platform team keeps up to date: each block some sites show at an
 * older version than its newest, and the versions that can leave the registry.
 */
export const BlockUpdates = Schema.Struct({
  behind: Schema.Array(
    Schema.Struct({
      type: BlockType,
      /** The sites whose live release shows an older version, which an upgrade everywhere reaches. */
      sites: Schema.Int,
    }),
  ),
  /** Versions past the 3 months they're kept unused. */
  removable: Schema.Array(RemovableVersion),
});
export type BlockUpdates = typeof BlockUpdates.Type;

/** One of the person's sites whose live release shows a block, and how it shows it. */
export const BlockUse = Schema.Struct({
  site: Schema.Struct({ id: SiteId, name: Schema.String }),
  version: Schema.Int,
  /** The live pages and posts with the block on them. */
  pages: Schema.Int,
  /** Whether the site's header or footer is this block. */
  sitewide: Schema.Boolean,
});
export type BlockUse = typeof BlockUse.Type;

/** A block the live site pins, how it's used, and the newer versions it could adopt. */
export const SiteBlock = Schema.Struct({
  type: BlockType,
  title: Schema.String,
  version: Schema.Int,
  latest: Schema.Int,
  /** The versions after the one in use, oldest first. */
  newer: Schema.Array(BlockVersionInfo),
  pages: Schema.Int,
  sitewide: Schema.Boolean,
  /** The open draft that upgrades this block to its newest version, if there is one. */
  upgradeDraft: Schema.NullOr(Schema.Struct({ id: DraftId, name: DraftName })),
  /**
   * Accepted changes to how the version in use looks, made by shared code
   * rather than a new version, oldest first.
   */
  renderingChanges: Schema.Array(Schema.Struct({ date: Schema.String, change: Schema.String })),
});
export type SiteBlock = typeof SiteBlock.Type;

export const SiteBlocks = Schema.Struct({
  site: SiteLabel,
  blocks: Schema.Array(SiteBlock),
  can: Schema.Struct({ upgrade: Schema.Boolean }),
});
export type SiteBlocks = typeof SiteBlocks.Type;

/** What creating an upgrade draft on one site did. */
export const UpgradeResult = Schema.Struct({
  site: SiteLabel,
  draft: Schema.NullOr(Schema.Struct({ id: DraftId, name: DraftName })),
  /** The site couldn't be reached. Trying again creates only the drafts still missing. */
  failed: Schema.Boolean,
});
export type UpgradeResult = typeof UpgradeResult.Type;

/** The site already uses the newest version of this block. */
export class UpToDate extends Schema.TaggedError<UpToDate>()("UpToDate", { type: BlockType }) {}

/** A site's releases, newest first. */
export const SiteReleases = Schema.Struct({
  site: SiteLabel,
  releases: Schema.Array(Release),
  can: SiteAbilities,
});
export type SiteReleases = typeof SiteReleases.Type;

/** How many days back a site's overview counts new form entries. */
export const newEntriesDays = 7;

/**
 * The top of every site page: where visitors find the site, what's live, and
 * what waits in the tabs the person may open.
 */
export const SiteOverview = Schema.Struct({
  site: SiteLabel,
  /**
   * The addresses that open the site: its first connected domain of its own,
   * and its Pakshi address, which seeded sites don't have.
   */
  addresses: Schema.Struct({
    own: Schema.NullOr(Schema.String),
    pakshi: Schema.NullOr(Schema.String),
  }),
  live: Release,
  /** The live home page, or null while the live site has none, as before its first publish. */
  home: Schema.NullOr(Schema.Struct({ ...SiteView.fields, page: PageDocument })),
  /** What waits in the Drafts and Blocks tabs, for someone who may edit the site. */
  editing: Schema.NullOr(
    Schema.Struct({
      openDrafts: Schema.Int,
      /** Open drafts whose submission waits for approval. */
      waitingDrafts: Schema.Int,
      /** Blocks the live site shows at an older version than the newest. */
      blockUpdates: Schema.Int,
      /** The open draft that brings the brand's newest look to the site. */
      brandUpdate: Schema.NullOr(Schema.Struct({ id: DraftId, name: DraftName })),
    }),
  ),
  /** Form entries from the last `newEntriesDays` days, for someone who may read them. */
  newEntries: Schema.NullOr(Schema.Int),
});
export type SiteOverview = typeof SiteOverview.Type;

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

/**
 * The registry no longer holds block versions a release pins, such as
 * `hero@1`, so it can't be brought back.
 */
export class BlocksRemoved extends Schema.TaggedError<BlocksRemoved>()("BlocksRemoved", {
  removed: Schema.Array(Schema.String),
}) {}

/** The theme has pairs of colors too hard to read, so it can't be saved. */
export class ThemeUnreadable extends Schema.TaggedError<ThemeUnreadable>()("ThemeUnreadable", {
  issues: Schema.Array(ContrastIssue),
}) {}

/** Someone saved the brand's look since it was loaded, so saving would undo their change. */
export class BrandChanged extends Schema.TaggedError<BrandChanged>()("BrandChanged", {
  revision: Schema.Int,
}) {}

/** A logo or icon isn't an image in the brand's library. */
export class NotInBrandLibrary extends Schema.TaggedError<NotInBrandLibrary>()(
  "NotInBrandLibrary",
  { media: MediaId },
) {}

/** The site has no release with this ID. */
export class ReleaseNotFound extends Schema.TaggedError<ReleaseNotFound>()("ReleaseNotFound", {
  release: ReleaseId,
}) {}

const siteError = Schema.Union([StudioUnavailable, SiteNotFound]);
const brandError = Schema.Union([StudioUnavailable, ScopeNotFound]);
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
  Rpc.make("organizationPeople", { success: People, error: StudioUnavailable }),
  /** Invites someone by email with a role on a scope, which they get when they accept. */
  Rpc.make("invite", {
    payload: { email: EmailAddress, role: RoleId, scope: Scope },
    success: SentInvitation,
    error: Schema.Union([
      StudioUnavailable,
      ScopeNotFound,
      RoleNotFound,
      NotPermitted,
      AlreadyMember,
    ]),
  }),
  /** A page of the audit log entries the person may read, newest first. */
  Rpc.make("auditLog", {
    payload: { query: AuditQuery, before: Schema.NullOr(AuditCursor) },
    success: AuditPage,
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  Rpc.make("auditFilters", {
    success: AuditFilters,
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  /** Every entry a query matches as CSV, newest first. */
  Rpc.make("exportAudit", {
    payload: { query: AuditQuery },
    success: Schema.Struct({ filename: Schema.String, csv: Schema.String }),
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  /** Pakshi's success metrics since a moment, for someone who may read the audit log. */
  Rpc.make("successMetrics", {
    payload: { since: Timestamp },
    success: SuccessMetrics,
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  /** Every role, with who holds it where. */
  Rpc.make("roles", { success: RolesView, error: StudioUnavailable }),
  /** Makes a custom role, or with an ID, changes one. */
  Rpc.make("saveRole", {
    payload: {
      role: Schema.NullOr(CustomRoleId),
      name: RoleName,
      description: RoleDescription,
      permissions: Schema.Array(Permission),
    },
    success: CustomRole,
    error: Schema.Union([StudioUnavailable, NotPermitted, RoleNotFound, RoleNameTaken]),
  }),
  Rpc.make("deleteRole", {
    payload: { role: CustomRoleId },
    error: Schema.Union([StudioUnavailable, NotPermitted, RoleNotFound, RoleInUse]),
  }),
  /** Who can work on a brand or a site, and the roles the viewer may give there. */
  Rpc.make("scopeMembers", {
    payload: { scope: Scope },
    success: ScopeMembers,
    error: Schema.Union([StudioUnavailable, ScopeNotFound]),
  }),
  /** Gives someone in the organization a role on a scope. */
  Rpc.make("grantRole", {
    payload: { person: Schema.String, role: RoleId, scope: Scope },
    error: Schema.Union([
      StudioUnavailable,
      ScopeNotFound,
      PersonNotFound,
      RoleNotFound,
      NotPermitted,
    ]),
  }),
  /** Gives someone a role on a scope in place of one they hold there. */
  Rpc.make("changeRole", {
    payload: { person: Schema.String, from: RoleId, to: RoleId, scope: Scope },
    error: Schema.Union([
      StudioUnavailable,
      ScopeNotFound,
      PersonNotFound,
      RoleNotFound,
      NotPermitted,
      LastOrgAdmin,
    ]),
  }),
  Rpc.make("revokeRole", {
    payload: { person: Schema.String, role: RoleId, scope: Scope },
    error: Schema.Union([
      StudioUnavailable,
      ScopeNotFound,
      PersonNotFound,
      RoleNotFound,
      NotPermitted,
      LastOrgAdmin,
    ]),
  }),
  /** Switches one permission on or off for someone on a scope, whatever their roles say. */
  Rpc.make("setOverride", {
    payload: {
      person: Schema.String,
      permission: Permission,
      scope: Scope,
      allowed: Schema.Boolean,
    },
    error: Schema.Union([StudioUnavailable, ScopeNotFound, PersonNotFound, NotPermitted]),
  }),
  Rpc.make("removeOverride", {
    payload: { person: Schema.String, permission: Permission, scope: Scope },
    error: Schema.Union([StudioUnavailable, ScopeNotFound, PersonNotFound, NotPermitted]),
  }),
  /** Takes away every role and override someone holds, so they can no longer open Studio's work. */
  Rpc.make("removeAllAccess", {
    payload: { person: Schema.String },
    error: Schema.Union([StudioUnavailable, PersonNotFound, NotPermitted, LastOrgAdmin]),
  }),
  Rpc.make("revokeInvitation", {
    payload: { invitation: InvitationId },
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  /** Adds an invitation's grant to the signed-in person, whose address it must have been sent to. */
  Rpc.make("acceptInvitation", {
    payload: { token: InvitationToken },
    error: Schema.Union([StudioUnavailable, InvitationClosed]),
  }),
  Rpc.make("createBrand", {
    payload: { name: BrandName, brandColor: HexColor },
    success: Schema.Struct({ id: BrandId }),
    error: Schema.Union([StudioUnavailable, NotPermitted, ThemeUnreadable]),
  }),
  Rpc.make("newSiteOptions", { success: NewSiteOptions, error: StudioUnavailable }),
  /** Makes a site with its platform subdomain, its first release and a first draft. */
  Rpc.make("createSite", {
    payload: { brand: BrandId, name: SiteName, address: SiteAddress },
    success: CreatedSite,
    error: Schema.Union([StudioUnavailable, ScopeNotFound, NotPermitted, AddressTaken]),
  }),
  Rpc.make("siteSettings", {
    payload: { site: SiteId },
    success: SiteSettingsView,
    error: siteError,
  }),
  /** Saves some of a site's settings. `seen` is the settings revision the person started from. */
  Rpc.make("saveSiteSettings", {
    payload: { site: SiteId, changes: SettingsChanges, seen: Schema.Int },
    success: SiteSettingsView,
    error: Schema.Union([
      StudioUnavailable,
      SiteNotFound,
      NotPermitted,
      SettingsChanged,
      ImageNotFound,
    ]),
  }),
  Rpc.make("siteDomains", {
    payload: { site: SiteId },
    success: SiteDomainsView,
    error: siteError,
  }),
  /** Adds a domain to a site, waiting for its DNS records. */
  Rpc.make("addDomain", {
    payload: { site: SiteId, hostname: Hostname },
    success: SiteDomainsView,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted, DomainTaken]),
  }),
  /** Checks a site's waiting domains now, rather than at the next scheduled check. */
  Rpc.make("checkDomains", {
    payload: { site: SiteId },
    success: SiteDomainsView,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  /** Takes a domain off a site. It stops serving the site at once. */
  Rpc.make("removeDomain", {
    payload: { site: SiteId, hostname: Schema.String },
    success: SiteDomainsView,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  /** Deletes a site. It stops serving at once, and its domains are released. */
  Rpc.make("deleteSite", {
    payload: { site: SiteId },
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  /** The sites deleted in the last 30 days, for an org admin, or none for anyone else. */
  Rpc.make("deletedSites", {
    success: Schema.Array(DeletedSite),
    error: StudioUnavailable,
  }),
  /** Brings back a site deleted in the last 30 days, at its Pakshi address. */
  Rpc.make("restoreSite", {
    payload: { site: SiteId },
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  /** Deletes a brand that has no sites. */
  Rpc.make("deleteBrand", {
    payload: { brand: BrandId },
    error: Schema.Union([StudioUnavailable, ScopeNotFound, NotPermitted, BrandHasSites]),
  }),
  Rpc.make("mediaLibrary", {
    payload: { site: SiteId },
    success: MediaLibraryView,
    error: siteError,
  }),
  /** Sets the alt text a library image suggests wherever it's placed next. */
  Rpc.make("saveAltText", {
    payload: { site: SiteId, media: MediaId, alt: Schema.String.check(Schema.isMaxLength(250)) },
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted, ImageNotFound]),
  }),
  Rpc.make("siteEntries", {
    payload: { site: SiteId },
    success: SiteEntriesView,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  /** A form's entries, newest first, after `before` and with an answer containing `search` when given. */
  Rpc.make("formEntries", {
    payload: {
      site: SiteId,
      form: FormId,
      search: Schema.NullOr(Schema.String),
      before: Schema.NullOr(EntryCursor),
    },
    success: EntriesPage,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  Rpc.make("formEntry", {
    payload: { site: SiteId, entry: EntryId },
    success: FormEntry,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted, EntryNotFound]),
  }),
  /** Every entry of a form as a CSV file, oldest first. */
  Rpc.make("exportEntries", {
    payload: { site: SiteId, form: FormId },
    success: Schema.Struct({ filename: Schema.String, csv: Schema.String }),
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  Rpc.make("deleteEntry", {
    payload: { site: SiteId, entry: EntryId },
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted, EntryNotFound]),
  }),
  /** How many entries gave an email address on each form, to show before deleting them. */
  Rpc.make("entriesFrom", {
    payload: { site: SiteId, email: EmailAddress },
    success: Schema.Array(EntriesFrom),
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
  }),
  /** Deletes every entry that gave an email address, for someone who asks for their data to go. */
  Rpc.make("deleteEntriesFor", {
    payload: { site: SiteId, email: EmailAddress },
    success: Schema.Struct({ deleted: Schema.Int }),
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted]),
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
  Rpc.make("siteOverview", { payload: { site: SiteId }, success: SiteOverview, error: siteError }),
  Rpc.make("siteReleases", { payload: { site: SiteId }, success: SiteReleases, error: siteError }),
  Rpc.make("rollBack", {
    payload: { site: SiteId },
    success: Release,
    error: Schema.Union([
      StudioUnavailable,
      SiteNotFound,
      NotPermitted,
      NothingToRollBack,
      BlocksRemoved,
    ]),
  }),
  Rpc.make("restoreRelease", {
    payload: { site: SiteId, release: ReleaseId, name: DraftName },
    success: DraftSummary,
    error: Schema.Union([StudioUnavailable, SiteNotFound, ReleaseNotFound, BlocksRemoved]),
  }),
  Rpc.make("brands", { success: Schema.Array(BrandSummary), error: StudioUnavailable }),
  Rpc.make("brand", { payload: { brand: BrandId }, success: BrandView, error: brandError }),
  /**
   * Saves a brand's theme and identity as a new revision, which reaches each
   * of its sites as a Brand update draft. `seen` is the revision the person
   * started from.
   */
  Rpc.make("saveBrandLook", {
    payload: { brand: BrandId, look: BrandLook, seen: Schema.Int },
    success: SavedLook,
    error: Schema.Union([
      StudioUnavailable,
      ScopeNotFound,
      NotPermitted,
      ThemeUnreadable,
      BrandChanged,
      NotInBrandLibrary,
    ]),
  }),
  Rpc.make("saveVoiceGuide", {
    payload: { brand: BrandId, voice: VoiceGuide },
    success: VoiceGuide,
    error: Schema.Union([StudioUnavailable, ScopeNotFound, NotPermitted]),
  }),
  Rpc.make("blockUpdates", {
    success: BlockUpdates,
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  /** The sites the person works on whose live release shows a block, by name. */
  Rpc.make("blockUsage", {
    payload: { type: BlockType },
    success: Schema.Array(BlockUse),
    error: StudioUnavailable,
  }),
  Rpc.make("blockRequests", { success: BlockRequests, error: StudioUnavailable }),
  /** Asks the platform team for a block, for one site or, with null, for any. */
  Rpc.make("requestBlock", {
    payload: { site: Schema.NullOr(SiteId), need: BlockNeed, example: BlockExample },
    success: BlockRequest,
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  Rpc.make("closeBlockRequest", {
    payload: { request: BlockRequestId },
    error: Schema.Union([StudioUnavailable, NotPermitted]),
  }),
  Rpc.make("siteBlocks", { payload: { site: SiteId }, success: SiteBlocks, error: siteError }),
  /** A draft that moves the site to the newest version of a block. */
  Rpc.make("adoptUpgrade", {
    payload: { site: SiteId, type: BlockType },
    success: DraftSummary,
    error: Schema.Union([StudioUnavailable, SiteNotFound, NotPermitted, UpToDate]),
  }),
  /** Upgrade drafts on every site whose live release shows an older version of a block. */
  Rpc.make("upgradeEverywhere", {
    payload: { type: BlockType },
    success: Schema.Array(UpgradeResult),
    error: Schema.Union([StudioUnavailable, NotPermitted]),
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
    error: Schema.Union([StudioUnavailable, ScopeNotFound, NotPermitted, RoleNotFound]),
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
  /** The organization's name, or null on a stage nobody has set up yet. */
  Rpc.make("organization", {
    success: Schema.NullOr(Schema.Struct({ name: OrganizationName })),
    error: StudioUnavailable,
  }),
  Rpc.make("invitation", {
    payload: { token: InvitationToken },
    success: InvitationView,
    error: StudioUnavailable,
  }),
  Rpc.make("previewPage", {
    payload: { ...forDraft, path: PagePath },
    success: PreviewPage,
    error: StudioUnavailable,
  }),
).middleware(VisitorSession) {}

/** Everything Studio asks of studio-api. */
export class StudioRpcs extends SignedInRpcs.merge(VisitorRpcs) {}
