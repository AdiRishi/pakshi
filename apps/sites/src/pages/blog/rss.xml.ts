import type { APIRoute } from "astro";

import { blogFeed } from "../../lib/seo.ts";
import { loadManifest } from "../../lib/snapshot.ts";

/** The site's blog posts, newest first. */
export const GET: APIRoute = async ({ locals, url }) => {
  const manifest = await loadManifest(locals.site.id, locals.site.live.snapshot);
  return new Response(blogFeed(manifest, url.origin), {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
};
