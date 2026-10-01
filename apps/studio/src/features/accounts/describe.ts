import type { RoleRef } from "@repo/contracts/access";
import type { NamedScope } from "@repo/contracts/accounts";

/** A role where it applies, such as "Editor on Northbank Libraries" or "Org admin". */
export const describeGrant = (role: RoleRef, scope: NamedScope) => {
  switch (scope.kind) {
    case "organization":
      return role.id === "org-admin" ? role.name : `${role.name} across ${scope.name}`;
    case "brand":
      return `${role.name} on ${scope.name} and its sites`;
    case "site":
      return `${role.name} on ${scope.name}`;
  }
};

/** Where a grant or an override applies, such as "City Libraries and all its sites". */
export const describeScope = (scope: NamedScope) => {
  switch (scope.kind) {
    case "organization":
      return `Everywhere in ${scope.name}`;
    case "brand":
      return `${scope.name} and all its sites`;
    case "site":
      return `${scope.name} only`;
  }
};
