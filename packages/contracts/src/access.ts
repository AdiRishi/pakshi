import { Schema } from "effect";

import { BrandId, SiteId } from "./ids.ts";

/** Every action Pakshi checks. Studio, the API, the agent and live editing all ask about these. */
export const Permission = Schema.Literals([
  "org.settings.edit",
  "roles.manage",
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

/** The roles Pakshi ships. Grants give a person one of these on a scope. */
export const DefaultRole = Schema.Literals([
  "org-admin",
  "brand-admin",
  "site-admin",
  "editor",
  "approver",
  "submissions-viewer",
]);
export type DefaultRole = typeof DefaultRole.Type;

export const roleTitles = {
  "org-admin": "Org admin",
  "brand-admin": "Brand admin",
  "site-admin": "Site admin",
  editor: "Editor",
  approver: "Approver",
  "submissions-viewer": "Submissions viewer",
} as const satisfies Record<DefaultRole, string>;

/** Where a grant, an override or a workflow applies. Each reaches everything below its scope. */
export const Scope = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("organization") }),
  Schema.Struct({ kind: Schema.Literal("brand"), id: BrandId }),
  Schema.Struct({ kind: Schema.Literal("site"), id: SiteId }),
]);
export type Scope = typeof Scope.Type;
