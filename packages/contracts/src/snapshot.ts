import { Predicate, Schema } from "effect";

import { BrandRevision } from "./brand.ts";
import { FormDefinition } from "./form.ts";
import { BlockType, FormId, MediaId, PageId, ReleaseId, SiteId, SnapshotId } from "./ids.ts";
import { PageDocument, PageMeta, PagePath, PostMeta } from "./page.ts";
import { PublishedSettings } from "./settings.ts";
import { Redirects, SiteParts } from "./site.ts";

/** The SHA-256 of a page object's canonical JSON, in lowercase hex. */
export const ContentHash = Schema.String.check(Schema.isPattern(/^[a-f0-9]{64}$/)).pipe(
  Schema.brand("ContentHash"),
);
export type ContentHash = typeof ContentHash.Type;

/** A stored image. Files never change, so a media ID always renders the same file. */
export const MediaFile = Schema.Struct({
  contentType: Schema.Literals(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  width: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  height: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
});
export type MediaFile = typeof MediaFile.Type;

/** The block version each block type renders at. */
export const Lockfile = Schema.Record(
  BlockType,
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
);
export type Lockfile = typeof Lockfile.Type;

/**
 * A page as a site's page list shows it: enough for menus and blog lists to
 * show titles and post details without loading every page.
 */
export const PageListing = Schema.Union([
  Schema.Struct({ id: PageId, path: PagePath, type: Schema.Literal("page"), meta: PageMeta }),
  Schema.Struct({ id: PageId, path: PagePath, type: Schema.Literal("post"), meta: PostMeta }),
]);
export type PageListing = typeof PageListing.Type;

/** A page's entry in the manifest: its listing, and the page object it's stored as. */
export const SnapshotPage = Schema.Union(
  PageListing.members.map((member) => Schema.Struct({ ...member.fields, object: ContentHash })),
);
export type SnapshotPage = typeof SnapshotPage.Type;

/**
 * Everything that leaves a draft, with the site's published settings as they
 * were when it was frozen: its header, footer, menus,
 * forms, redirects, block lockfile, brand revision and media, plus one entry per page
 * pointing at its content-addressed page object. Snapshots never change once
 * written, so submissions and releases are both pointers to one.
 */
export const SnapshotManifest = Schema.Struct({
  schema: Schema.Literal("pakshi.snapshot/1"),
  id: SnapshotId,
  site: SiteId,
  settings: PublishedSettings,
  parts: SiteParts,
  forms: Schema.Record(FormId, FormDefinition),
  redirects: Redirects,
  lockfile: Lockfile,
  brand: BrandRevision,
  media: Schema.Record(MediaId, MediaFile),
  pages: Schema.Array(SnapshotPage),
  /** Page objects of unpublished pages, which `sites` never reads, kept so a later draft can publish them again. */
  unpublished: Schema.Array(ContentHash),
  /** Addresses of unpublished and deleted pages, which answer 410 Gone. */
  gone: Schema.Array(PagePath),
});
export type SnapshotManifest = typeof SnapshotManifest.Type;

/** The value `sites` reads for `site:{siteId}` in KV: the live release and its snapshot. */
export const LiveRelease = Schema.Struct({ release: ReleaseId, snapshot: SnapshotId });
export type LiveRelease = typeof LiveRelease.Type;

export const routingKeys = {
  host: (hostname: string) => `host:${hostname.toLowerCase()}`,
  site: (site: SiteId) => `site:${site}`,
};

export const objectKeys = {
  manifest: (site: SiteId, snapshot: SnapshotId) => `sites/${site}/snapshots/${snapshot}.json`,
  page: (site: SiteId, hash: ContentHash) => `sites/${site}/pages/${hash}.json`,
  media: (media: MediaId) => `media/${media}`,
};

const sortedKeys = (_key: string, value: Schema.Json) =>
  Predicate.isObject(value)
    ? Object.fromEntries(Object.entries(value).toSorted(([a], [b]) => (a < b ? -1 : 1)))
    : value;

/** Hashes a page object's JSON with its keys sorted, so equal pages share one object. */
export const contentHash = async (value: Schema.Json) => {
  const json = JSON.stringify(value, sortedKeys);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
  return ContentHash.make(hex.join(""));
};

/**
 * Reads a site's snapshots from storage through `read`, which returns an
 * object's text or null when it's missing. A snapshot is complete once
 * written, so a missing object is an error.
 */
export const snapshotReader = (read: (key: string) => Promise<string | null>) => {
  const readObject = async (key: string) => {
    const text = await read(key);
    if (text === null) throw new Error(`${key} is missing from the content bucket.`);
    return text;
  };
  return {
    manifest: async (site: SiteId, snapshot: SnapshotId) =>
      Schema.decodeSync(Schema.fromJsonString(SnapshotManifest))(
        await readObject(objectKeys.manifest(site, snapshot)),
      ),
    page: async (site: SiteId, hash: ContentHash) =>
      Schema.decodeSync(Schema.fromJsonString(PageDocument))(
        await readObject(objectKeys.page(site, hash)),
      ),
  };
};
