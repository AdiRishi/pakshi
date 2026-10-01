import { Schema } from "effect";

import { BrandId, CustomRoleId, SiteId } from "./ids.ts";

/** Every action Pakshi checks. Studio, the API, the agent and live editing all ask about these. */
export const Permission = Schema.Literals([
  "org.settings.edit",
  "roles.manage",
  "audit.read",
  "brand.create",
  "brand.delete",
  "brand.theme.edit",
  "site.create",
  "site.delete",
  "site.settings.edit",
  "members.manage",
  "workflow.edit",
  "page.edit",
  "draft.share",
  "site.publish",
  "site.approve",
  "site.approve_own",
  "site.rollback",
  "blocks.upgrade",
  "blocks.request",
  "submissions.read",
  "submissions.export",
  "submissions.delete",
]);
export type Permission = typeof Permission.Type;

/** The areas permissions are grouped in on the roles and people screens, in order. */
export const permissionGroups = [
  "Drafts and publishing",
  "Approvals",
  "Brands and sites",
  "Form submissions",
  "Organization",
] as const;

/** What each permission lets someone do, as Studio describes it. */
export const permissionDetails = {
  "page.edit": {
    group: "Drafts and publishing",
    title: "Create and edit drafts",
    description: "Work on pages with Pakshi or in the editor.",
  },
  "draft.share": {
    group: "Drafts and publishing",
    title: "Share drafts",
    description: "Share a draft with people, the organization or anyone with the link.",
  },
  "site.publish": {
    group: "Drafts and publishing",
    title: "Submit for approval, or publish",
    description: "Publishes at once when the workflow has no steps.",
  },
  "site.rollback": {
    group: "Drafts and publishing",
    title: "Roll back",
    description: "Undo the latest publish, or restore an older release as a draft.",
  },
  "blocks.upgrade": {
    group: "Drafts and publishing",
    title: "Adopt block upgrades",
    description: "Start a draft that moves a site to a newer block.",
  },
  "blocks.request": {
    group: "Drafts and publishing",
    title: "Request a new block",
    description: "Ask the platform team for a block you need.",
  },
  "site.approve": {
    group: "Approvals",
    title: "Approve or request changes",
    description: "Decide when a workflow step names this person or role.",
  },
  "site.approve_own": {
    group: "Approvals",
    title: "Approve changes you edited",
    description: "Approve a draft you changed. No default role but org admin has it.",
  },
  "workflow.edit": {
    group: "Approvals",
    title: "Edit approval workflows",
    description: "Choose the approval steps and approvers.",
  },
  "brand.theme.edit": {
    group: "Brands and sites",
    title: "Edit brand theme, identity and voice guide",
    description: "Colors, fonts, logo, favicon and how Pakshi writes.",
  },
  "site.create": {
    group: "Brands and sites",
    title: "Create sites",
    description: "Start a new site in a brand.",
  },
  "site.delete": {
    group: "Brands and sites",
    title: "Delete sites",
    description: "Delete a site. Org admins can restore it for 30 days.",
  },
  "site.settings.edit": {
    group: "Brands and sites",
    title: "Manage site settings and domains",
    description: "Connect addresses, name the site, set where form entries are emailed.",
  },
  "members.manage": {
    group: "Brands and sites",
    title: "Manage members",
    description: "Invite people and change their access, with permissions you hold.",
  },
  "submissions.read": {
    group: "Form submissions",
    title: "Read form submissions",
    description: "Open what visitors sent. Each view is logged.",
  },
  "submissions.export": {
    group: "Form submissions",
    title: "Export form submissions",
    description: "Download entries as CSV. Each export is logged.",
  },
  "submissions.delete": {
    group: "Form submissions",
    title: "Delete form submissions",
    description: "Delete an entry, or everything one person sent.",
  },
  "brand.create": {
    group: "Organization",
    title: "Create brands",
    description: "Start a new brand with its theme.",
  },
  "brand.delete": {
    group: "Organization",
    title: "Delete brands",
    description: "Delete a brand that has no sites.",
  },
  "roles.manage": {
    group: "Organization",
    title: "Manage roles",
    description: "Create and change custom roles, including this one.",
  },
  "org.settings.edit": {
    group: "Organization",
    title: "Edit organization settings",
    description: "Change how the organization is set up.",
  },
  "audit.read": {
    group: "Organization",
    title: "Read the audit log",
    description: "See everything people and Pakshi did, and export it.",
  },
} as const satisfies Record<
  Permission,
  {
    readonly group: (typeof permissionGroups)[number];
    readonly title: string;
    readonly description: string;
  }
>;

/** The roles Pakshi ships. They can't be edited; a custom role starts as a copy of one. */
export const DefaultRole = Schema.Literals([
  "org-admin",
  "brand-admin",
  "site-admin",
  "editor",
  "approver",
  "submissions-viewer",
]);
export type DefaultRole = typeof DefaultRole.Type;

export const defaultRoleDetails = {
  "org-admin": { name: "Org admin", description: "Everything, everywhere in the organization." },
  "brand-admin": {
    name: "Brand admin",
    description: "Runs a brand: its look, its sites, their workflows and people.",
  },
  "site-admin": {
    name: "Site admin",
    description: "Runs a site: its settings, domains, members and form entries.",
  },
  editor: { name: "Editor", description: "Edits, shares and publishes drafts." },
  approver: { name: "Approver", description: "Decides when a workflow step names them." },
  "submissions-viewer": {
    name: "Submissions viewer",
    description: "Reads and exports what visitors send through forms.",
  },
} as const satisfies Record<DefaultRole, { readonly name: string; readonly description: string }>;

/** A default role, or one the organization's admins made. Grants and workflow steps name roles by it. */
export const RoleId = Schema.Union([DefaultRole, CustomRoleId]);
export type RoleId = typeof RoleId.Type;

/** A role as people see it named. */
export const RoleRef = Schema.Struct({ id: RoleId, name: Schema.String });
export type RoleRef = typeof RoleRef.Type;

export const RoleName = Schema.Trim.check(
  Schema.isMinLength(1, { message: "Give the role a name" }),
  Schema.isMaxLength(40, { message: "Use at most 40 characters" }),
);

export const RoleDescription = Schema.Trim.check(
  Schema.isMaxLength(200, { message: "Use at most 200 characters" }),
);

/** A named set of permissions, for giving access quickly. */
export const Role = Schema.Struct({
  id: RoleId,
  name: Schema.String,
  description: Schema.String,
  permissions: Schema.Array(Permission),
});
export type Role = typeof Role.Type;

/** A role the organization's admins made, which they can change. */
export const CustomRole = Schema.Struct({ ...Role.fields, id: CustomRoleId });
export type CustomRole = typeof CustomRole.Type;

/** Where a grant, an override or a workflow applies. Each reaches everything below its scope. */
export const Scope = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("organization") }),
  Schema.Struct({ kind: Schema.Literal("brand"), id: BrandId }),
  Schema.Struct({ kind: Schema.Literal("site"), id: SiteId }),
]);
export type Scope = typeof Scope.Type;
