import { SiteId } from "@repo/contracts/ids";
import { LiveRelease, routingKeys, snapshotReader } from "@repo/contracts/snapshot";
import { env } from "cloudflare:workers";
import { Schema } from "effect";

export interface LiveSite {
  readonly id: SiteId;
  readonly live: LiveRelease;
}

/** The site served on this host and its live release, or null when the host has no published site. */
export const liveSiteFor = async (host: string): Promise<LiveSite | null> => {
  const site = await env.ROUTING.get(routingKeys.host(host));
  if (site === null) return null;
  const id = Schema.decodeSync(SiteId)(site);
  const live = await env.ROUTING.get(routingKeys.site(id));
  if (live === null) return null;
  return { id, live: Schema.decodeSync(Schema.fromJsonString(LiveRelease))(live) };
};

const snapshots = snapshotReader(async (key) => (await env.CONTENT.get(key))?.text() ?? null);

export const loadManifest = snapshots.manifest;

export const loadPage = snapshots.page;
