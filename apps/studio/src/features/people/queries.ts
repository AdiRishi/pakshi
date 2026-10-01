import type { Scope } from "@repo/contracts/access";
import { queryOptions } from "@tanstack/react-query";

import { getPeople, getScopeMembers } from "./functions";

export const peopleQuery = queryOptions({
  queryKey: ["organization-people"],
  queryFn: () => getPeople(),
});

export const scopeMembersQuery = (scope: Scope) =>
  queryOptions({
    queryKey: ["scope-members", scope.kind, scope.kind === "organization" ? null : scope.id],
    queryFn: () => getScopeMembers({ data: { scope } }),
  });
