import { D1Client } from "@effect/sql-d1";
import { agentBasePath } from "@repo/contracts/agent";
import { liveBasePath } from "@repo/contracts/live";
import { routingKeys } from "@repo/contracts/snapshot";
import { previewBasePath, reviewBasePath } from "@repo/contracts/studio";
import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { WorkerEntrypoint } from "cloudflare:workers";
import { Effect } from "effect";
import { getServerByName } from "partyserver";

import { serveAgent } from "./agent/route.ts";
import { authBasePath, authFor } from "./auth.ts";
import { serveLive } from "./live.ts";
import { servePreviewMedia, serveReviewMedia } from "./media.ts";
import { reconcileSites } from "./reconcile.ts";
import { serveStudioRpc } from "./rpc.ts";

export { SiteAgent } from "./site-agent.ts";
export { SiteDoc } from "./site-doc.ts";

/** Studio's calls to studio-api, as the StudioRpcs contract defines them. */
export class StudioRpc extends WorkerEntrypoint<StudioApiEnv> {
  override fetch(request: Request) {
    return serveStudioRpc(request, this.env);
  }
}

/**
 * Sign-in, which Studio forwards unchanged because OAuth needs real HTTP
 * redirects and cookies, the editor's live connections, conversations with
 * the agent, and the images of drafts and submissions. studio-api has no public address;
 * only Studio's service bindings reach it.
 */
export default class StudioApi extends WorkerEntrypoint<StudioApiEnv> {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${authBasePath}/`))
      return authFor(this.env, url.origin).handler(request);
    if (url.pathname.startsWith(`${liveBasePath}/`)) return serveLive(request, this.env);
    if (url.pathname.startsWith(`${agentBasePath}/`)) return serveAgent(request, this.env);
    if (request.method === "GET" && url.pathname.startsWith(`${previewBasePath}/`))
      return servePreviewMedia(request, this.env);
    if (request.method === "GET" && url.pathname.startsWith(`${reviewBasePath}/`))
      return serveReviewMedia(request, this.env);
    return Response.json({ code: "not_found", message: "Route not found." }, { status: 404 });
  }

  /** The reconcile job, on the cron schedule infra sets. */
  override async scheduled() {
    const reconciled = await Effect.runPromise(
      reconcileSites(
        (site) => this.env.ROUTING.get(routingKeys.site(site)),
        (site) =>
          Effect.promise(async () => (await getServerByName(this.env.SITE_DOC, site)).reconcile()),
      ).pipe(Effect.provide(D1Client.layer({ db: this.env.CORE }))),
    );
    if (reconciled.length > 0)
      console.warn("KV didn't serve the live release, so SiteDoc wrote it again", reconciled);
  }
}
