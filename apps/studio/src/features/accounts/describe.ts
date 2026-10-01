import { type DefaultRole, roleTitles } from "@repo/contracts/access";
import type { NamedScope } from "@repo/contracts/accounts";

/** A role where it applies, such as "Editor on Northbank Libraries" or "Org admin". */
export const describeGrant = (role: DefaultRole, scope: NamedScope) => {
  switch (scope.kind) {
    case "organization":
      return role === "org-admin" ? roleTitles[role] : `${roleTitles[role]} across ${scope.name}`;
    case "brand":
      return `${roleTitles[role]} on ${scope.name} and its sites`;
    case "site":
      return `${roleTitles[role]} on ${scope.name}`;
  }
};
