import { DraftId, type SiteId } from "@repo/contracts/ids";
import { routingKeys } from "@repo/contracts/snapshot";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Effect } from "effect";
import { getServerByName } from "partyserver";

import { conversationName } from "./agent/services.ts";

/** Deletes every object in a bucket under a prefix. */
const deletePrefix = async (bucket: R2Bucket, prefix: string) => {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list(cursor === undefined ? { prefix } : { prefix, cursor });
    if (listed.objects.length > 0) await bucket.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor !== undefined);
};

/**
 * Deletes what a site keeps outside D1: its SiteDoc's, SiteSubmissions' and
 * agent conversations' storage, its snapshots and the documents attached to
 * its conversations in R2, and its live release in KV.
 */
export const eraseSite = (env: StudioApiEnv, site: SiteId) =>
  Effect.promise(async () => {
    const { results } = await env.CORE.prepare(
      "select draft_id, user_id from conversations where site_id = ?",
    )
      .bind(site)
      .run<{ readonly draft_id: string; readonly user_id: string }>();
    for (const conversation of results)
      await (
        await getServerByName(
          env.SITE_AGENT,
          conversationName(site, DraftId.make(conversation.draft_id), conversation.user_id),
        )
      ).erase();
    await (await getServerByName(env.SITE_DOC, site)).erase();
    await env.SITE_SUBMISSIONS.getByName(site).erase();
    await deletePrefix(env.CONTENT, `sites/${site}/`);
    await deletePrefix(env.CONTENT, `sources/${site}/`);
    await env.ROUTING.delete(routingKeys.site(site));
  });
