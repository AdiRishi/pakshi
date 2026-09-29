import type { SiteId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import { getEditorDraft, getSitePages } from "./functions";

export const sitePagesQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "pages"],
    queryFn: () => getSitePages({ data: { site } }),
  });

export const editorDraftQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "draft"],
    queryFn: () => getEditorDraft({ data: { site } }),
    // The editor keeps its own copy of the draft once it's open.
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
