import type { LiveSettings } from "@repo/contracts/settings";
import type { SitesApiEnv } from "@repo/infra/worker-bindings";
import { DurableObject } from "cloudflare:workers";

/** One site's form submissions: that site's own customer database. */
export class SiteSubmissions extends DurableObject<SitesApiEnv> {
  /** Takes the site's settings that take effect at once, as its SiteDoc last saved them. */
  configure(settings: LiveSettings) {
    this.ctx.storage.kv.put("settings", settings);
  }
}

export default {
  fetch: () => Response.json({ code: "not_found", message: "Route not found." }, { status: 404 }),
} satisfies ExportedHandler<SitesApiEnv>;
