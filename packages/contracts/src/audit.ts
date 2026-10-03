import { Schema } from "effect";

import { Permission, RoleRef } from "./access.ts";
import { NamedScope } from "./accounts.ts";
import { EmailAddress } from "./email.ts";
import {
  BlockType,
  BrandId,
  DraftId,
  EntryId,
  FormId,
  ReleaseId,
  SiteId,
  SubmissionId,
  TurnId,
} from "./ids.ts";
import { Collaborator } from "./live.ts";
import { Timestamp } from "./release.ts";
import { Audience, ShareAccess } from "./sharing.ts";

/*
 * The audit log: everything people and Pakshi did in Studio, with who, when
 * and what. Entries are written by the code that makes each change and are
 * never changed or deleted by anyone; the only entries rewritten are ones
 * still growing, such as an editing session, which their writer updates as it
 * goes on.
 */

export const AuditId = Schema.String.check(Schema.isPattern(/^aud_[A-Za-z0-9:_-]{1,128}$/)).pipe(
  Schema.brand("AuditId"),
);
export type AuditId = typeof AuditId.Type;

const DraftRef = Schema.Struct({ id: DraftId, name: Schema.String });

/** What happened, by kind. Each names what it changed as it was named then. */
export const AuditEvent = Schema.TaggedUnion({
  /** A person's run of edits in a draft, which ends after half an hour without one. */
  EditingSession: { draft: DraftRef, batches: Schema.Int, startedAt: Timestamp },
  /** The agent changed a draft for its person in one turn. */
  AgentTurn: { draft: DraftRef, turn: TurnId, batches: Schema.Int },
  /** A person undid one of the agent's turns. */
  AgentTurnUndone: { draft: DraftRef, turn: TurnId },
  DraftCreated: { draft: DraftRef },
  DraftClosed: { draft: DraftRef },
  DraftShared: {
    draft: DraftRef,
    people: Schema.Int,
    audience: Audience,
    access: ShareAccess,
  },
  /** A draft that was behind took in the live release, with the conflicts a person resolved. */
  DraftUpdated: { draft: DraftRef, conflicts: Schema.Int },
  /** An older release came back as a draft. */
  DraftRestored: { draft: DraftRef, release: ReleaseId },
  /** A draft upgrading one block to a newer version. */
  BlockUpgradeDraft: { draft: DraftRef, block: BlockType, version: Schema.Int },
  /** Upgrade drafts made on every site that uses an older version of a block. */
  BlockUpgradeEverywhere: { block: BlockType, version: Schema.Int, sites: Schema.Int },
  /** A brand's look was saved, making Brand update drafts on its sites. */
  BrandLookSaved: { revision: Schema.Int, sites: Schema.Int },
  VoiceGuideSaved: {},
  /** A draft submitted for approval, with when it was started, for the time a change takes. */
  SubmittedForApproval: { draft: DraftRef, submission: SubmissionId, draftStartedAt: Timestamp },
  ApprovalDecision: {
    draft: DraftRef,
    submission: SubmissionId,
    step: Schema.Int,
    decision: Schema.Literals(["approved", "changes-requested"]),
  },
  Published: { draft: DraftRef, release: ReleaseId },
  RolledBack: { release: ReleaseId, undid: ReleaseId },
  /**
   * KV served something other than the site's live release, a change no
   * publish or rollback made, and Pakshi put the live release back.
   */
  LiveReleaseRestored: { release: ReleaseId, served: Schema.NullOr(Schema.String) },
  RoleGranted: { person: Collaborator, role: RoleRef, scope: NamedScope },
  RoleRevoked: { person: Collaborator, role: RoleRef, scope: NamedScope },
  OverrideSet: {
    person: Collaborator,
    permission: Permission,
    scope: NamedScope,
    allowed: Schema.Boolean,
  },
  OverrideRemoved: { person: Collaborator, permission: Permission, scope: NamedScope },
  Invited: { email: EmailAddress, role: RoleRef, scope: NamedScope },
  InvitationWithdrawn: { email: EmailAddress, role: RoleRef, scope: NamedScope },
  /** Someone joined, or took an invitation's grant onto their account. */
  InvitationAccepted: { role: RoleRef, scope: NamedScope },
  RoleCreated: { role: RoleRef, permissions: Schema.Array(Permission) },
  RoleChanged: {
    role: RoleRef,
    added: Schema.Array(Permission),
    removed: Schema.Array(Permission),
  },
  RoleDeleted: { role: RoleRef },
  WorkflowChanged: { scope: NamedScope, steps: Schema.NullOr(Schema.Int) },
  SettingsSaved: { settings: Schema.Array(Schema.String) },
  DomainAdded: { hostname: Schema.String },
  DomainProven: { hostname: Schema.String },
  DomainRemoved: { hostname: Schema.String },
  /** Someone opened a form's entries, or with `entry`, one of them. */
  EntriesViewed: { form: Schema.String, formId: FormId, entry: Schema.NullOr(EntryId) },
  EntriesExported: { form: Schema.String, formId: FormId, entries: Schema.Int },
  /**
   * Someone deleted one entry, or everything one person sent. The person's
   * email address isn't kept, since their data was deleted at their request.
   */
  EntriesDeleted: { entries: Schema.Int, onePerson: Schema.Boolean },
  OrganizationSetUp: { name: Schema.String },
  BrandCreated: { name: Schema.String },
  BrandDeleted: { name: Schema.String },
  SiteCreated: { name: Schema.String },
  SiteDeleted: { name: Schema.String },
  SiteRestored: { name: Schema.String },
  /** A site deleted 30 days ago, erased for good. */
  SitePurged: { name: Schema.String },
  BlockRequested: { need: Schema.String },
});
export type AuditEvent = typeof AuditEvent.Type;
export type AuditEventTag = AuditEvent["_tag"];

/** One entry: who did what, when, and the site or brand it was on. A null actor is Pakshi itself. */
export const AuditEntry = Schema.Struct({
  id: AuditId,
  at: Timestamp,
  actor: Schema.NullOr(Collaborator),
  site: Schema.NullOr(SiteId),
  brand: Schema.NullOr(BrandId),
  event: AuditEvent,
});
export type AuditEntry = typeof AuditEntry.Type;

/** The kinds of event the audit log filters by. */
export const AuditKind = Schema.Literals([
  "editing",
  "agent",
  "drafts",
  "sharing",
  "updates",
  "restores",
  "upgrades",
  "brands",
  "submitted",
  "decisions",
  "publishes",
  "rollbacks",
  "permissions",
  "workflows",
  "settings",
  "entries",
  "sites",
]);
export type AuditKind = typeof AuditKind.Type;

/** Each kind's title, and the events it covers. */
export const auditKinds = {
  editing: { title: "Editing sessions", events: ["EditingSession"] },
  agent: { title: "Pakshi changes", events: ["AgentTurn", "AgentTurnUndone"] },
  drafts: { title: "Drafts created and closed", events: ["DraftCreated", "DraftClosed"] },
  sharing: { title: "Drafts shared", events: ["DraftShared"] },
  updates: { title: "Draft updates", events: ["DraftUpdated"] },
  restores: { title: "Restored as drafts", events: ["DraftRestored"] },
  upgrades: {
    title: "Block upgrade drafts",
    events: ["BlockUpgradeDraft", "BlockUpgradeEverywhere", "BlockRequested"],
  },
  brands: {
    title: "Brands",
    events: ["BrandLookSaved", "VoiceGuideSaved", "BrandCreated", "BrandDeleted"],
  },
  submitted: { title: "Submitted for approval", events: ["SubmittedForApproval"] },
  decisions: { title: "Approval decisions", events: ["ApprovalDecision"] },
  publishes: { title: "Publishes", events: ["Published"] },
  rollbacks: { title: "Rollbacks", events: ["RolledBack", "LiveReleaseRestored"] },
  permissions: {
    title: "Permission changes",
    events: [
      "RoleGranted",
      "RoleRevoked",
      "OverrideSet",
      "OverrideRemoved",
      "Invited",
      "InvitationWithdrawn",
      "InvitationAccepted",
      "RoleCreated",
      "RoleChanged",
      "RoleDeleted",
      "OrganizationSetUp",
    ],
  },
  workflows: { title: "Workflow changes", events: ["WorkflowChanged"] },
  settings: {
    title: "Settings changes",
    events: ["SettingsSaved", "DomainAdded", "DomainProven", "DomainRemoved"],
  },
  entries: {
    title: "Submissions viewed, exported, deleted",
    events: ["EntriesViewed", "EntriesExported", "EntriesDeleted"],
  },
  sites: {
    title: "Sites created, deleted or restored",
    events: ["SiteCreated", "SiteDeleted", "SiteRestored", "SitePurged"],
  },
} as const satisfies Record<
  AuditKind,
  { readonly title: string; readonly events: ReadonlyArray<AuditEventTag> }
>;

/** Where a page of the audit log ends, for asking for the page after it. */
export const AuditCursor = Schema.Struct({ at: Timestamp, id: AuditId });
export type AuditCursor = typeof AuditCursor.Type;

/** Which entries to list: by whom, on which site, of which kinds, and when. Empty means all. */
export const AuditQuery = Schema.Struct({
  person: Schema.NullOr(Schema.String),
  site: Schema.NullOr(SiteId),
  kinds: Schema.Array(AuditKind),
  since: Schema.NullOr(Timestamp),
  until: Schema.NullOr(Timestamp),
});
export type AuditQuery = typeof AuditQuery.Type;

/** An entry with the names of the site and brand it was on, as they are now. */
export const AuditRow = Schema.Struct({
  entry: AuditEntry,
  site: Schema.NullOr(Schema.String),
  brand: Schema.NullOr(Schema.String),
});
export type AuditRow = typeof AuditRow.Type;

/** One page of entries, newest first, how many match in all, and where the next page starts. */
export const AuditPage = Schema.Struct({
  rows: Schema.Array(AuditRow),
  total: Schema.Int,
  next: Schema.NullOr(AuditCursor),
});
export type AuditPage = typeof AuditPage.Type;

/** The people and sites the audit log can be filtered by, for someone who may read it. */
export const AuditFilters = Schema.Struct({
  people: Schema.Array(Collaborator),
  sites: Schema.Array(Schema.Struct({ id: SiteId, name: Schema.String })),
});
export type AuditFilters = typeof AuditFilters.Type;
