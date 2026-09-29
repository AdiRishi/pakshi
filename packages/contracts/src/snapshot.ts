import { ResolvedTheme } from "@repo/tokens";
import { Predicate, Schema } from "effect";

import { FormDefinition } from "./form.ts";
import { BlockType, FormId, MediaId, PageId, ReleaseId, SiteId, SnapshotId } from "./ids.ts";
import { PageMeta, PagePath, PostMeta } from "./page.ts";
import { SiteParts, SiteSettings } from "./site.ts";

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

const snapshotPageFields = { id: PageId, path: PagePath, object: ContentHash };

/**
 * A page's entry in the manifest. It carries the page's meta, so menus and
 * blog lists can show titles and post details without loading every page.
 */
export const SnapshotPage = Schema.Union([
  Schema.Struct({ ...snapshotPageFields, type: Schema.Literal("page"), meta: PageMeta }),
  Schema.Struct({ ...snapshotPageFields, type: Schema.Literal("post"), meta: PostMeta }),
]);
export type SnapshotPage = typeof SnapshotPage.Type;

/**
 * Everything that leaves a draft: the site's settings, header, footer, menus,
 * forms, block lockfile, resolved theme and media, plus one entry per page
 * pointing at its content-addressed page object. Snapshots never change once written, so previews, submissions
 * and releases are all pointers to one.
 */
export const SnapshotManifest = Schema.Struct({
  schema: Schema.Literal("pakshi.snapshot/1"),
  id: SnapshotId,
  site: SiteId,
  settings: SiteSettings,
  parts: SiteParts,
  forms: Schema.Record(FormId, FormDefinition),
  lockfile: Lockfile,
  theme: ResolvedTheme,
  media: Schema.Record(MediaId, MediaFile),
  pages: Schema.Array(SnapshotPage),
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
