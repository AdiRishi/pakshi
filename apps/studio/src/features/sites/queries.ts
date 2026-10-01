import type { DraftId, SiteId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import {
  getDraftPages,
  getNewSiteOptions,
  getSiteDrafts,
  getSiteReleases,
  getSiteSettings,
} from "./functions";

export const newSiteOptionsQuery = queryOptions({
  queryKey: ["new-site"],
  queryFn: () => getNewSiteOptions(),
});

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

export const siteSettingsQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "settings"],
    queryFn: () => getSiteSettings({ data: { site } }),
  });
