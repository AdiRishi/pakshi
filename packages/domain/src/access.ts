import {
  type DefaultRole,
  defaultRoleDetails,
  Permission,
  type Role,
  type RoleId,
  type Scope,
} from "@repo/contracts/access";
import type { BrandId, SiteId } from "@repo/contracts/ids";

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
  "submissions.delete",
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

export const isDefaultRole = (role: RoleId): role is DefaultRole =>
  Object.hasOwn(defaultRoles, role);

/** A default role as a role. */
export const defaultRole = (id: DefaultRole): Role => ({
  id,
  ...defaultRoleDetails[id],
  permissions: defaultRoles[id],
});

/** The thing being acted on. A site names its brand, because a brand's grants reach its sites. */
export type Resource =
  | { readonly kind: "organization" }
  | { readonly kind: "brand"; readonly id: BrandId }
  | { readonly kind: "site"; readonly id: SiteId; readonly brand: BrandId };

/** A role a person holds on a scope, with the permissions the role holds now. */
export interface Grant {
  readonly role: RoleId;
  readonly permissions: ReadonlyArray<Permission>;
  readonly scope: Scope;
}

/** One permission switched on or off for one person on one scope. */
export interface Override {
  readonly permission: Permission;
  readonly scope: Scope;
  readonly allowed: boolean;
}

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

/** Whether a grant, an override or a workflow on this scope reaches this thing. */
export const covers = (scope: Scope, resource: Resource) => reach(scope, resource) !== null;

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
    (grant) => reach(grant.scope, resource) !== null && grant.permissions.includes(permission),
  );
};

/** Every permission a person holds on this thing. */
export const permissionsOn = (access: Access, resource: Resource) =>
  Permission.literals.filter((permission) => authorize(access, permission, resource));

/** The roles a person holds through grants that cover this thing. */
export const rolesOn = (access: Access, resource: Resource): ReadonlyArray<RoleId> =>
  Array.from(
    new Set(
      access.grants.flatMap((grant) => (reach(grant.scope, resource) === null ? [] : [grant.role])),
    ),
  );

/*
 * Delegation: a person can grant only permissions they hold, on scopes they
 * control. They control a scope where they hold `members.manage`.
 */

/** May this person give, or take away, a role with these permissions on this thing? */
export const mayGrant = (
  access: Access,
  permissions: ReadonlyArray<Permission>,
  resource: Resource,
) =>
  authorize(access, "members.manage", resource) &&
  permissions.every((permission) => authorize(access, permission, resource));

/** May this person switch this permission on or off for someone on this thing? */
export const mayOverride = (access: Access, permission: Permission, resource: Resource) =>
  mayGrant(access, [permission], resource);

/**
 * May this person define a role holding these permissions? A role reaches
 * wherever it's granted, so they need `roles.manage` and every permission
 * across the organization.
 */
export const mayDefineRole = (access: Access, permissions: ReadonlyArray<Permission>) =>
  permissions.every((permission) => authorize(access, permission, { kind: "organization" })) &&
  authorize(access, "roles.manage", { kind: "organization" });
