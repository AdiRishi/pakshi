import type { AuditCursor, AuditQuery } from "@repo/contracts/audit";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

import { getAuditFilters, getAuditLog } from "./functions";

export const auditFiltersQuery = queryOptions({
  queryKey: ["audit-filters"],
  queryFn: () => getAuditFilters(),
});

/** Where the newest page starts: before nothing. */
const newest = (): AuditCursor | null => null;

export const auditLogQuery = (query: AuditQuery) =>
  infiniteQueryOptions({
    queryKey: ["audit-log", query],
    queryFn: ({ pageParam }) => getAuditLog({ data: { query, before: pageParam } }),
    initialPageParam: newest(),
    getNextPageParam: (page) => page.next,
  });
