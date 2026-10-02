import { loadBlocks } from "@repo/blocks";
import type { Lockfile } from "@repo/contracts/snapshot";
import { queryOptions } from "@tanstack/react-query";

/** The block versions a lockfile pins, loaded once. */
export const blocksQuery = (lockfile: Lockfile) =>
  queryOptions({
    queryKey: ["blocks", lockfile],
    queryFn: () => loadBlocks(lockfile),
    staleTime: Number.POSITIVE_INFINITY,
  });
