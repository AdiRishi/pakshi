import { D1Client } from "@effect/sql-d1";
import { accountsBasePath, authBasePath } from "@repo/contracts/accounts";
import { agentBasePath } from "@repo/contracts/agent";
import { liveBasePath } from "@repo/contracts/live";
import { objectKeys, routingKeys } from "@repo/contracts/snapshot";
import {
  brandMediaBasePath,
  mediaUploadPath,
  previewBasePath,
  reviewBasePath,
  siteMediaBasePath,
} from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { WorkerEntrypoint } from "cloudflare:workers";
import { Effect } from "effect";
import { getServerByName } from "partyserver";

import { serveAccounts } from "./accounts.ts";
import { serveAgent } from "./agent/route.ts";
import { authFor } from "./auth.ts";
import { collectBlockUsage } from "./blocks.ts";
import { offerMissedRevisions } from "./brand-updates.ts";
import { purgeDeletedSites } from "./deletion.ts";
import { checkDomains, routedHost } from "./domains.ts";
import { eraseSite } from "./erase.ts";
import { serveLive } from "./live.ts";
import { retainImages } from "./media-retention.ts";
import {
  serveBrandMedia,
  servePreviewMedia,
  serveReviewMedia,
  serveSiteMedia,
  serveUpload,
} from "./media.ts";
import { reconcileSites } from "./reconcile.ts";
import { serveStudioRpc } from "./rpc.ts";
import { schedules } from "./schedules.ts";

export { SiteAgent } from "./site-agent.ts";
export { SiteDoc } from "./site-doc.ts";

/** Studio's calls to studio-api, as the StudioRpcs contract defines them. */
export class StudioRpc extends WorkerEntrypoint<StudioApiEnv> {
  override fetch(request: Request) {
    return serveStudioRpc(request, this.env);
  }
}

/**
 * Sign-in and making accounts, which Studio forwards unchanged for their
 * cookies, the editor's live connections, conversations with
 * the agent, and the images of drafts, submissions, sites and brands. studio-api has no public address;
 * only Studio's service bindings reach it.
 */
export default class StudioApi extends WorkerEntrypoint<StudioApiEnv> {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${authBasePath}/`))
      return authFor(this.env, url.origin).handler(request);
    if (url.pathname.startsWith(`${accountsBasePath}/`)) return serveAccounts(request, this.env);
    if (url.pathname.startsWith(`${liveBasePath}/`)) return serveLive(request, this.env);
    if (url.pathname.startsWith(`${agentBasePath}/`)) return serveAgent(request, this.env);
    if (url.pathname === mediaUploadPath) return serveUpload(request, this.env);
    if (request.method === "GET" && url.pathname.startsWith(`${previewBasePath}/`))
      return servePreviewMedia(request, this.env);
    if (request.method === "GET" && url.pathname.startsWith(`${reviewBasePath}/`))
      return serveReviewMedia(request, this.env);
    if (request.method === "GET" && url.pathname.startsWith(`${brandMediaBasePath}/`))
      return serveBrandMedia(request, this.env);
    if (request.method === "GET" && url.pathname.startsWith(`${siteMediaBasePath}/`))
      return serveSiteMedia(request, this.env);
    return Response.json({ code: "not_found", message: "Route not found." }, { status: 404 });
  }

  /**
   * The scheduled jobs, on the schedules infra sets. Often: the reconcile
   * job, offering brand revisions again to sites that missed them, and asking
   * sites that haven't reported their block versions for them, and checking
   * waiting domains. Daily: keeping
   * library images while they're used, and deleting for good the sites
   * deleted 30 days ago.
   */
  override async scheduled(controller: ScheduledController) {
    if (controller.cron === schedules.daily) {
      const deleted = await Effect.runPromise(
        retainImages(
          (site) =>
            Effect.tryPromise(async () =>
              (await (await getServerByName(this.env.SITE_DOC, site)).imagesInUse()).map(
                ({ media }) => media,
              ),
            ),
          (media) => Effect.promise(() => this.env.CONTENT.delete(objectKeys.media(media))),
        ).pipe(Effect.provide(D1Client.layer({ db: this.env.CORE }))),
      );
      if (deleted.length > 0) console.info("Deleted library images nothing used", deleted);
      const purged = await Effect.runPromise(
        purgeDeletedSites(
          (site) => eraseSite(this.env, site),
          (media) => Effect.promise(() => this.env.CONTENT.delete(objectKeys.media(media))),
        ).pipe(Effect.provide(D1Client.layer({ db: this.env.CORE }))),
      );
      if (purged.length > 0) console.info("Deleted sites for good after 30 days", purged);
      return;
    }
    const [reconciled, offered] = await Effect.runPromise(
      Effect.all([
        reconcileSites(
          (site) => this.env.ROUTING.get(routingKeys.site(site)),
          (site) =>
            Effect.promise(async () =>
              (await getServerByName(this.env.SITE_DOC, site)).reconcile(),
            ),
        ),
        offerMissedRevisions(this.env),
        checkDomains(undefined, (hostname, site) =>
          Effect.promise(() =>
            this.env.ROUTING.put(routingKeys.host(routedHost(hostname, this.env.SITES_HOST)), site),
          ),
        ),
        collectBlockUsage((site) =>
          Effect.tryPromise(async () =>
            (await getServerByName(this.env.SITE_DOC, site)).reportBlocks(),
          ),
        ),
      ]).pipe(Effect.provide(D1Client.layer({ db: this.env.CORE }))),
    );
    if (reconciled.length > 0)
      console.warn("KV didn't serve the live release, so SiteDoc wrote it again", reconciled);
    if (offered.length > 0)
      console.warn(
        "Sites hadn't taken their brand's newest revision, so it was offered again",
        offered,
      );
  }
}
