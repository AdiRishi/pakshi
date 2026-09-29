import { SiteId, type SnapshotId } from "@repo/contracts/ids";
import { PageDocument } from "@repo/contracts/page";
import {
  ContentHash,
  LiveRelease,
  objectKeys,
  routingKeys,
  SnapshotManifest,
} from "@repo/contracts/snapshot";
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

const readObject = async (key: string) => {
  const object = await env.CONTENT.get(key);
  if (object === null) throw new Error(`${key} is missing from R2.`);
  return object.text();
};

export const loadManifest = async (site: SiteId, snapshot: SnapshotId) =>
  Schema.decodeSync(Schema.fromJsonString(SnapshotManifest))(
    await readObject(objectKeys.manifest(site, snapshot)),
  );

export const loadPage = async (site: SiteId, hash: ContentHash) =>
  Schema.decodeSync(Schema.fromJsonString(PageDocument))(
    await readObject(objectKeys.page(site, hash)),
  );
