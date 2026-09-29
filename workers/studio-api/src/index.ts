import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { WorkerEntrypoint } from "cloudflare:workers";

import { authBasePath, authFor } from "./auth.ts";
import { describeViewer } from "./viewer.ts";

export { SiteAgent } from "./site-agent.ts";
export { SiteDoc } from "./site-doc.ts";
export type { Viewer } from "./viewer.ts";

/** Studio's API. Studio reaches it only over its service binding, never from the internet. */
export default class StudioApi extends WorkerEntrypoint<StudioApiEnv> {
  override async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(`${authBasePath}/`))
      return authFor(this.env, url.origin).handler(request);
    return Response.json({ code: "not_found", message: "Route not found." }, { status: 404 });
  }

  /** The signed-in person for a Studio request, or null when the session is missing or expired. */
  async viewer(origin: string, cookie: string) {
    const session = await authFor(this.env, origin).api.getSession({
      headers: new Headers({ cookie }),
    });
    return session === null ? null : describeViewer(this.env, session.user);
  }
}
