import type { DraftId, SiteId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import { getDraftPages, getSiteDrafts, getSiteReleases } from "./functions";

export const siteDraftsQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "drafts"],
    queryFn: () => getSiteDrafts({ data: { site } }),
  });

export const draftPagesQuery = (site: SiteId, draft: DraftId) =>
  queryOptions({
    queryKey: ["sites", site, "drafts", draft, "pages"],
    queryFn: () => getDraftPages({ data: { site, draft } }),
  });

export const siteReleasesQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "releases"],
    queryFn: () => getSiteReleases({ data: { site } }),
  });
