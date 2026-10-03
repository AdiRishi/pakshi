import type { SnapshotManifest, SnapshotPage } from "@repo/contracts/snapshot";

import { collectionFeed, feedAddress, redirectFor, robots, sitemap } from "./seo.ts";

const blogAt = (manifest: SnapshotManifest, path: string) =>
  manifest.pages.find(
    (page): page is Extract<SnapshotPage, { readonly type: "collection" }> =>
      page.type === "collection" && page.path === path,
  );

/**
 * The feed of the blog at the address before `/rss.xml`, `/rss.xml` alone for
 * a blog at `/`. A blog that moved with a redirect takes its feed's
 * subscribers along.
 */
const feed = (manifest: SnapshotManifest, url: URL) => {
  const path = url.pathname.slice(0, -"/rss.xml".length) || "/";
  const blog = blogAt(manifest, path);
  if (blog !== undefined)
    return new Response(collectionFeed(manifest, blog, url.origin), {
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
    });
  const moved = redirectFor(manifest, path);
  const to = moved === null ? undefined : blogAt(manifest, moved);
  if (to !== undefined) return Response.redirect(`${url.origin}${feedAddress(to.path)}`, 301);
  return new Response("There's no feed at this address.", { status: 404 });
};

/**
 * The documents a site serves beside its pages: robots.txt, the sitemap of
 * every page search engines may list, and each blog's feed. Null for any
 * other address, which is a page's.
 */
export const siteDocument = (manifest: SnapshotManifest, url: URL) => {
  if (url.pathname === "/robots.txt")
    return new Response(robots(url.origin), {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  if (url.pathname === "/sitemap.xml")
    return new Response(sitemap(manifest, url.origin), {
      headers: { "content-type": "application/xml; charset=utf-8" },
    });
  if (url.pathname.endsWith("/rss.xml")) return feed(manifest, url);
  return null;
};
