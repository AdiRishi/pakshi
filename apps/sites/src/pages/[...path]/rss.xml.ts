import type { SnapshotManifest, SnapshotPage } from "@repo/contracts/snapshot";
import type { APIRoute } from "astro";

import { collectionFeed, feedAddress, redirectFor } from "../../lib/seo.ts";
import { loadManifest } from "../../lib/snapshot.ts";

const blogAt = (manifest: SnapshotManifest, path: string) =>
  manifest.pages.find(
    (page): page is Extract<SnapshotPage, { readonly type: "collection" }> =>
      page.type === "collection" && page.path === path,
  );

/**
 * The feed of the blog at the address above, `/rss.xml` for a blog at `/`.
 * A blog that moved with a redirect takes its feed's subscribers along.
 */
export const GET: APIRoute = async ({ locals, params, redirect, url }) => {
  const manifest = await loadManifest(locals.site.id, locals.site.live.snapshot);
  const path = `/${params.path ?? ""}`;
  const blog = blogAt(manifest, path);
  if (blog !== undefined)
    return new Response(collectionFeed(manifest, blog, url.origin), {
      headers: { "content-type": "application/rss+xml; charset=utf-8" },
    });
  const moved = redirectFor(manifest, path);
  const to = moved === null ? undefined : blogAt(manifest, moved);
  if (to !== undefined) return redirect(feedAddress(to.path), 301);
  return new Response("There's no feed at this address.", { status: 404 });
};
