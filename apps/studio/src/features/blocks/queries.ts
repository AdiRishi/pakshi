import type { SiteId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import { getBlockCatalog, getSiteBlocks } from "./functions";

export const blockCatalogQuery = queryOptions({
  queryKey: ["blocks"],
  queryFn: () => getBlockCatalog(),
});

export const siteBlocksQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "blocks"],
    queryFn: () => getSiteBlocks({ data: { site } }),
  });
