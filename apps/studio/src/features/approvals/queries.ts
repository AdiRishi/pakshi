import type { SiteId, SubmissionId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import { getApprovals, getHome, getReview } from "../sites/functions";

export const approvalsQuery = queryOptions({
  queryKey: ["approvals"],
  queryFn: () => getApprovals(),
});

export const reviewQuery = (site: SiteId, submission: SubmissionId) =>
  queryOptions({
    queryKey: ["approvals", site, submission],
    queryFn: () => getReview({ data: { site, submission } }),
  });

export const homeQuery = queryOptions({
  queryKey: ["home"],
  queryFn: () => getHome(),
});
