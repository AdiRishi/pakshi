import type { PageDocument, PagePath } from "@repo/contracts/page";
import { MediaRef, type Link } from "@repo/contracts/references";
import type { SnapshotManifest } from "@repo/contracts/snapshot";
import { Predicate, Schema } from "effect";

/*
 * What `sites` tells search engines and link previews about a site: each
 * page's sharing card, where a redirect goes, the sitemap, robots.txt and the
 * blog's feed. Everything comes from the live snapshot.
 */

const isMediaRef = Schema.is(MediaRef);
const isJsonObject = Schema.is(Schema.JsonObject);

/** The first library image a value holds, wherever it sits in it. */
const firstImage = (value: Schema.Json): MediaRef | undefined => {
  if (isMediaRef(value)) return value;
  const values = Array.isArray(value) ? value : isJsonObject(value) ? Object.values(value) : [];
  for (const inner of values) {
    const found = firstImage(inner);
    if (found !== undefined) return found;
  }
  return undefined;
};

/**
 * The image a shared page shows: its own sharing image, a post's cover, the
 * first image in its first section, or the site's default.
 */
const sharingImageOf = (page: PageDocument, manifest: SnapshotManifest) => {
  const [first] = page.root;
  const hero = first === undefined ? undefined : page.blocks[first];
  return (
    page.meta.image ??
    (page.type === "post" ? page.meta.cover : undefined) ??
    (hero === undefined ? undefined : firstImage(hero.props)) ??
    manifest.settings.sharingImage ??
    undefined
  );
};

const escapeXml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** The meta tags a page's head holds for search engines and link previews. */
export const pageMeta = (page: PageDocument, manifest: SnapshotManifest, origin: string) => {
  const image = sharingImageOf(page, manifest);
  const file = image === undefined ? undefined : manifest.media[image.id];
  return {
    canonical: page.meta.canonical ?? `${origin}${page.path}`,
    noindex: page.meta.noindex === true,
    type: page.type === "post" ? "article" : "website",
    image:
      image === undefined || file === undefined
        ? null
        : {
            src: `${origin}/_media/${image.id}`,
            width: file.width,
            height: file.height,
            alt: image.alt ?? "",
          },
  };
};

/** Where an address that no page has sends visitors, or null when it doesn't. */
export const redirectFor = (manifest: SnapshotManifest, path: PagePath) => {
  const to: Link | undefined = manifest.redirects[path];
  if (to === undefined) return null;
  if (Predicate.isString(to)) return to;
  return manifest.pages.find((page) => page.id === to.id)?.path ?? null;
};

/** The pages search engines may list. */
const listed = (manifest: SnapshotManifest) =>
  manifest.pages.filter((page) => page.meta.noindex !== true);

export const sitemap = (manifest: SnapshotManifest, origin: string) =>
  [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...listed(manifest).map(
      (page) => `<url><loc>${escapeXml(`${origin}${page.path}`)}</loc></url>`,
    ),
    "</urlset>",
  ].join("\n");

export const robots = (origin: string) =>
  ["User-agent: *", "Allow: /", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");

/** The blog's posts as an RSS feed, newest first. */
export const blogFeed = (manifest: SnapshotManifest, origin: string) => {
  const posts = listed(manifest)
    .flatMap((page) => (page.type === "post" ? [page] : []))
    .toSorted((a, b) => (a.meta.date < b.meta.date ? 1 : -1));
  const name = escapeXml(manifest.settings.name);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    `<channel><title>${name}</title><link>${escapeXml(origin)}/</link><description>${name}</description>`,
    ...posts.map(
      (post) =>
        `<item><title>${escapeXml(post.meta.title)}</title><link>${escapeXml(`${origin}${post.path}`)}</link><guid>${escapeXml(`${origin}${post.path}`)}</guid><pubDate>${new Date(`${post.meta.date}T00:00:00Z`).toUTCString()}</pubDate><description>${escapeXml(post.meta.excerpt)}</description></item>`,
    ),
    "</channel>",
    "</rss>",
  ].join("\n");
};
