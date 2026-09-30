import { BatchId, type DraftId, randomId, type SiteId } from "@repo/contracts/ids";
import type { Op } from "@repo/contracts/ops";

import { applyBatch } from "./functions";

/** Sends ops to a draft as one batch, with a new batch ID. */
export const sendBatch = (site: SiteId, draft: DraftId, ops: ReadonlyArray<Op>) =>
  applyBatch({ data: { site, draft, batch: { id: BatchId.make(randomId("bat")), ops } } });
