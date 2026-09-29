import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

import { serveMedia } from "./lib/media.ts";
import { liveSiteFor } from "./lib/snapshot.ts";

const browserCaching = "public, max-age=0, must-revalidate";
const mediaPrefix = "/_media/";

/**
 * Finds the site for the request's host and serves its pages from the
 * Workers cache. The key holds the release and this Worker's version, so a
 * publish or a deploy changes the key instead of needing a purge.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  // Page paths are lowercase letters, digits and hyphens, so no page can take this prefix.
  if (context.url.pathname.startsWith(mediaPrefix))
    return serveMedia(context.url.pathname.slice(mediaPrefix.length));
  const site = await liveSiteFor(context.url.host);
  if (site === null) return new Response("There is no site at this address.", { status: 404 });

  const key = new Request(
    `https://page-cache.pakshi/${site.live.release}/${env.CF_VERSION_METADATA.id}${context.url.pathname}`,
  );
  const cache = await caches.open("pages");
  const cached = await cache.match(key);
  if (cached !== undefined) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("cache-control", browserCaching);
    hit.headers.set("x-pakshi-cache", "hit");
    return hit;
  }

  context.locals.site = site;
  const rendered = await next();
  const response = new Response(rendered.body, rendered);
  response.headers.set("cache-control", browserCaching);
  response.headers.set("x-pakshi-cache", "miss");
  if (response.status === 200) {
    const stored = response.clone();
    stored.headers.set("cache-control", "public, max-age=86400");
    context.locals.cfContext.waitUntil(cache.put(key, stored));
  }
  return response;
});
