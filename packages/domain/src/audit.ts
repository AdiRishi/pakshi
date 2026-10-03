import { permissionDetails } from "@repo/contracts/access";
import type { NamedScope } from "@repo/contracts/accounts";
import type { AuditEvent, AuditEventTag } from "@repo/contracts/audit";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

const where = (scope: NamedScope) => {
  switch (scope.kind) {
    case "organization":
      return `across ${scope.name}`;
    case "brand":
      return `on ${scope.name} and its sites`;
    case "site":
      return `on ${scope.name}`;
  }
};

const permission = (name: keyof typeof permissionDetails) => permissionDetails[name].title;

const audiences = {
  people: "only the people named",
  organization: "everyone in the organization",
  link: "anyone with the link",
} as const;

/** What an audit entry says happened, in a sentence, as the audit log and its export show it. */
export const describeAuditEvent = (event: AuditEvent): string => {
  switch (event._tag) {
    case "EditingSession":
      return `Edited "${event.draft.name}", ${plural(event.batches, "change")}`;
    case "AgentTurn":
      return `Pakshi changed "${event.draft.name}", ${plural(event.batches, "change")}`;
    case "AgentTurnUndone":
      return `Undid a turn of Pakshi's changes to "${event.draft.name}"`;
    case "DraftCreated":
      return `Started the draft "${event.draft.name}"`;
    case "DraftClosed":
      return `Closed the draft "${event.draft.name}"`;
    case "DraftShared":
      return `Shared "${event.draft.name}" with ${plural(event.people, "person", "people")} and ${audiences[event.audience]}, who can ${event.access}`;
    case "DraftUpdated":
      return event.conflicts === 0
        ? `Updated "${event.draft.name}" with the live site, no conflicts`
        : `Updated "${event.draft.name}" with the live site, resolving ${plural(event.conflicts, "conflict")}`;
    case "DraftRestored":
      return `Restored an older release as the draft "${event.draft.name}"`;
    case "BlockUpgradeDraft":
      return `Started "${event.draft.name}" to upgrade ${event.block} to v${event.version}`;
    case "BlockUpgradeEverywhere":
      return `Created ${event.block} v${event.version} upgrade drafts on ${plural(event.sites, "site")}`;
    case "BrandLookSaved":
      return `Saved the brand's look as revision ${event.revision}. Brand update drafts on ${plural(event.sites, "site")}`;
    case "VoiceGuideSaved":
      return "Saved the brand's voice guide";
    case "SubmittedForApproval":
      return `Submitted "${event.draft.name}" for approval`;
    case "ApprovalDecision":
      return event.decision === "approved"
        ? `Approved step ${event.step + 1} of "${event.draft.name}"`
        : `Requested changes to "${event.draft.name}" at step ${event.step + 1}`;
    case "Published":
      return `Published "${event.draft.name}"`;
    case "RolledBack":
      return "Undid the latest publish";
    case "LiveReleaseRestored":
      return "Put the live release back, after the site was found serving something no publish made";
    case "RoleGranted":
      return `Gave ${event.person.name} ${event.role.name} ${where(event.scope)}`;
    case "RoleRevoked":
      return `Took ${event.role.name} ${where(event.scope)} from ${event.person.name}`;
    case "OverrideSet":
      return `Override for ${event.person.name}: switched ${event.allowed ? "on" : "off"} ${permission(event.permission)} ${where(event.scope)}`;
    case "OverrideRemoved":
      return `Removed the override of ${permission(event.permission)} for ${event.person.name} ${where(event.scope)}`;
    case "Invited":
      return `Invited ${event.email} as ${event.role.name} ${where(event.scope)}`;
    case "InvitationWithdrawn":
      return `Withdrew the invitation for ${event.email}`;
    case "InvitationAccepted":
      return `Joined as ${event.role.name} ${where(event.scope)}`;
    case "RoleCreated":
      return `Created the role ${event.role.name}, with ${plural(event.permissions.length, "permission")}`;
    case "RoleChanged":
      return [
        `Changed the role ${event.role.name}`,
        ...(event.added.length === 0 ? [] : [`added ${event.added.map(permission).join(", ")}`]),
        ...(event.removed.length === 0
          ? []
          : [`removed ${event.removed.map(permission).join(", ")}`]),
      ].join(". ");
    case "RoleDeleted":
      return `Deleted the role ${event.role.name}`;
    case "WorkflowChanged":
      return event.steps === null
        ? `Set the approval workflow ${where(event.scope)} to the one above it`
        : `Set the approval workflow ${where(event.scope)} to ${plural(event.steps, "step")}`;
    case "SettingsSaved":
      return `Saved settings: ${event.settings.join(", ")}`;
    case "DomainAdded":
      return `Added the domain ${event.hostname}`;
    case "DomainProven":
      return `Proved ownership of ${event.hostname}, which now serves the site`;
    case "DomainRemoved":
      return `Removed the domain ${event.hostname}`;
    case "EntriesViewed":
      return event.entry === null
        ? `Looked through the entries of ${event.form}`
        : `Opened an entry of ${event.form}`;
    case "EntriesExported":
      return `Downloaded ${plural(event.entries, "entry", "entries")} of ${event.form}`;
    case "EntriesDeleted":
      return event.onePerson
        ? `Deleted everything one person sent: ${plural(event.entries, "entry", "entries")}`
        : "Deleted an entry";
    case "OrganizationSetUp":
      return `Set up ${event.name} on Pakshi`;
    case "BrandCreated":
      return `Created the brand ${event.name}`;
    case "BrandDeleted":
      return `Deleted the brand ${event.name}`;
    case "SiteCreated":
      return `Created the site ${event.name}`;
    case "SiteDeleted":
      return `Deleted the site ${event.name}. Org admins can restore it for 30 days`;
    case "SiteRestored":
      return `Restored the site ${event.name}`;
    case "SitePurged":
      return `Deleted ${event.name} for good, 30 days after it was deleted`;
    case "BlockRequested":
      return `Asked for a new block: ${event.need}`;
  }
};

/** What kind of thing each event is, as the audit log's Event column names it. */
export const auditEventTitles = {
  EditingSession: "Editing session",
  AgentTurn: "Pakshi change",
  AgentTurnUndone: "Pakshi change undone",
  DraftCreated: "Draft created",
  DraftClosed: "Draft closed",
  DraftShared: "Draft shared",
  DraftUpdated: "Draft updated",
  DraftRestored: "Restored as a draft",
  BlockUpgradeDraft: "Block upgrade draft",
  BlockUpgradeEverywhere: "Block upgrade drafts",
  BrandLookSaved: "Brand update",
  VoiceGuideSaved: "Voice guide saved",
  SubmittedForApproval: "Submitted for approval",
  ApprovalDecision: "Approval decision",
  Published: "Publish",
  RolledBack: "Rollback",
  LiveReleaseRestored: "Live release restored",
  RoleGranted: "Permission change",
  RoleRevoked: "Permission change",
  OverrideSet: "Permission change",
  OverrideRemoved: "Permission change",
  Invited: "Invitation",
  InvitationWithdrawn: "Invitation withdrawn",
  InvitationAccepted: "Joined",
  RoleCreated: "Role created",
  RoleChanged: "Role changed",
  RoleDeleted: "Role deleted",
  WorkflowChanged: "Workflow change",
  SettingsSaved: "Settings change",
  DomainAdded: "Domain added",
  DomainProven: "Domain connected",
  DomainRemoved: "Domain removed",
  EntriesViewed: "Submissions viewed",
  EntriesExported: "Submissions exported",
  EntriesDeleted: "Submissions deleted",
  OrganizationSetUp: "Organization set up",
  BrandCreated: "Brand created",
  BrandDeleted: "Brand deleted",
  SiteCreated: "Site created",
  SiteDeleted: "Site deleted",
  SiteRestored: "Site restored",
  SitePurged: "Site deleted for good",
  BlockRequested: "Block requested",
} as const satisfies Record<AuditEventTag, string>;
