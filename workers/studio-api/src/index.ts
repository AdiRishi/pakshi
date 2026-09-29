import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { WorkerEntrypoint } from "cloudflare:workers";

import { authBasePath, authFor } from "./auth.ts";
import { mediaBasePath, serveMedia } from "./media.ts";
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
 * redirects and cookies, and images for the editor's canvas. studio-api has
 * no public address; only Studio's service bindings reach it.
 */
export default class StudioApi extends WorkerEntrypoint<StudioApiEnv> {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${authBasePath}/`))
      return authFor(this.env, url.origin).handler(request);
    if (request.method === "GET" && url.pathname.startsWith(`${mediaBasePath}/`))
      return serveMedia(request, this.env);
    return Response.json({ code: "not_found", message: "Route not found." }, { status: 404 });
  }
}
