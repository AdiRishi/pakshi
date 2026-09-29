import type { SitesEnv } from "@repo/infra/worker-bindings";

import type { LiveSite } from "./lib/snapshot.ts";

declare global {
  namespace Cloudflare {
    interface Env extends SitesEnv {}
  }
  namespace App {
    interface Locals {
      cfContext: ExecutionContext;
      /** The site for this request's host and its live release, set by the middleware. */
      site: LiveSite;
    }
  }
}

export {};
