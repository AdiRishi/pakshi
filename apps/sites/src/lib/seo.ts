import { entriesOf } from "@repo/contracts/collections";
import { pageName, type PageDocument, type PagePath } from "@repo/contracts/page";
import { MediaRef, type Link } from "@repo/contracts/references";
import { entryAddress, type PageListing, type SnapshotManifest } from "@repo/contracts/snapshot";
import { Predicate, Schema } from "effect";

/*
 * What `sites` tells search engines, feed readers and link previews about a
 * site: each page's sharing card, where a redirect goes, the sitemap,
 * robots.txt and each blog's feed. Everything comes from the live snapshot.
 */

type Collection = Extract<PageListing, { readonly type: "collection" }>;

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
    (page.type === "entry" ? page.meta.cover : undefined) ??
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

/**
 * The meta tags a page's head holds for search engines and link previews,
 * from the page and its listing in the manifest, which holds its address.
 */
export const pageMeta = (
  page: PageDocument,
  listing: PageListing,
  manifest: SnapshotManifest,
  origin: string,
) => {
  const image = sharingImageOf(page, manifest);
  const file = image === undefined ? undefined : manifest.media[image.id];
  return {
    canonical: page.meta.canonical ?? `${origin}${listing.path}`,
    noindex: page.meta.noindex === true,
    type: page.type === "entry" ? "article" : "website",
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

/**
 * Where an address that no page has sends visitors, or null when it doesn't.
 * A redirect from a blog's old address also covers its posts there: when
 * `/news` redirects to a blog, `/news/{slug}` goes to that blog's post with
 * the slug, wherever the blog is now.
 */
export const redirectFor = (manifest: SnapshotManifest, path: PagePath) => {
  const to: Link | undefined = manifest.redirects[path];
  if (to !== undefined)
    return Predicate.isString(to)
      ? to
      : (manifest.pages.find((page) => page.id === to.id)?.path ?? null);
  const slash = path.lastIndexOf("/");
  const slug = path.slice(slash + 1);
  const parent = manifest.redirects[slash === 0 ? "/" : path.slice(0, slash)];
  if (slug === "" || parent === undefined || Predicate.isString(parent)) return null;
  const blog = manifest.pages.find((page) => page.id === parent.id);
  if (blog?.type !== "collection") return null;
  const address = entryAddress(blog.path, slug);
  const post = manifest.pages.find(
    (page) => page.type === "entry" && page.collection === blog.id && page.path === address,
  );
  return post?.path ?? null;
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

/** The address of a blog's feed, just below the blog's own. */
export const feedAddress = (blog: PagePath) => (blog === "/" ? "/rss.xml" : `${blog}/rss.xml`);

/** A feed holds a blog's newest posts, as many as feed readers usually fetch. */
const feedLength = 50;

const rfc822 = (date: string) => new Date(`${date}T00:00:00Z`).toUTCString();

/**
 * A blog's RSS feed: its newest served posts in the blog's order. Each post's
 * guid is its page ID, so moving the blog doesn't show its posts again as new.
 */
export const collectionFeed = (
  manifest: SnapshotManifest,
  collection: Collection,
  origin: string,
) => {
  const entries = entriesOf(manifest.pages, collection).slice(0, feedLength);
  const name = pageName(collection);
  const site = manifest.settings.name;
  const title = name === site ? name : `${name} · ${site}`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    `<channel><title>${escapeXml(title)}</title><link>${escapeXml(`${origin}${collection.path}`)}</link><description>${escapeXml(collection.meta.description)}</description>`,
    ...entries.map(
      (entry) =>
        `<item><title>${escapeXml(entry.meta.title)}</title><link>${escapeXml(`${origin}${entry.path}`)}</link><guid isPermaLink="false">${entry.id}</guid><pubDate>${rfc822(entry.meta.date)}</pubDate><description>${escapeXml(entry.meta.excerpt)}</description></item>`,
    ),
    "</channel>",
    "</rss>",
  ].join("\n");
};

export const robots = (origin: string) =>
  ["User-agent: *", "Allow: /", `Sitemap: ${origin}/sitemap.xml`, ""].join("\n");
