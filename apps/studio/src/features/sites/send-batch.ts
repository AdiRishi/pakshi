import { BatchId, randomId, type SiteId } from "@repo/contracts/ids";
import type { Op } from "@repo/contracts/ops";

import { applyBatch } from "./functions";

/** Sends ops to the site's draft as one batch, with a new batch ID. */
export const sendBatch = (site: SiteId, ops: ReadonlyArray<Op>) =>
  applyBatch({ data: { site, batch: { id: BatchId.make(randomId("bat")), ops } } });
