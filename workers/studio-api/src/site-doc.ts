import type { StudioApiEnv } from "@repo/infra/worker-bindings";
import { Server } from "partyserver";

/**
 * A site's drafts, submissions and live release, edited live by people and the agent.
 *
 * PartyServer requires its env to extend the global `Cloudflare.Env`. Other
 * Workers' programs include this file through the binding types and declare
 * their own global env, so the intersection keeps the constraint true in all of
 * them; in this Worker it is just StudioApiEnv.
 */
export class SiteDoc extends Server<StudioApiEnv & Cloudflare.Env> {
  static override options = { hibernate: true };
}
