import { DefaultRole, Permission, Scope } from "@repo/contracts/access";
import type { BrandId, SiteId } from "@repo/contracts/ids";
import { Schema } from "effect";

const siteWork = [
  "page.edit",
  "draft.share",
  "site.publish",
  "site.rollback",
  "blocks.upgrade",
  "blocks.request",
] as const satisfies ReadonlyArray<Permission>;

const siteAdministration = [
  ...siteWork,
  "site.settings.edit",
  "members.manage",
  "submissions.read",
  "submissions.export",
] as const satisfies ReadonlyArray<Permission>;

/** The permissions each default role holds. */
export const defaultRoles = {
  "org-admin": Permission.literals,
  "brand-admin": [
    ...siteAdministration,
    "brand.theme.edit",
    "site.create",
    "site.delete",
    "workflow.edit",
  ],
  "site-admin": siteAdministration,
  editor: siteWork,
  approver: ["site.approve"],
  "submissions-viewer": ["submissions.read", "submissions.export"],
} as const satisfies Record<DefaultRole, ReadonlyArray<Permission>>;

/** The thing being acted on. A site names its brand, because a brand's grants reach its sites. */
export type Resource =
  | { readonly kind: "organization" }
  | { readonly kind: "brand"; readonly id: BrandId }
  | { readonly kind: "site"; readonly id: SiteId; readonly brand: BrandId };

export const Grant = Schema.Struct({ role: DefaultRole, scope: Scope });
export type Grant = typeof Grant.Type;

export const Override = Schema.Struct({
  permission: Permission,
  scope: Scope,
  allowed: Schema.Boolean,
});
export type Override = typeof Override.Type;

/** A person's grants and overrides, as stored in D1 `core`. */
export interface Access {
  readonly grants: ReadonlyArray<Grant>;
  readonly overrides: ReadonlyArray<Override>;
}

/** How specific a scope is when it covers the resource, or `null` when it doesn't cover it. */
const reach = (scope: Scope, resource: Resource) => {
  switch (scope.kind) {
    case "organization":
      return 0;
    case "brand":
      return (resource.kind === "brand" && resource.id === scope.id) ||
        (resource.kind === "site" && resource.brand === scope.id)
        ? 1
        : null;
    case "site":
      return resource.kind === "site" && resource.id === scope.id ? 2 : null;
  }
};

/**
 * May this person do this action on this thing? The most specific override
 * that covers the resource decides; without one, any grant that covers the
 * resource and whose role holds the permission allows it.
 */
export const authorize = (access: Access, permission: Permission, resource: Resource) => {
  let decidingOverride: { readonly depth: number; readonly allowed: boolean } | null = null;
  for (const override of access.overrides) {
    const depth = reach(override.scope, resource);
    if (override.permission !== permission || depth === null) continue;
    if (decidingOverride === null || depth > decidingOverride.depth)
      decidingOverride = { depth, allowed: override.allowed };
  }
  if (decidingOverride !== null) return decidingOverride.allowed;
  return access.grants.some(
    (grant) =>
      reach(grant.scope, resource) !== null &&
      defaultRoles[grant.role].some((held) => held === permission),
  );
};

/** Every permission a person holds on this thing. */
export const permissionsOn = (access: Access, resource: Resource) =>
  Permission.literals.filter((permission) => authorize(access, permission, resource));

/** The roles a person holds through grants that cover this thing. */
export const rolesOn = (access: Access, resource: Resource) =>
  DefaultRole.literals.filter((role) =>
    access.grants.some((grant) => grant.role === role && reach(grant.scope, resource) !== null),
  );
