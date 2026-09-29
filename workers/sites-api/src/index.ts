import type { SitesApiEnv } from "@repo/infra/worker-bindings";
import { DurableObject } from "cloudflare:workers";

/** One site's form submissions: that site's own customer database. */
export class SiteSubmissions extends DurableObject<SitesApiEnv> {}

export default {
  fetch: () => Response.json({ code: "not_found", message: "Route not found." }, { status: 404 }),
} satisfies ExportedHandler<SitesApiEnv>;
