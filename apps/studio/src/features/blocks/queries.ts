import type { BlockType, SiteId } from "@repo/contracts/ids";
import { queryOptions } from "@tanstack/react-query";

import { getBlockCatalog, getBlockRequests, getBlockUsage, getSiteBlocks } from "./functions";

export const blockCatalogQuery = queryOptions({
  queryKey: ["blocks"],
  queryFn: () => getBlockCatalog(),
});

export const blockUsageQuery = (type: BlockType) =>
  queryOptions({
    queryKey: ["blocks", type, "usage"],
    queryFn: () => getBlockUsage({ data: { type } }),
  });

export const siteBlocksQuery = (site: SiteId) =>
  queryOptions({
    queryKey: ["sites", site, "blocks"],
    queryFn: () => getSiteBlocks({ data: { site } }),
  });

export const blockRequestsQuery = queryOptions({
  queryKey: ["block-requests"],
  queryFn: () => getBlockRequests(),
});
