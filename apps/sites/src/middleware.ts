import type { APIContext, MiddlewareNext } from "astro";
import { defineMiddleware } from "astro:middleware";
import { env } from "cloudflare:workers";

import { takeFormPost } from "./lib/forms.ts";
import { serveMedia } from "./lib/media.ts";
import { pageCacheKey } from "./lib/page-cache.ts";
import { secured } from "./lib/security.ts";
import { liveSiteFor } from "./lib/snapshot.ts";

const browserCaching = "public, max-age=0, must-revalidate";
const mediaPrefix = "/_media/";

/**
 * Finds the site for the request's host and serves its pages from the
 * Workers cache, and passes form posts on to sites-api. Only reads are
 * cached. Every response carries the headers that limit what the browser
 * loads with it.
 */
export const onRequest = defineMiddleware(async (context, next) =>
  secured(await serve(context, next)),
);

const serve = async (context: APIContext, next: MiddlewareNext) => {
  // Page paths are lowercase letters, digits and hyphens, so no page can take this prefix.
  if (context.url.pathname.startsWith(mediaPrefix))
    return serveMedia(context.request, (promise) => context.locals.cfContext.waitUntil(promise));
  const site = await liveSiteFor(context.url.host);
  if (site === null) return new Response("There is no site at this address.", { status: 404 });

  context.locals.site = site;
  if (context.request.method === "POST") return takeFormPost(context.request, site);
  const reading = context.request.method === "GET" || context.request.method === "HEAD";
  // A page that thanks someone for sending a form is theirs alone.
  if (!reading || context.url.searchParams.has("sent")) return next();

  const key = new Request(
    pageCacheKey({
      url: context.url,
      release: site.live.release,
      worker: env.CF_VERSION_METADATA.id,
    }),
  );
  const cache = await caches.open("pages");
  const cached = await cache.match(key);
  if (cached !== undefined) {
    const hit = new Response(cached.body, cached);
    hit.headers.set("cache-control", browserCaching);
    hit.headers.set("x-pakshi-cache", "hit");
    return hit;
  }

  const rendered = await next();
  const response = new Response(rendered.body, rendered);
  response.headers.set("cache-control", browserCaching);
  response.headers.set("x-pakshi-cache", "miss");
  if (response.status === 200 && context.request.method === "GET") {
    const stored = response.clone();
    stored.headers.set("cache-control", "public, max-age=86400");
    context.locals.cfContext.waitUntil(cache.put(key, stored));
  }
  return response;
};
