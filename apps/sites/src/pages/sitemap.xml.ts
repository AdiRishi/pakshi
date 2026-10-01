import type { APIRoute } from "astro";

import { sitemap } from "../lib/seo.ts";
import { loadManifest } from "../lib/snapshot.ts";

/** Every page search engines may list, as the live release has them. */
export const GET: APIRoute = async ({ locals, url }) => {
  const manifest = await loadManifest(locals.site.id, locals.site.live.snapshot);
  return new Response(sitemap(manifest, url.origin), {
    headers: { "content-type": "application/xml; charset=utf-8" },
  });
};
