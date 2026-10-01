import type { DraftId, SiteId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import { getSubmissionCheck } from "../sites/functions";

/**
 * What submitting a draft now would meet: what the checks find, and who
 * reviews it. A revision asks again once the draft has moved on to it.
 */
export const checkQuery = (site: SiteId, draft: DraftId, revision: number | null = null) =>
  queryOptions({
    queryKey: ["sites", site, "drafts", draft, "submission-check", revision],
    queryFn: () => getSubmissionCheck({ data: { site, draft } }),
    staleTime: 0,
  });
